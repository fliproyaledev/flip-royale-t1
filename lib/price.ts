import { ensurePriceOrchestrator } from './price_orchestrator'

/**
 * Unified price getter for CRON and backend use
 * Returns p0, pLive, pClose and changePct exactly like /api/price endpoint
 */
export async function getPriceForToken(tokenId: string) {
  const orchestrator = ensurePriceOrchestrator()
  const cached = orchestrator.getOne(tokenId)

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
      dexUrl: cached.dexUrl
    }
  }

  // 🟡 FALLBACK (orchestrator henüz 1. dakikayı doldurmadıysa)
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
