import type { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { getTokenById } from '../../../lib/tokens'

// Oracle'dan gelen veri tipi
type OraclePriceData = {
  tokenId: string
  symbol: string
  pLive: number
  p0: number
  changePct: number
  fdv: number
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  try {
    // 1. Fiyatları Redis'ten çek
    const allPrices = await kv.get<OraclePriceData[]>('GLOBAL_PRICE_CACHE') || []

    // 2. Global Round Numarasını Çek (Senkronizasyon için kritik)
    const globalRound = await kv.get<number>('GLOBAL_ROUND_COUNTER') || 1

    // 3. Verileri işle ve Highlight (Gainer/Loser) oluştur
    const stats = allPrices.map(p => {
        const tokenInfo = getTokenById(p.tokenId);
        return {
            tokenId: p.tokenId,
            symbol: p.symbol,
            changePct: p.changePct,
            points: Math.round(p.changePct * 100),
            logo: tokenInfo?.logo
        };
    });

    // Sıralama
    const topGainers = stats.filter(s => s.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, 5);
    const topLosers = stats.filter(s => s.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, 5);

    return res.status(200).json({
      ok: true,
      round: {
        roundNumber: globalRound, // <-- İşte herkesi eşitleyecek sayı
        highlights: {
            topGainers,
            topLosers
        }
      }
    })

  } catch (err: any) {
    console.error('Current Round API Error:', err)
    return res.status(500).json({ ok: false, error: 'Internal Server Error' })
  }
}
