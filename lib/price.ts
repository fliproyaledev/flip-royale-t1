import { kv } from '@vercel/kv';

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

function parseDexUrl(url?: string) {
  if (!url) return { network: undefined, pair: undefined };
  try {
    const parts = url.split('/'); 
    if (parts.length >= 5) {
      return { network: parts[3], pair: parts[4] };
    }
  } catch {}
  return { network: undefined, pair: undefined };
}

export async function getPriceForToken(tokenId: string) {
  try {
    // 1. Log: Redis bağlantısı deneniyor
    // console.log(`[PriceReader] Connecting to Redis for token: ${tokenId}...`);

    const allPrices = await kv.get<OraclePriceData[]>('GLOBAL_PRICE_CACHE');

    // 2. Log: Redis'ten ne döndü?
    if (!allPrices) {
        console.error('[PriceReader] 🚨 REDIS RETURNED NULL! (Oracle çalışmamış veya Env hatalı)');
    } else if (!Array.isArray(allPrices)) {
        console.error('[PriceReader] 🚨 REDIS DATA IS NOT AN ARRAY!', typeof allPrices);
    } else {
        // console.log(`[PriceReader] ✅ Redis Data Found. Total Tokens: ${allPrices.length}`);
        
        // İlk tokeni örnek olarak basalım ki formatı görelim
        // if (allPrices.length > 0) console.log('[PriceReader] Sample Token:', allPrices[0].tokenId);
    }

    if (!allPrices || !Array.isArray(allPrices)) {
      throw new Error('No data in Redis');
    }

    const targetId = tokenId.toLowerCase();
    
    // 3. Arama yapıyoruz
    const priceData = allPrices.find(
      (p) => p.tokenId.toLowerCase() === targetId || p.symbol.toLowerCase() === targetId
    );

    if (priceData) {
      const meta = parseDexUrl(priceData.dexUrl);
      return {
        p0: priceData.p0,
        pLive: priceData.pLive,
        pClose: priceData.pLive,
        changePct: priceData.changePct,
        fdv: priceData.fdv,
        ts: priceData.ts,
        source: 'oracle-cache',
        dexUrl: priceData.dexUrl,
        dexNetwork: meta.network,
        dexPair: meta.pair
      };
    } else {
        // 4. Log: Token bulunamadı
        console.warn(`[PriceReader] ⚠️ Token '${targetId}' not found in Oracle data. Available IDs:`, allPrices.map(p => p.tokenId).slice(0, 5));
    }

  } catch (error) {
    console.error(`[PriceReader] ❌ Error fetching ${tokenId}:`, error);
  }

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
