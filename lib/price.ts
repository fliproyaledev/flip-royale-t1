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
 * Basit URL Ayrıştırıcı
 * Oracle'dan gelen "https://dexscreener.com/base/0x123..." linkini parçalar.
 */
function parseDexUrl(url?: string) {
  if (!url) return { network: undefined, pair: undefined };
  try {
    const parts = url.split('/'); // [https:, "", dexscreener.com, base, 0x...]
    if (parts.length >= 5) {
      return { network: parts[3], pair: parts[4] };
    }
  } catch {}
  return { network: undefined, pair: undefined };
}

/**
 * Tek bir tokenin fiyatını Redis'ten getirir.
 * Hem API hem de Cron (settle-rounds) tarafından kullanılır.
 */
export async function getPriceForToken(tokenId: string) {
  try {
    // 1. Redis'teki tüm fiyat paketini çek
    const allPrices = await kv.get<OraclePriceData[]>('GLOBAL_PRICE_CACHE');

    if (!allPrices || !Array.isArray(allPrices)) {
      // Sessizce logla, hata fırlatma ki site çökmesin
      console.warn('[PriceReader] Oracle data missing in Redis');
      throw new Error('No data');
    }

    // 2. İstenen tokeni bul (ID veya Symbol eşleşmesi)
    const targetId = tokenId.toLowerCase();
    const priceData = allPrices.find(
      (p) => p.tokenId.toLowerCase() === targetId || p.symbol.toLowerCase() === targetId
    );

    if (priceData) {
      // URL'den network ve pair bilgisini çıkar
      const meta = parseDexUrl(priceData.dexUrl);

      return {
        p0: priceData.p0,
        pLive: priceData.pLive,
        pClose: priceData.pLive, // Anlık veri olduğu için close = live
        changePct: priceData.changePct,
        fdv: priceData.fdv,
        ts: priceData.ts,
        source: 'oracle-cache',
        dexUrl: priceData.dexUrl,
        // duels.ts için gerekli alanlar eklendi:
        dexNetwork: meta.network,
        dexPair: meta.pair
      };
    }
  } catch (error) {
    // console.error(`[PriceReader] Error fetching ${tokenId}`, error);
  }

  // 3. Fallback (Veri yoksa)
  return {
    p0: 0,
    pLive: 0,
    pClose: 0,
    changePct: 0,
    fdv: 0,
    ts: new Date().toISOString(),
    source: 'fallback-empty',
    dexUrl: '',
    dexNetwork: undefined,
    dexPair: undefined
  };
}
