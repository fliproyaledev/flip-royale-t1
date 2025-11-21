// lib/price.ts

import { ensurePriceOrchestrator } from './price_orchestrator'
import { TOKEN_MAP, parseDexscreenerLink } from './tokens'

type DirectPriceResult = {
  p0: number
  pLive: number
  pClose: number
  changePct: number
  fdv: number
  ts: string
  source: string
  dexNetwork?: string
  dexPair?: string
  dexUrl?: string
}

type PairSpec = {
  network: string
  pair: string
  symbol: string
}

/**
 * tokenId -> (network, pairAddress) çıkar
 * tokens.ts ve token-list.json ile uyumlu çalışır
 */
function getPairForToken(tokenId: string): PairSpec | null {
  const token = (TOKEN_MAP as any)[tokenId]
  if (!token) return null

  const network = (token.dexscreenerNetwork || 'base').toLowerCase()

  let pair = (token.dexscreenerPair || '').toLowerCase()

  // Eğer dexscreenerPair boşsa, url içinden parse et
  if (!pair && token.dexscreenerUrl) {
    const parsed = parseDexscreenerLink(token.dexscreenerUrl)
    if (parsed?.pair) {
      pair = String(parsed.pair).toLowerCase()
    }
  }

  if (!pair) return null

  return { network, pair, symbol: token.symbol }
}

function deriveBaseline(currentPrice: number, changePct?: number): number {
  if (!isFinite(changePct ?? NaN) || (changePct as number) <= -100 || changePct === 0) {
    return currentPrice
  }
  const baseline = currentPrice / (1 + (changePct as number) / 100)
  return baseline > 0 ? baseline : currentPrice
}

/**
 * Orchestrator cache boş kaldığında, direkt Dexscreener'dan gerçek fiyatı çekmeye çalışır.
 * Sadece bu da fail ederse random fallback döneriz.
 */
async function fetchDirectFromDexscreener(tokenId: string): Promise<DirectPriceResult | null> {
  const spec = getPairForToken(tokenId)
  if (!spec) return null

  const { network, pair } = spec

  const url = `https://api.dexscreener.com/latest/dex/pairs/${network}/${pair}`

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json'
      }
    })

    if (!res.ok) {
      console.error('Dexscreener direct fetch error:', res.status, await res.text())
      return null
    }

    const data = await res.json()
    const p = data?.pairs?.[0]
    if (!p || !p.priceUsd) {
      console.error('Dexscreener direct fetch: no priceUsd for', tokenId, network, pair)
      return null
    }

    const price = Number(p.priceUsd)
    if (!isFinite(price) || price <= 0) return null

    const changeRaw =
      p.priceChange && typeof p.priceChange.h24 !== 'undefined'
        ? Number(p.priceChange.h24)
        : 0

    const baseline = deriveBaseline(price, changeRaw)
    const fdv = p.fdv != null ? Number(p.fdv) : 0

    const viewUrl =
      typeof p.url === 'string' && p.url.length > 0
        ? p.url
        : `https://dexscreener.com/${network}/${pair}`

    return {
      p0: baseline,
      pLive: price,
      pClose: price,
      changePct: isFinite(changeRaw) ? changeRaw : 0,
      fdv,
      ts: new Date().toISOString(),
      source: 'dexscreener-direct',
      dexNetwork: network,
      dexPair: pair,
      dexUrl: viewUrl
    }
  } catch (err) {
    console.error('Dexscreener direct fetch exception for', tokenId, err)
    return null
  }
}

/**
 * Unified price getter for CRON and backend use
 * Returns p0, pLive, pClose and changePct exactly like /api/price endpoint
 */
export async function getPriceForToken(tokenId: string) {
  const orchestrator = ensurePriceOrchestrator()
  const cached = orchestrator.getOne(tokenId)

  // 1️⃣ Önce orchestrator cache'ini kullan (en sağlıklı yol bu)
  if (cached) {
    const pct = isFinite(cached.changePct ?? NaN)
      ? Number(cached.changePct)
      : ((cached.pLive - cached.p0) / cached.p0) * 100

    return {
      p0: cached.p0,
      pLive: cached.pLive,
      pClose: cached.pLive,
      changePct: pct,
      fdv: cached.fdv ?? 0,
      ts: cached.ts,
      source: cached.source,
      dexNetwork: cached.dexNetwork,
      dexPair: cached.dexPair,
      dexUrl: cached.dexUrl
    }
  }

  // 2️⃣ Eğer cache yoksa → direkt Dexscreener API'ye git ve gerçek fiyatı çek
  const direct = await fetchDirectFromDexscreener(tokenId)
  if (direct) {
    return direct
  }

  // 3️⃣ Son çare: random fallback (çok nadir durumda buraya düşmeli)
  console.warn('FALLBACK price used for token', tokenId)
  const base = 1 + Math.random() * 3
  return {
    p0: base,
    pLive: base,
    pClose: base,
    changePct: 0,
    fdv: 0,
    ts: new Date().toISOString(),
    source: 'fallback'
  }
}
