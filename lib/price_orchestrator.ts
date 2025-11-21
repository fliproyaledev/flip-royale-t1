// lib/price_orchestrator.ts

import { TOKEN_MAP, buildDexscreenerViewUrl, parseDexscreenerLink } from './tokens'
import type { Token } from './tokens'
import type { DexscreenerQuote } from './dexscreener'
import { getDexPairQuoteStrict, buildPairViewUrl } from './dexscreener'
import { getGeckoPoolQuote } from './gecko'

export type CachedPrice = {
  tokenId: string
  symbol: string
  pLive: number
  p0: number
  changePct?: number
  fdv?: number
  ts: string
  source: 'dexscreener' | 'gecko'
  dexNetwork: string
  dexPair: string
  dexUrl?: string
}

type PairSpec = {
  tokenId: string
  symbol: string
  network: string
  pair: string
}

function deriveBaseline(currentPrice: number, changePct?: number): number {
  if (!isFinite(changePct) || changePct <= -100 || changePct === 0) {
    return currentPrice
  }
  const baseline = currentPrice / (1 + changePct / 100)
  return baseline > 0 ? baseline : currentPrice
}

function getExplicitPair(token: Token): PairSpec | null {
  const network = (token.dexscreenerNetwork || 'base').toLowerCase()

  let pair = (token.dexscreenerPair || '').toLowerCase()

  if (!pair) {
    const parsed = parseDexscreenerLink(token.dexscreenerUrl)
    if (parsed.pair) {
      pair = parsed.pair.toLowerCase()
    }
  }

  if (!pair) return null

  return {
    tokenId: token.id,
    symbol: token.symbol,
    network,
    pair
  }
}

class PriceOrchestrator {
  private started = false
  private interval: NodeJS.Timeout | null = null
  private cache = new Map<string, CachedPrice>()
  private pairs: PairSpec[] = []
  private intervalMs = 60_000

  start() {
    if (this.started) return
    this.started = true

    const envMs = Number(process.env.PRICE_POLL_INTERVAL_MS || NaN)
    if (Number.isFinite(envMs) && envMs >= 15_000) {
      this.intervalMs = Math.floor(envMs)
    }

    this.pairs = Object.values(TOKEN_MAP)
      .map(getExplicitPair)
      .filter((x): x is PairSpec => !!x)

    // Warm-up
    this.poll().catch(() => {})

    // Continuous polling
    this.interval = setInterval(() => {
      this.poll().catch(() => {})
    }, this.intervalMs)
  }

  stop() {
    if (this.interval) clearInterval(this.interval)
    this.interval = null
    this.started = false
  }

  getOne(tokenId: string): CachedPrice | null {
    return this.cache.get(tokenId) || null
  }

  getAll(): CachedPrice[] {
    return Array.from(this.cache.values())
  }

  /**
   * Yeni poll:
   *  - Tokenleri network'e göre grupla
   *  - Her network için tek bir Dexscreener multi-fetch isteği yap
   *  - Gerekirse token bazında eski tekli fallback'lere dön
   */
  private async poll(): Promise<void> {
    if (!this.pairs.length) return

    const byNetwork: Record<string, PairSpec[]> = {}

    for (const spec of this.pairs) {
      if (!byNetwork[spec.network]) byNetwork[spec.network] = []
      byNetwork[spec.network].push(spec)
    }

    await Promise.all(
      Object.entries(byNetwork).map(([network, specs]) =>
        this.pollNetworkBatch(network, specs)
      )
    )
  }

  /**
   * Belirli bir network için multi-fetch + gerektiğinde per-token fallback
   */
  private async pollNetworkBatch(network: string, specs: PairSpec[]): Promise<void> {
    const pairs = specs.map((s) => s.pair).join(',')

    const url = `https://api.dexscreener.com/latest/dex/pairs/${network}/${pairs}`

    let byPair = new Map<string, any>()

    try {
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`Dexscreener multi-fetch failed: ${res.status}`)
      }

      const data = await res.json()

      for (const p of data.pairs ?? []) {
        const key = (p.pairAddress || '').toLowerCase()
        if (!key) continue
        byPair.set(key, p)
      }
    } catch (err) {
      console.error('Dexscreener batch error', err)
      // Batch komple çökerse → hepsini tek tek eski mantıkla dene
      for (const spec of specs) {
        await this.pollOneSingle(spec)
      }
      return
    }

    const nowIso = new Date().toISOString()

    for (const spec of specs) {
      const raw = byPair.get(spec.pair)

      if (raw && raw.priceUsd) {
        // Dexscreener batch'ten başarılı gelenler
        const price = Number(raw.priceUsd)
        if (isFinite(price) && price > 0) {
          const changePct =
            raw.priceChange && typeof raw.priceChange.h24 !== 'undefined'
              ? Number(raw.priceChange.h24)
              : undefined

          const baseline = deriveBaseline(price, changePct)

          const entry: CachedPrice = {
            tokenId: spec.tokenId,
            symbol: spec.symbol,
            pLive: price,
            p0: baseline,
            changePct,
            fdv: raw.fdv != null ? Number(raw.fdv) : undefined,
            ts: nowIso,
            source: 'dexscreener',
            dexNetwork: network,
            dexPair: spec.pair,
            dexUrl: raw.url || buildPairViewUrl({ network, pair: spec.pair })
          }

          this.cache.set(spec.tokenId, entry)
          continue
        }
      }

      // Eğer batch'te o pair yoksa / price null geldiyse → eski tekli fallback
      await this.pollOneSingle(spec)
    }
  }

  /**
   * Eski tekli mantık (Dexscreener strict + Gecko fallback).
   * Artık sadece batch'ten veri alınamayan tokenler için çalışacak.
   */
  private async pollOneSingle(spec: PairSpec): Promise<void> {
    const { tokenId, symbol, network, pair } = spec

    // Dexscreener (Strict)
    const dex: DexscreenerQuote | null = await getDexPairQuoteStrict(network, pair)
    if (dex) {
      const baseline = deriveBaseline(dex.priceUsd, dex.changePct)
      const entry: CachedPrice = {
        tokenId,
        symbol,
        pLive: dex.priceUsd,
        p0: baseline,
        changePct: dex.changePct,
        fdv: dex.fdv,
        ts: new Date(dex.fetchedAt).toISOString(),
        source: 'dexscreener',
        dexNetwork: network,
        dexPair: pair,
        dexUrl: buildPairViewUrl({ network, pair })
      }
      this.cache.set(tokenId, entry)
      return
    }

    // Gecko fallback
    const gecko = await getGeckoPoolQuote(network, pair, symbol)
    if (gecko) {
      const baseline = deriveBaseline(gecko.priceUsd, gecko.changePct)
      const entry: CachedPrice = {
        tokenId,
        symbol,
        pLive: gecko.priceUsd,
        p0: baseline,
        changePct: gecko.changePct,
        ts: new Date(gecko.fetchedAt).toISOString(),
        source: 'gecko',
        dexNetwork: network,
        dexPair: pair,
        dexUrl: buildDexscreenerViewUrl(undefined, network, pair)
      }
      this.cache.set(tokenId, entry)
      return
    }

    // İkisi de fail ederse → eski cache olduğu gibi kalır
  }
}

const globalAny = globalThis as any

export function ensurePriceOrchestrator(): PriceOrchestrator {
  if (!globalAny.__flipflopPriceOrchestrator) {
    globalAny.__flipflopPriceOrchestrator = new PriceOrchestrator()
  }

  const inst: PriceOrchestrator = globalAny.__flipflopPriceOrchestrator
  inst.start()
  return inst
}
