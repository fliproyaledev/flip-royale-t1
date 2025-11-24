// lib/rounds_service.ts

import { TOKENS } from './tokens'
// Eski importları sildik (Dexscreener/Gecko)
import { getPriceForToken } from './price' // YENİ GÜÇLÜ OKUYUCU
import { addRoundSnapshot, type RoundPriceItem } from './rounds'

export async function closeRound(): Promise<{ id: string; count: number }> {
  const nowIso = new Date().toISOString()
  const items: RoundPriceItem[] = []

  // Tüm tokenleri dön
  for (const token of TOKENS) {
    // Fiyatı Redis'ten (Oracle Cache'den) çek
    const priceData = await getPriceForToken(token.id)

    // Eğer geçerli bir fiyat varsa listeye ekle
    // (pLive > 0 kontrolü boş verileri eler)
    if (priceData && priceData.pLive > 0) {
      items.push({
        tokenId: token.id,
        p0: priceData.p0,         // Oracle'ın hesapladığı baseline
        pClose: priceData.pLive,  // Kapanış fiyatı (Canlı fiyat)
        ts: nowIso,
        source: priceData.source, // 'oracle-cache'
        network: priceData.dexNetwork,
        pair: priceData.dexPair
      })
    }
  }

  // Snapshot'ı veritabanına kaydet
  await addRoundSnapshot({ id: nowIso, items })
  
  return { id: nowIso, count: items.length }
}
