import type { NextApiRequest, NextApiResponse } from 'next'
import { ensurePriceOrchestrator } from '../../lib/price_orchestrator'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  const tokenParam = req.query.token
  if (!tokenParam || typeof tokenParam !== 'string') {
    return res.status(400).json({ error: 'Missing token id' })
  }

  // Token ID temizliği (Örn: $MAMO -> mamo)
  const cleanId = tokenParam.replace(/^\$/, '').toLowerCase()

  try {
    // TEK DOĞRU KAYNAK: Price Orchestrator
    const orchestrator = ensurePriceOrchestrator()
    
    // 1. ID ile dene
    let data = orchestrator.getOne(cleanId)
    
    // 2. Bulamazsan Symbol ile dene
    if (!data) {
        const all = orchestrator.getAll();
        data = all.find(p => p.symbol.toLowerCase() === cleanId) || null;
    }

    if (data) {
      return res.status(200).json(data)
    }

    // Veri henüz hazır değilse (Orchestrator ilk yüklemede)
    // 404 dönmüyoruz ki frontend hata sanmasın, "loading" durumu dönüyoruz.
    return res.status(200).json({ 
        pLive: 0, 
        p0: 0, 
        changePct: 0, 
        source: 'loading',
        ts: new Date().toISOString()
    })

  } catch (err: any) {
    console.error('[/api/price] error:', err)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}
