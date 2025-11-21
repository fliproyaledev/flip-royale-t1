import { ensurePriceOrchestrator } from './price_orchestrator'
import { POOLS } from './pools'

/**
 * Multi-fetch ile DexScreener fiyatlarını güncelle
 * Bu fonksiyon price_orchestrator tarafından çağrılır
 */
export async function fetchAllPricesMulti() {
  try {
    const url = `https://api.dexscreener.com/latest/dex/pairs/base/${POOLS.join(',')}`

    const res = await fetch(url, {
      next: { revalidate: 60 }, // 60 saniye cache → rate limit bitiyor
    })

    if (!res.ok) throw new Error("Dexscreener multi-fetch error")

    const data = await res.json()

    const result: Record<string, any> = {}

    // pairAddress → price map
    data.pairs?.forEach((pair: any) => {
      result[pair.pairAddress.toLowerCase()] = {
        price: Number(pair.priceUsd || 0),
        fdv: Number(pair.fdv || 0),
        volume24h: Number(pair.volume?.h24 || 0),
        liquidity: Number(pair.liquidity?.usd || 0),
        dexUrl: pair.url,
        dexNetwork: pair.chainId,
        ts: new Date().toISOString(),
      }
    })

    return result
  } catch (err) {
    console.error("❌ Multi-fetch error:", err)
    return {}
  }
}

/**
 * Unified price getter for CRON and backend use
 * Returns p0, pLive, pClose and changePct exactly like /api/price endpoint
 */
export async function getPriceForToken(tokenId: string) {
  const orchestrator = ensurePriceOrchestrator()

  const cached = orchestrator.getOne(tokenId)

  // 🔥 Eğer orchestrator zaten fiyatı tuttuysa → direkt return
  if (cached) {
    const pct = isFinite(cached.changePct ?? NaN)
      ? Number(cached.changePct)
      : ((cached.pLive - cached.p0) / cached.p0) * 100

    return {
      p0: cached.p0,
      pLive: cached.pLive,
      pClose: cached.pLive,
      changePct: pct,
      fdv: cached.fdv,
      ts: cached.ts,
      source: cached.source,
      dexNetwork: cached.dexNetwork,
      dexPair: cached.dexPair,
      dexUrl: cached.dexUrl,
    }
  }

  // 🟡 Fallback devreye girecekse → artık random değil, multi-fetch sonucundan gelecek
  const allPrices = await fetchAllPricesMulti()

  const lower = tokenId.toLowerCase()
  const match = Object.values(allPrices).find(
    (x: any) => x.dexUrl?.toLowerCase().includes(lower)
  ) as any

  if (match) {
    return {
      p0: match.price,
      pLive: match.price,
      pClose: match.price,
      changePct: 0,
      fdv: match.fdv,
      ts: match.ts,
      source: 'multi-fetch',
      dexUrl: match.dexUrl,
      dexPair: tokenId,
      dexNetwork: match.dexNetwork,
    }
  }

  // 🟡 Son çare fallback (çok düşük ihtimal, multi-fetch çalışırken gerek kalmaz)
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
