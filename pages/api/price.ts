// pages/api/price.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import type { Token } from '../../lib/tokens'
import {
  TOKEN_MAP,
  buildDexscreenerViewUrl,
  parseDexscreenerLink
} from '../../lib/tokens'
import type { DexscreenerPairRef, DexscreenerQuote } from '../../lib/dexscreener'
import {
  getDexPairQuote,
  getDexPairQuoteStrict,
  findDexPairForToken,
  buildPairViewUrl
} from '../../lib/dexscreener'
import { getGeckoPoolQuote } from '../../lib/gecko'

type PriceResponse = {
  p0: number
  pLive: number
  pClose: number
  changePct: number
  ts: string
  source: 'dexscreener' | 'gecko' | 'fallback'
  fdv?: number | null
  dexNetwork?: string
  dexPair?: string
  dexUrl?: string
}

// Küçük bir global cache: tokenId -> {network,pair}
const globalAny = globalThis as any
const resolvedPairs: Record<string, DexscreenerPairRef | null> =
  globalAny.__fliproyaleResolvedPairs ??
  (globalAny.__fliproyaleResolvedPairs = {})

// --- Deterministik fallback RNG ---
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seeded(id: string, salt: number) {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i)
  }
  const rnd = mulberry32(h + salt)
  return rnd()
}

// --- Yardımcılar ---

function deriveBaseline(currentPrice: number, changePct?: number): number {
  if (!isFinite(currentPrice) || currentPrice <= 0) return 1
  if (!isFinite(changePct ?? NaN) || changePct === 0 || (changePct ?? 0) <= -100) {
    return currentPrice
  }
  const baseline = currentPrice / (1 + (changePct as number) / 100)
  return baseline > 0 ? baseline : currentPrice
}

function buildPairRef(
  network?: string | null,
  pair?: string | null
): DexscreenerPairRef | null {
  if (!network || !pair) return null
  return {
    network: network.toLowerCase(),
    pair: pair.toLowerCase()
  }
}

function buildPairRefFromUrl(url?: string | null): DexscreenerPairRef | null {
  if (!url) return null
  const parsed = parseDexscreenerLink(url)
  if (!parsed.network || !parsed.pair) return null
  return buildPairRef(parsed.network, parsed.pair)
}

function sameRef(a?: DexscreenerPairRef | null, b?: DexscreenerPairRef | null) {
  if (!a || !b) return false
  return (
    a.network.toLowerCase() === b.network.toLowerCase() &&
    a.pair.toLowerCase() === b.pair.toLowerCase()
  )
}

function quoteToResponse(
  token: Token,
  quote: DexscreenerQuote,
  source: 'dexscreener' | 'gecko'
): PriceResponse {
  const baseline = deriveBaseline(quote.priceUsd, quote.changePct)
  const change =
    isFinite(quote.changePct ?? NaN) && (quote.changePct as number) !== 0
      ? (quote.changePct as number)
      : ((quote.priceUsd - baseline) / baseline) * 100

  const ts =
    typeof quote.fetchedAt === 'number'
      ? new Date(quote.fetchedAt).toISOString()
      : new Date().toISOString()

  const ref: DexscreenerPairRef = {
    network: quote.network,
    pair: quote.pair
  }

  const dexUrl =
    buildPairViewUrl(ref) ||
    token.dexscreenerUrl ||
    buildDexscreenerViewUrl(undefined, ref.network, ref.pair)

  return {
    p0: baseline,
    pLive: quote.priceUsd,
    pClose: quote.priceUsd,
    changePct: change,
    ts,
    source,
    fdv: quote.fdv ?? null,
    dexNetwork: ref.network,
    dexPair: ref.pair,
    dexUrl: dexUrl
  }
}

function geckoToResponse(
  token: Token,
  priceUsd: number,
  changePct: number | undefined,
  fetchedAt: number
): PriceResponse {
  const baseline = deriveBaseline(priceUsd, changePct)
  const change =
    isFinite(changePct ?? NaN) && (changePct as number) !== 0
      ? (changePct as number)
      : ((priceUsd - baseline) / baseline) * 100

  return {
    p0: baseline,
    pLive: priceUsd,
    pClose: priceUsd,
    changePct: change,
    ts: new Date(fetchedAt).toISOString(),
    source: 'gecko'
  }
}

function makeDeterministicPrice(tokenId: string): PriceResponse {
  const now = Date.now()
  const base = 1 + Math.floor(seeded(tokenId, 1) * 300)
  const t = Math.floor(now / 10_000)
  const drift = (seeded(tokenId, t) - 0.5) * 0.08 // ±8%

  const p0 = base
  const pLive = base * (1 + drift)
  const changePct = ((pLive - p0) / p0) * 100

  return {
    p0,
    pLive,
    pClose: pLive,
    changePct,
    ts: new Date(now).toISOString(),
    source: 'fallback'
  }
}

