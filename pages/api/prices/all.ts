import type { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'

// Oracle'ın Redis'e kaydettiği veri tipi
type OraclePriceData = {
  tokenId: string
  symbol: string
  pLive: number
  p0: number
  changePct: number
  fdv: number
  ts: string
  source: string
  dexUrl: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Orchestrator yerine direkt Redis'teki GLOBAL CACHE'i okuyoruz
    const allPrices = await kv.get<OraclePriceData[]>('GLOBAL_PRICE_CACHE')
    
    // Eğer veri yoksa boş dön, hata verme
    if (!allPrices || !Array.isArray(allPrices)) {
       return res.status(200).json({ ok: true, fdv: {} })
    }

    // Frontend'in beklediği FDV haritasını oluştur: { "token_id": 123456, ... }
    const fdvMap: Record<string, number | undefined> = {}
    for (const price of allPrices) {
      fdvMap[price.tokenId] = price.fdv
    }
    
    return res.status(200).json({ ok: true, fdv: fdvMap })

  } catch (err: any) {
    console.error('FDV API Error:', err)
    // Hata durumunda bile 200 dönüp boş veri verelim ki site çökmesin
    return res.status(200).json({ ok: false, fdv: {} })
  }
}
