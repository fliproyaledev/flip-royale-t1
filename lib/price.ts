import { kv } from '@vercel/kv';

// Oracle'ın Redis'e kaydettiği veri tipi
type OraclePriceData = {
  tokenId: string;
  symbol: string;
  pLive: number;
  p0: number;
  changePct: number;
  fdv: number;
  ts: string;
  source: string;
  dexUrl: string;
};

/**
 * Tek bir tokenin fiyatını Redis'ten getirir.
 * Hem API hem de Cron (settle-rounds) tarafından kullanılır.
 */
export async function getPriceForToken(tokenId: string) {
  try {
    // 1. Redis'teki tüm fiyat paketini çek
    const allPrices = await kv.get<OraclePriceData[]>('GLOBAL_PRICE_CACHE');

    if (!allPrices || !Array.isArray(allPrices)) {
      throw new Error('Oracle data not found in Redis');
    }

    // 2. İstenen tokeni bul (ID veya Symbol eşleşmesi)
    const targetId = tokenId.toLowerCase();
    const priceData = allPrices.find(
      (p) => p.tokenId === targetId || p.symbol.toLowerCase() === targetId
    );

    if (priceData) {
      return {
        p0: priceData.p0,
        pLive: priceData.pLive,
        pClose: priceData.pLive, // Anlık veri olduğu için close = live
        changePct: priceData.changePct,
        fdv: priceData.fdv,
        ts: priceData.ts,
        source: 'oracle-cache', // Kaynak artık Oracle
        dexUrl: priceData.dexUrl,
        // Oracle zaten bunları hesaplayıp gönderdiği için direkt kullanıyoruz
      };
    }
  } catch (error) {
    console.error(`[PriceReader] Error fetching ${tokenId}:`, error);
  }

  // 3. Fallback (Eğer Redis boşsa veya token yoksa oyun patlamasın diye)
  return {
    p0: 0,
    pLive: 0,
    pClose: 0,
    changePct: 0,
    fdv: 0,
    ts: new Date().toISOString(),
    source: 'fallback-empty',
    dexUrl: ''
  };
}
