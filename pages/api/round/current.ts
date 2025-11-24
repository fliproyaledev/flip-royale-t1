import type { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { TOKENS, getTokenById } from '../../../lib/tokens'
// import { getLatestRound } from '../../../lib/rounds' // Eğer round numarası veritabanından geliyorsa bu kalmalı, yoksa aşağıda mock var.

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
    // 1. Oracle'ın hazırladığı hazır fiyat paketini çek
    const allPrices = await kv.get<OraclePriceData[]>('GLOBAL_PRICE_CACHE') || []

    // 2. Verileri işle ve Highlight (Gainer/Loser) oluştur
    const stats = allPrices.map(p => {
        // Token bilgilerini eşleştir (Logo vs için)
        const tokenInfo = getTokenById(p.tokenId);
        return {
            tokenId: p.tokenId,
            symbol: p.symbol,
            changePct: p.changePct,
            points: Math.round(p.changePct * 100), // Basit puan hesabı
            logo: tokenInfo?.logo
        };
    });

    // 3. Sıralama Yap
    // Kazananlar (En yüksekten düşüğe)
    const topGainers = stats
        .filter(s => s.changePct > 0)
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, 5);

    // Kaybedenler (En düşükten yükseğe - yani en çok ekside olanlar)
    const topLosers = stats
        .filter(s => s.changePct < 0)
        .sort((a, b) => a.changePct - b.changePct) // -20, -10'dan küçüktür, o yüzden artan sıralama
        .slice(0, 5);

    // 4. Round Bilgisi (Veritabanından veya basit hesapla)
    // Eğer `lib/rounds` dosyanızda özel bir logic varsa onu kullanın, yoksa şimdilik kullanıcı bazlı ilerliyoruz.
    // Burayı basitçe 200 OK dönecek ve Highlights verisini verecek şekilde ayarladım.
    
    return res.status(200).json({
      ok: true,
      round: {
        roundNumber: 0, // Frontend bunu zaten kullanıcı verisinden alıyor, burası global sayaç
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
