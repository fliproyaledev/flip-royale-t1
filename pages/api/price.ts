import type { NextApiRequest, NextApiResponse } from 'next'
import type { Token } from '../../lib/tokens'
import { TOKEN_MAP, buildDexscreenerViewUrl, parseDexscreenerLink } from '../../lib/tokens'
import type { DexscreenerPairRef, DexscreenerQuote } from '../../lib/dexscreener'
import { buildPairViewUrl, findDexPairForToken, getDexPairQuote, getDexPairQuoteStrict } from '../../lib/dexscreener'
import { getGeckoPoolQuote } from '../../lib/gecko'
import { ensurePriceOrchestrator } from '../../lib/price_orchestrator'
import { ensureDailyCron } from '../../lib/cron'
import { closeRound } from '../../lib/rounds_service'
import { seedDailyRooms } from '../../lib/duels'

type DexPriceResult = {
  priceUsd: number
  changePct?: number
  baselineUsd: number
  timestamp: string
  pair: DexscreenerPairRef
  url?: string
  source: 'dexscreener' | 'gecko'
}

const globalAny = globalThis as any
const resolvedPairs: Record<string, DexscreenerPairRef | null> = globalAny.__flipflopDexPairs ?? (globalAny.__flipflopDexPairs = {})

function mulberry32(a:number){ return function(){ var t = a += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }}
function seeded(id:string, salt:number){ let h=0; for (let i=0;i<id.length;i++){ h = Math.imul(31, h) + id.charCodeAt(i) | 0; } const rnd = mulberry32(h + salt); return rnd(); }

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  // Lazy-start daily cron when this endpoint is first hit
  ensureDailyCron(async () => {
    closeRound().catch(()=>{})
    try { await seedDailyRooms(25, 2500) } catch {}
  })
  const tokenId = String(req.query.token || 'virtual')
  const now = Date.now()

  // Serve from orchestrator cache to avoid per-request provider calls
  const orchestrator = ensurePriceOrchestrator()
  const cached = orchestrator.getOne(tokenId)
  if (cached) {
    const pct = isFinite(cached.changePct ?? NaN)
      ? Number(cached.changePct)
      : ((cached.pLive - cached.p0) / cached.p0) * 100
    return res.status(200).json({
      p0: cached.p0,
      pLive: cached.pLive,
      pClose: cached.pLive,
      changePct: pct,
      fdv: cached.fdv,
      ts: cached.ts,
      source: cached.source,
      dexNetwork: cached.dexNetwork,
      dexPair: cached.dexPair,
      dexUrl: cached.dexUrl
    })
  }
  // If orchestrator hasn't filled yet (cold start), attempt a single direct resolve
  try {
    const price = await resolveDexPrice(tokenId)
    if (price) {
      const pct = isFinite(price.changePct ?? NaN)
        ? Number(price.changePct)
        : ((price.priceUsd - price.baselineUsd) / price.baselineUsd) * 100
      return res.status(200).json({
        p0: price.baselineUsd,
        pLive: price.priceUsd,
        pClose: price.priceUsd,
        changePct: pct,
        ts: price.timestamp,
        source: price.source,
        dexNetwork: price.pair.network,
        dexPair: price.pair.pair,
        dexUrl: price.url
      })
    }
  } catch (err) {
    // ignore and fall back to deterministic below
  }

  // Fallback deterministic price to keep UI responsive on failure
  const base = 1 + Math.floor(seeded(tokenId, 1)*300)
  const t = Math.floor(now/10000)
  const drift = (seeded(tokenId, t) - 0.5) * 0.08 // ±8%
  const p0 = base
  const pLive = base * (1 + drift)
  const changePct = ((pLive - p0) / p0) * 100
  return res.status(200).json({ p0, pLive, pClose: pLive, changePct, ts: new Date(now).toISOString(), source: 'fallback' })
}

function deriveBaseline(currentPrice: number, changePct?: number): number {
  if (!isFinite(changePct) || changePct <= -100 || changePct === 0) {
    return currentPrice
  }
  const baseline = currentPrice / (1 + changePct / 100)
  return baseline > 0 ? baseline : currentPrice
}

