// lib/price_orchestrator.ts

import { TOKEN_MAP, parseDexscreenerLink } from './tokens'
import type { Token } from './tokens'
import type { DexscreenerPairRef, DexscreenerQuote } from './dexscreener'
import { getDexPairQuoteStrict } from './dexscreener'
import { getGeckoPoolQuote } from './gecko'

// Environment Variable'dan ID'yi al ve güvenli hale getir
const RAW_VIRTUAL_ID = process.env.VIRTUAL_TOKEN_ID || '';
const VIRTUAL_TOKEN_ID = RAW_VIRTUAL_ID.toLowerCase().trim();

export type CachedPrice = {
  tokenId: string
  symbol: string
  pLive: number
  p0: number
  changePct?: number
  fdv?: number
  ts: string
  source: 'dexscreener' | 'gecko'
  dexNetwork: string
  dexPair: string
  dexUrl?: string
}

type PairSpec = {
  tokenId: string
  symbol: string
  network: string
  pair: string
}

function deriveBaseline(currentPrice: number, changePct?: number): number {
  if (!isFinite(changePct) || changePct === undefined || changePct <= -100 || changePct === 0) {
    return currentPrice
  }
  const baseline = currentPrice / (1 + changePct / 100)
  return baseline > 0 ? baseline : currentPrice
}

// View URL oluşturucu
export function buildPublicViewUrl(
  ref: DexscreenerPairRef | null | undefined
): string | undefined {
  if (!ref) return undefined
  return `https://dexscreener.com/${ref.network.toLowerCase()}/${ref.pair.toLowerCase()}`
}

// 🧹 YENİ FONKSİYON: Adresi Temizle
// Girdi "pools/0x123..." veya "https://..." olsa bile sadece "0x123..." döndürür.
function sanitizeAddress(input: string): string {
  if (!input) return '';
  // Sadece 0x ile başlayan 42 karakterlik hex dizesini bul
  const match = input.match(/(0x[a-fA-F0-9]{40})/);
  return match ? match[0].toLowerCase() : '';
}

function getExplicitPair(token: Token): PairSpec | null {
  const network = (token.dexscreenerNetwork || 'base').toLowerCase()
  
  // JSON'dan gelen veriyi temizle
  let pair = sanitizeAddress(token.dexscreenerPair || '');

  // Eğer JSON'da pair yoksa URL'den bulmaya çalış
  if (!pair) {
    const parsed = parseDexscreenerLink(token.dexscreenerUrl)
    if (parsed.pair) {
      pair = sanitizeAddress(parsed.pair);
    }
  }

  if (!pair) return null

  return {
    tokenId: token.id,
    symbol: token.symbol,
    network,
    pair
  }
}

class PriceOrchestrator {
  private started = false
  private interval: NodeJS.Timeout | null = null
  private cache = new Map<string, CachedPrice>()
  private pairs: PairSpec[] = []
  private intervalMs = 60_000
  private virtualPriceUsd: number = 0 

  start() {
    if (this.started) return
    this.started = true

    const envMs = Number(process.env.PRICE_POLL_INTERVAL_MS || NaN)
    if (Number.isFinite(envMs) && envMs >= 15_000) {
      this.intervalMs = Math.floor(envMs)
    }

    this.pairs = Object.values(TOKEN_MAP)
      .map(getExplicitPair)
      .filter((x): x is PairSpec => !!x)

    console.log(`[PriceOrchestrator] Started. Virtual ID: ${VIRTUAL_TOKEN_ID || 'NOT SET'}`)
    console.log(`[PriceOrchestrator] Tracking ${this.pairs.length} pairs.`)

    this.poll().catch((e) => console.error('[PriceOrchestrator] Initial poll failed:', e))

    this.interval = setInterval(() => {
      this.poll().catch((e) => console.error('[PriceOrchestrator] Poll failed:', e))
    }, this.intervalMs)
  }

  stop() {
    if (this.interval) clearInterval(this.interval)
    this.interval = null
    this.started = false
  }

