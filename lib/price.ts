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
  source: 'dexscreener' | 'gecko' | 'fallback';
  dexUrl: string;
};

/**
 * Basit URL Ayrıştırıcı
 * Oracle'dan gelen "https://dexscreener.com/base/0x123..." linkini parçalar.
 * Bu, duels.ts ve frontend için gereklidir.
 */
function parseDexUrl(url?: string) {
  if (!url) return { network: undefined, pair: undefined };
  try {
    const parts = url.split('/'); 
    // Örn: [https:, "", dexscreener.com, base, 0x...]
    if (parts.length >= 5) {
      return { network: parts[3], pair: parts[4] };
    }
  } catch {}
  return { network: undefined, pair: undefined };
}

/**
 * Tek bir tokenin fiyatını Redis'ten getirir.
 * Hem API (/api/price) hem de Cron (settle-rounds) tarafından kullanılır.
 */
export async function getPriceForToken(tokenId: string) {
  try {
    // 1. Redis'teki tüm fiyat paketini çek
    // (Bu işlem çok hızlıdır, dış API'ye gitmez)
    const allPrices = await kv.get<OraclePriceData[]>('GLOBAL_PRICE_CACHE');

    if (!allPrices || !Array.isArray(allPrices)) {
      // Sessizce logla (Sitenin çökmemesi için hata fırlatmıyoruz, fallback dönüyoruz)
      // console.warn('[PriceReader] Oracle data missing in Redis');
      throw new Error('No data');
    }

    // 2. İstenen tokeni bul (ID veya Symbol eşleşmesi ile)
    const targetId = tokenId.toLowerCase();
    const priceData = allPrices.find(
      (p) => p.tokenId.toLowerCase() === targetId || p.symbol.toLowerCase() === targetId
    );

    if (priceData) {
      // URL'den network ve pair bilgisini çıkar (duels.ts için lazım)
      const meta = parseDexUrl(priceData.dexUrl);

      return {
        p0: priceData.p0,
        pLive: priceData.pLive,
        pClose: priceData.pLive, // Anlık veri olduğu için close = live
        changePct: priceData.changePct,
        fdv: priceData.fdv,
        ts: priceData.ts,
        
        // Kaynağı olduğu gibi geçir (dexscreener/gecko)
        // Böylece 'fallback' yazısı çıkmaz.
        source: priceData.source || 'dexscreener', 
        
        dexUrl: priceData.dexUrl,
        dexNetwork: meta.network,
        dexPair: meta.pair
      };
    }
  } catch (error) {
    // Hata durumunda (Redis kapalıysa vb.) sessiz kal
    // console.error(`[PriceReader] Error fetching ${tokenId}`, error);
  }

  // 3. Fallback (Eğer Redis boşsa veya token yoksa)
  // Bu kısım sadece sistem ilk açıldığında veya Oracle çalışmadığında devreye girer.
  return {
    p0: 0,
    pLive: 0,
    pClose: 0,
    changePct: 0,
    fdv: 0,
    ts: new Date().toISOString(),
    source: 'fallback',
    dexUrl: '',
    dexNetwork: undefined,
    dexPair: undefined
  };
}