async function resolveDexPrice(tokenId: string): Promise<DexPriceResult | null> {
  const token = TOKEN_MAP[tokenId]
  if (!token) return null

  const preferNetwork = (token.dexscreenerNetwork || 'base').toLowerCase()
  const seen = new Set<string>()
  const candidates: DexscreenerPairRef[] = []

  const push = (ref: DexscreenerPairRef | null | undefined) => {
    if (!ref || !ref.network || !ref.pair) return
    const network = ref.network.toLowerCase()
    if (network !== preferNetwork) return
    const pair = ref.pair.toLowerCase()
    const key = `${network}:${pair}`
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({ network, pair })
  }

  // Explicit pair from token-list has priority over cached/search
  const explicit = buildPairRef(token.dexscreenerNetwork, token.dexscreenerPair)
  if (explicit) {
    push(explicit)
  }
  push(buildPairRefFromUrl(token.dexscreenerUrl))
  const cached = resolvedPairs[tokenId]
  if (cached && cached.network.toLowerCase() === preferNetwork) {
    // Only consider cached if it matches the explicit pair or no explicit is provided
    const explicitKey = explicit ? `${explicit.network}:${explicit.pair}` : null
    const cachedKey = `${cached.network.toLowerCase()}:${cached.pair.toLowerCase()}`
    if (!explicitKey || explicitKey === cachedKey) {
      push(cached)
    } else {
      // Cached pair differs from explicit; force-reset cache to explicit
      resolvedPairs[tokenId] = { network: explicit.network, pair: explicit.pair }
    }
  }

  for (const ref of candidates) {
    // For explicitly configured refs, fetch strictly; for others use normal.
    const isExplicit = !!explicit && ref.network === explicit.network && ref.pair === explicit.pair
    const result = await fetchDexPrice(ref, isExplicit)
    if (result) {
      resolvedPairs[tokenId] = { network: ref.network, pair: ref.pair }
      return result
    }
  }

  // GeckoTerminal fallback FIRST for the exact configured pair(s),
  // to avoid switching to a different LP when user provided a specific pool.
  const geckoCandidates: DexscreenerPairRef[] = []
  const pushGecko = (ref: DexscreenerPairRef | null | undefined) => {
    if (!ref || !ref.network || !ref.pair) return
    geckoCandidates.push({ network: ref.network.toLowerCase(), pair: ref.pair.toLowerCase() })
  }
  pushGecko(buildPairRef(token.dexscreenerNetwork, token.dexscreenerPair))
  pushGecko(buildPairRefFromUrl(token.dexscreenerUrl))
  for (const ref of geckoCandidates) {
    const gecko = await getGeckoPoolQuote(ref.network, ref.pair, token.symbol)
    if (gecko) {
      const baseline = deriveBaseline(gecko.priceUsd, gecko.changePct)
      return {
        priceUsd: gecko.priceUsd,
        changePct: gecko.changePct,
        baselineUsd: baseline,
        timestamp: new Date(gecko.fetchedAt).toISOString(),
        pair: { network: ref.network, pair: ref.pair },
        url: buildPairViewUrl(ref),
        source: 'gecko'
      }
    }
  }

  // If still unresolved, only search when there is NO explicit pair configured.
  const hasExplicit = !!(buildPairRef(token.dexscreenerNetwork, token.dexscreenerPair) || buildPairRefFromUrl(token.dexscreenerUrl))
  if (!hasExplicit) {
    const searched = await findDexPairForToken(token)
    if (searched) {
      const result = await fetchDexPrice(searched)
      if (result) {
        resolvedPairs[tokenId] = { network: searched.network, pair: searched.pair }
        return result
      }
    }
  }

  if (!(tokenId in resolvedPairs)) {
    resolvedPairs[tokenId] = null
  }

  return null
}

function buildPairRef(network?: string | null, pair?: string | null): DexscreenerPairRef | null {
  if (!network || !pair) return null
  return { network: network.toLowerCase(), pair: pair.toLowerCase() }
}

function buildPairRefFromUrl(url?: string | null): DexscreenerPairRef | null {
  if (!url) return null
  const parsed = parseDexscreenerLink(url)
  if (!parsed.network || !parsed.pair) return null
  return buildPairRef(parsed.network, parsed.pair)
}

async function fetchDexPrice(ref: DexscreenerPairRef, strict = false): Promise<DexPriceResult | null> {
  const quote: DexscreenerQuote | null = strict
    ? await getDexPairQuoteStrict(ref.network, ref.pair)
    : await getDexPairQuote(ref.network, ref.pair)
  if (!quote) return null
  const baseline = deriveBaseline(quote.priceUsd, quote.changePct)
  const url = buildPairViewUrl(ref) || buildDexscreenerViewUrl(undefined, ref.network, ref.pair) || undefined
  return {
    priceUsd: quote.priceUsd,
    changePct: quote.changePct,
    baselineUsd: baseline,
    timestamp: new Date(quote.fetchedAt).toISOString(),
    pair: { network: ref.network, pair: ref.pair },
    url,
    source: 'dexscreener'
  }
}