  getOne(tokenId: string): CachedPrice | null {
    const cached = this.cache.get(tokenId)
    if (!cached) return null
    
    if (!VIRTUAL_TOKEN_ID || tokenId.toLowerCase() === VIRTUAL_TOKEN_ID || this.virtualPriceUsd === 0) {
        return cached;
    }

    return {
        ...cached,
        pLive: cached.pLive * this.virtualPriceUsd,
        p0: cached.p0 * this.virtualPriceUsd,
        fdv: cached.fdv ? cached.fdv * this.virtualPriceUsd : undefined,
    } as CachedPrice
  }

  getAll(): CachedPrice[] {
    return Array.from(this.cache.values()).map(price => this.getOne(price.tokenId) as CachedPrice)
  }

  private async poll(): Promise<void> {
    // 1. Virtual Token Fiyatını Çek
    if (VIRTUAL_TOKEN_ID) {
        // Token Map içinde ID'si veya Adresi VIRTUAL_TOKEN_ID ile eşleşeni bul
        const virtualTokenKey = Object.keys(TOKEN_MAP).find(k => 
            k.toLowerCase() === VIRTUAL_TOKEN_ID || 
            TOKEN_MAP[k].id.toLowerCase() === VIRTUAL_TOKEN_ID
        );
        
        const virtualToken = virtualTokenKey ? TOKEN_MAP[virtualTokenKey] : null;
        
        if (virtualToken) {
            const spec = getExplicitPair(virtualToken);
            if (spec) {
                await this.pollOne(spec); 
                const vPrice = this.cache.get(virtualToken.id);
                if (vPrice && vPrice.pLive > 0) {
                    this.virtualPriceUsd = vPrice.pLive;
                    // console.log(`[PriceOrchestrator] Virtual Price Updated: $${this.virtualPriceUsd}`);
                }
            }
        }
    }

    // 2. Diğerlerini Çek
    for (const spec of this.pairs) {
        if (spec.tokenId.toLowerCase() === VIRTUAL_TOKEN_ID) continue;
        await this.pollOne(spec)
    }
  }

  private async pollOne(spec: PairSpec): Promise<void> {
    const { tokenId, symbol, network, pair } = spec

    // Dexscreener (Strict) - Temizlenmiş adres ile çağır
    const dex: DexscreenerQuote | null = await getDexPairQuoteStrict(network, pair)
    
    if (dex) {
      const baseline = deriveBaseline(dex.priceUsd, dex.changePct)
      const entry: CachedPrice = {
        tokenId, symbol, pLive: dex.priceUsd, p0: baseline, 
        changePct: dex.changePct, fdv: dex.fdv,
        ts: new Date(dex.fetchedAt).toISOString(), source: 'dexscreener',
        dexNetwork: network, dexPair: pair,
        dexUrl: buildPublicViewUrl({ network, pair })
      }
      this.cache.set(tokenId, entry)
      return
    }

    // Gecko Fallback
    const gecko = await getGeckoPoolQuote(network, pair, symbol)
    if (gecko) {
      const baseline = deriveBaseline(gecko.priceUsd, gecko.changePct)
      const entry: CachedPrice = {
        tokenId, symbol, pLive: gecko.priceUsd, p0: baseline, 
        changePct: gecko.changePct,
        ts: new Date(gecko.fetchedAt).toISOString(), source: 'gecko',
        dexNetwork: network, dexPair: pair,
        dexUrl: buildPublicViewUrl({ network, pair })
      }
      this.cache.set(tokenId, entry)
      return
    }
    
    console.warn(`[PriceOrchestrator] Failed: ${symbol} (${network}:${pair})`);
  }
}

const globalAny = globalThis as any

export function ensurePriceOrchestrator(): PriceOrchestrator {
  if (!globalAny.__flipflopPriceOrchestrator) {
    globalAny.__flipflopPriceOrchestrator = new PriceOrchestrator()
  }
  const inst: PriceOrchestrator = globalAny.__flipflopPriceOrchestrator
  inst.start()
  return inst
}
