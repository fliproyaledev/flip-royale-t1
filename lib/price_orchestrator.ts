// lib/price_orchestrator.ts

import { TOKEN_MAP, buildDexscreenerViewUrl, parseDexscreenerLink } from './tokens'
import type { Token } from './tokens'
import type { DexscreenerPairRef, DexscreenerQuote } from './dexscreener'
import { getDexPairQuoteStrict } from './dexscreener'
import { getGeckoPoolQuote } from './gecko'

// Environment Variable'dan ID'yi al ve güvenli hale getir (küçük harf)
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

// View URL oluşturucu (Public)
export function buildPublicViewUrl(
  ref: DexscreenerPairRef | null | undefined
): string | undefined {
  if (!ref) return undefined
  return `https://dexscreener.com/${ref.network.toLowerCase()}/${ref.pair.toLowerCase()}`
}

function getExplicitPair(token: Token): PairSpec | null {
  const network = (token.dexscreenerNetwork || 'base').toLowerCase()
  let pair = (token.dexscreenerPair || '').toLowerCase()

  if (!pair) {
    const parsed = parseDexscreenerLink(token.dexscreenerUrl)
    if (parsed.pair) {
      pair = parsed.pair.toLowerCase()
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
  
  // Virtual Token Fiyatı (Başlangıçta 0, böylece yüklenmediğini anlarız)
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

    // İlk çalıştırma
    this.poll().catch((e) => console.error('[PriceOrchestrator] Initial poll failed:', e))

    // Periyodik döngü
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
    
    // 1. Eğer bu token VIRTUAL ise, direkt kendi fiyatını dön (Çarpma yapma!)
    // 2. Eğer VIRTUAL ID ayarlanmamışsa, direkt fiyatı dön (Normal mod)
    // 3. Eğer Virtual fiyatı henüz çekilmemişse (0 ise), ham fiyatı dön (Hata önlemi)
    if (
        !VIRTUAL_TOKEN_ID || 
        tokenId.toLowerCase() === VIRTUAL_TOKEN_ID || 
        this.virtualPriceUsd === 0
    ) {
        return cached;
    }

    // Diğer tüm tokenler için: HAVUZ FİYATI * VIRTUAL USD FİYATI
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
    // ADIM 1: Önce Virtual Token fiyatını çek ve güncelle
    if (VIRTUAL_TOKEN_ID) {
        const virtualToken = TOKEN_MAP[Object.keys(TOKEN_MAP).find(k => k.toLowerCase() === VIRTUAL_TOKEN_ID) || ''];
        
        if (virtualToken) {
            const spec = getExplicitPair(virtualToken);
            if (spec) {
                await this.pollOne(spec); // Cache'e kaydeder
                const vPrice = this.cache.get(virtualToken.id);
                if (vPrice && vPrice.pLive > 0) {
                    this.virtualPriceUsd = vPrice.pLive;
                    console.log(`[PriceOrchestrator] Virtual Price Updated: $${this.virtualPriceUsd}`);
                } else {
                    console.warn(`[PriceOrchestrator] Failed to fetch Virtual Price! Keeping old value: $${this.virtualPriceUsd}`);
                }
            }
        } else {
            console.warn(`[PriceOrchestrator] VIRTUAL_TOKEN_ID defined (${VIRTUAL_TOKEN_ID}) but not found in TOKEN_MAP`);
        }
    }

    // ADIM 2: Diğer tüm tokenleri çek
    // (Not: Virtual token zaten yukarıda çekildi ama listede varsa tekrar üstünden geçmesinde sakınca yok, cache'den gelir)
    for (const spec of this.pairs) {
        // Virtual tokeni tekrar çekip yormaya gerek yok
        if (spec.tokenId.toLowerCase() === VIRTUAL_TOKEN_ID) continue;
        await this.pollOne(spec)
    }
  }

  private async pollOne(spec: PairSpec): Promise<void> {
    const { tokenId, symbol, network, pair } = spec

    // Dexscreener (Strict)
    const dex: DexscreenerQuote | null = await getDexPairQuoteStrict(network, pair)
    
    if (dex) {
      const baseline = deriveBaseline(dex.priceUsd, dex.changePct)
      
      const entry: CachedPrice = {
        tokenId,
        symbol,
        pLive: dex.priceUsd,
        p0: baseline,
        changePct: dex.changePct,
        fdv: dex.fdv,
        ts: new Date(dex.fetchedAt).toISOString(),
        source: 'dexscreener',
        dexNetwork: network,
        dexPair: pair,
        dexUrl: buildPublicViewUrl({ network, pair })
      }
      this.cache.set(tokenId, entry)
      return
    }

    // Gecko fallback
    const gecko = await getGeckoPoolQuote(network, pair, symbol)
    if (gecko) {
      const baseline = deriveBaseline(gecko.priceUsd, gecko.changePct)
      const entry: CachedPrice = {
        tokenId,
        symbol,
        pLive: gecko.priceUsd,
        p0: baseline,
        changePct: gecko.changePct,
        ts: new Date(gecko.fetchedAt).toISOString(),
        source: 'gecko',
        dexNetwork: network,
        dexPair: pair,
        dexUrl: buildPublicViewUrl({ network, pair })
      }
      this.cache.set(tokenId, entry)
      return
    }
    
    // Hata durumunda log
    console.warn(`[PriceOrchestrator] Failed to fetch price for ${symbol} (${network}:${pair})`);
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