// --- Ana çözümleyici ---

async function resolvePriceForToken(tokenId: string): Promise<PriceResponse> {
  const token = TOKEN_MAP[tokenId]
  if (!token) {
    // Bilinmeyen token → direkt deterministik fallback
    return makeDeterministicPrice(tokenId)
  }

  const preferNetwork = (token.dexscreenerNetwork || 'base').toLowerCase()

  const explicit = buildPairRef(token.dexscreenerNetwork, token.dexscreenerPair)
  const fromUrl = buildPairRefFromUrl(token.dexscreenerUrl)

  const seen = new Set<string>()
  const candidates: DexscreenerPairRef[] = []

  const push = (ref: DexscreenerPairRef | null) => {
    if (!ref) return
    const net = ref.network.toLowerCase()
    const pr = ref.pair.toLowerCase()
    if (net !== preferNetwork) return
    const key = `${net}:${pr}`
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({ network: net, pair: pr })
  }

  // 1) Önce explicit config’ler
  push(explicit)
  push(fromUrl)

  // 2) Daha önce bulunmuş cache’lenmiş pair
  const cached = resolvedPairs[tokenId]
  if (cached && cached.network.toLowerCase() === preferNetwork) {
    // Eğer explicit tanım varsa ve cache ondan farklıysa, cache’i override et
    if (!explicit || sameRef(cached, explicit)) {
      push({
        network: cached.network.toLowerCase(),
        pair: cached.pair.toLowerCase()
      })
    } else {
      resolvedPairs[tokenId] = {
        network: explicit.network,
        pair: explicit.pair
      }
    }
  }

  // --- 1. AŞAMA: Dexscreener üzerinden fiyat ---
  for (const ref of candidates) {
    const isExplicit = !!explicit && sameRef(ref, explicit)
    const quote: DexscreenerQuote | null = isExplicit
      ? await getDexPairQuoteStrict(ref.network, ref.pair)
      : await getDexPairQuote(ref.network, ref.pair)

    if (quote) {
      resolvedPairs[tokenId] = { network: ref.network, pair: ref.pair }
      return quoteToResponse(token, quote, 'dexscreener')
    }
  }

  // --- 2. AŞAMA: Aynı pair’ler için GeckoTerminal fallback ---
  const geckoCandidates: DexscreenerPairRef[] = []
  const pushGecko = (ref: DexscreenerPairRef | null) => {
    if (!ref) return
    geckoCandidates.push({
      network: ref.network.toLowerCase(),
      pair: ref.pair.toLowerCase()
    })
  }

  pushGecko(explicit)
  pushGecko(fromUrl)

  for (const ref of geckoCandidates) {
    const g = await getGeckoPoolQuote(ref.network, ref.pair, token.symbol)
    if (g && isFinite(g.priceUsd) && g.priceUsd > 0) {
      const resp = geckoToResponse(
        token,
        g.priceUsd,
        g.changePct,
        g.fetchedAt ?? Date.now()
      )
      // Gecko’dan network/pair bilgisi ekleyelim
      resp.dexNetwork = ref.network
      resp.dexPair = ref.pair
      resp.dexUrl =
        buildPairViewUrl(ref) ||
        token.dexscreenerUrl ||
        buildDexscreenerViewUrl(undefined, ref.network, ref.pair)
      return resp
    }
  }

  // --- 3. AŞAMA: Hiç explicit pair yoksa, arama ile pair bulmayı dene ---
  if (!explicit && !fromUrl) {
    const searched = await findDexPairForToken(token)
    if (searched) {
      const quote = await getDexPairQuote(
        searched.network,
        searched.pair
      )
      if (quote) {
        resolvedPairs[tokenId] = {
          network: searched.network,
          pair: searched.pair
        }
        return quoteToResponse(token, quote, 'dexscreener')
      }
    }
  }

  // Hiçbiri yoksa → deterministik fallback
  if (!(tokenId in resolvedPairs)) {
    resolvedPairs[tokenId] = null
  }

  return makeDeterministicPrice(tokenId)
}

// --- API Handler ---

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res
      .status(405)
      .json({ ok: false, error: 'Method Not Allowed' })
  }

  const tokenId = String(req.query.token || 'virtual').toLowerCase()

  try {
    const result = await resolvePriceForToken(tokenId)
    return res.status(200).json(result)
  } catch (err: any) {
    console.error('[/api/price] error:', err)
    const fallback = makeDeterministicPrice(tokenId)
    return res.status(200).json(fallback)
  }
}
