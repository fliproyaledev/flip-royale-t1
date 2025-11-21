// lib/price_orchestrator.ts

import { TOKEN_MAP, buildDexscreenerViewUrl, parseDexscreenerLink } from './tokens'
import type { Token } from './tokens'
import type { DexscreenerPairRef, DexscreenerQuote } from './dexscreener'
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

  private async poll(): Promise<void> {
    for (const spec of this.pairs) {
      await this.pollOne(spec)
    }
  }

  private async pollOne(spec: PairSpec): Promise<void> {
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

    // If both fail → keep last cached value
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
