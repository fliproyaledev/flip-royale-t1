import { ensurePriceOrchestrator } from './price_orchestrator'

/**
 * Cron ve Backend için Merkezi Fiyat Çekici
 * Doğrudan Orchestrator'dan (Cache'den) okur.
 */
export async function getPriceForToken(tokenId: string) {
  const orchestrator = ensurePriceOrchestrator()
  const cached = orchestrator.getOne(tokenId)

  if (cached) {
    // Yüzdelik değişimi hesapla veya cache'den al
    const pct = isFinite(cached.changePct ?? NaN)
      ? Number(cached.changePct)
      : (cached.p0 > 0 ? ((cached.pLive - cached.p0) / cached.p0) * 100 : 0)

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

  // Fallback (Eğer veri yoksa)
  return {
    p0: 0,
    pLive: 0,
    pClose: 0,
    changePct: 0,
    fdv: 0,
    ts: new Date().toISOString(),
    source: 'fallback'
  }
}
