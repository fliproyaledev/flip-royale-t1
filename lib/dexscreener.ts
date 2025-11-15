import type { Token } from './tokens'
import { buildDexscreenerViewUrl } from './tokens'

export type DexscreenerPairRef = {
  network: string
  pair: string
}

export type DexscreenerQuote = {
  network: string
  pair: string
  priceUsd: number
  changePct?: number
  liquidityUsd?: number
  fdv?: number // Fully Diluted Valuation in USD
  fetchedAt: number
  raw: any
}

const CACHE_TTL_MS = 45_000
const NULL_CACHE_TTL_MS = 60_000
const CHUNK_SIZE = 30
const FLUSH_DELAY_MS = 25
const MAX_RETRY = 3
const SEARCH_CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours
const SEARCH_MIN_INTERVAL_MS = 400

const EXTERNAL_HEADERS: Record<string, string> = {
  accept: 'application/json',
  'user-agent': 'FlipFlopPriceBot/1.0 (+https://flipflop.local)'
}

type CacheEntry = {
  expiresAt: number
  value: DexscreenerQuote | null
}

type NetworkQueue = {
  pairs: Set<string>
  resolvers: Map<string, Array<{ resolve: (value: DexscreenerQuote | null) => void, reject: (err: any) => void }>>
  timer?: NodeJS.Timeout
}

type SearchCacheEntry = {
  expiresAt: number
  value: DexscreenerPairRef | null
}

const globalAny = globalThis as any

const pairCache: Map<string, CacheEntry> = globalAny.__flipflopDexCache ?? (globalAny.__flipflopDexCache = new Map())
const networkQueues: Map<string, NetworkQueue> = globalAny.__flipflopDexQueues ?? (globalAny.__flipflopDexQueues = new Map())
const searchCache: Map<string, SearchCacheEntry> = globalAny.__flipflopDexSearchCache ?? (globalAny.__flipflopDexSearchCache = new Map())

let searchChain: Promise<unknown> = Promise.resolve()
let lastSearchAt = 0

function toKey(network: string, pair: string): string {
  return `${network.toLowerCase()}:${pair.toLowerCase()}`
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isHexAddressLower(s: string): boolean {
  return /^0x[0-9a-f]{40}$/.test(s)
}

export async function getDexPairQuote(network: string, pair: string): Promise<DexscreenerQuote | null> {
  if (!network || !pair) return null
  const key = toKey(network, pair)
  const now = Date.now()
  const cached = pairCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }
  return enqueue(network, pair)
}

function normalizeRef(ref: DexscreenerPairRef | null | undefined): DexscreenerPairRef | null {
  if (!ref || !ref.network || !ref.pair) return null
  return {
    network: ref.network.toLowerCase(),
    pair: ref.pair.toLowerCase()
  }
}

export async function findDexPairForToken(token: Token): Promise<DexscreenerPairRef | null> {
  if (!token?.symbol && !token?.name) return null
  const preferNetwork = (token.dexscreenerNetwork || 'base').toLowerCase()
  const cacheKey = `${token.id || token.symbol || token.name}::${preferNetwork}`
  const cached = searchCache.get(cacheKey)
  const now = Date.now()
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  const attemptSearch = async () => {
    const queries = Array.from(new Set([token.symbol, token.name].filter(Boolean))) as string[]
    for (const query of queries) {
      const result = await runSearch(query, token, preferNetwork)
      if (result) {
        const normalized = normalizeRef(result)
        searchCache.set(cacheKey, { value: normalized, expiresAt: now + SEARCH_CACHE_TTL_MS })
        return normalized
      }
    }
    searchCache.set(cacheKey, { value: null, expiresAt: now + SEARCH_CACHE_TTL_MS / 4 })
    return null
  }

  const job = async () => {
    try {
      return await attemptSearch()
    } finally {
      // Nothing to do; cache handled above
    }
  }

  const chained = searchChain.then(job, job)
  searchChain = chained.then(() => undefined).catch(() => undefined)
  const value = await chained
  return value
}

async function runSearch(query: string, token: Token, requiredNetwork: string): Promise<DexscreenerPairRef | null> {
  const trimmed = query?.trim()
  if (!trimmed) return null
  const wait = Math.max(0, SEARCH_MIN_INTERVAL_MS - (Date.now() - lastSearchAt))
  if (wait > 0) {
    await delay(wait)
  }
  lastSearchAt = Date.now()
  const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(trimmed)}`
  try {
    const response = await fetch(url, { headers: EXTERNAL_HEADERS })
    if (!response.ok) {
      return null
    }
    const json: any = await response.json()
    const pairs: any[] = Array.isArray(json?.pairs) ? json.pairs : []
    if (!pairs.length) return null
    const matches = pairs.filter(p => String(p?.chainId || '').toLowerCase() === requiredNetwork)
    if (!matches.length) return null
    const targetSymbol = (token.symbol || '').toUpperCase()
    const scored = matches
      .map(p => ({
        record: p,
        score: scoreRecord(p, requiredNetwork, targetSymbol, false)
      }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)

    const fallback = scored.length ? scored : matches
      .map(p => ({
        record: p,
        score: scoreRecord(p, requiredNetwork, targetSymbol, true)
      }))
      .sort((a, b) => b.score - a.score)

    const pick = (scored[0] ?? fallback[0])?.record
    if (!pick) return null
    const network = String(pick.chainId || '').trim().toLowerCase()
    const pair = String(pick.pairAddress || '').trim().toLowerCase()
    if (!network || !pair) return null
    return { network, pair }
  } catch (err) {
    console.error('[dex] search error', query, err)
    return null
  }
}

function scoreRecord(record: any, preferNetwork?: string, targetSymbol?: string, lenient = false): number {
  let score = 0
  const network = String(record?.chainId || '').toLowerCase()
  const symbol = String(record?.baseToken?.symbol || '').toUpperCase()
  const liquidity = Number(record?.liquidity?.usd ?? 0)
  if (liquidity > 0) {
    score += Math.log10(liquidity + 10)
  }
  if (preferNetwork && network === preferNetwork) {
    score += 20
  }
  if (targetSymbol) {
    if (symbol === targetSymbol) {
      score += 50
    } else if (!lenient) {
      return 0
    } else if (symbol.includes(targetSymbol)) {
      score += 5
    }
  }
  const age = Number(record?.pairCreatedAt ?? 0)
  if (age > 0) {
    score += age / 1e9
  }
  return score
}

async function enqueue(network: string, pair: string): Promise<DexscreenerQuote | null> {
  const queue = getNetworkQueue(network)
  const normalizedPair = pair.toLowerCase()
  return new Promise<DexscreenerQuote | null>((resolve, reject) => {
    const resolvers = queue.resolvers.get(normalizedPair) || []
    resolvers.push({ resolve, reject })
    queue.resolvers.set(normalizedPair, resolvers)
    queue.pairs.add(normalizedPair)
    if (!queue.timer) {
      queue.timer = setTimeout(() => flushNetworkQueue(network), FLUSH_DELAY_MS)
    }
  })
}

function getNetworkQueue(network: string): NetworkQueue {
  const normalized = network.toLowerCase()
  let queue = networkQueues.get(normalized)
  if (!queue) {
    queue = {
      pairs: new Set(),
      resolvers: new Map()
    }
    networkQueues.set(normalized, queue)
  }
  return queue
}

async function flushNetworkQueue(network: string) {
  const normalized = network.toLowerCase()
  const queue = networkQueues.get(normalized)
  if (!queue) return
  queue.timer = undefined
  const pairs = Array.from(queue.pairs)
  queue.pairs.clear()
  const resolvers = queue.resolvers
  queue.resolvers = new Map()

  for (let i = 0; i < pairs.length; i += CHUNK_SIZE) {
    const chunk = pairs.slice(i, i + CHUNK_SIZE)
    await fetchChunk(normalized, chunk, resolvers)
  }
}

async function fetchChunk(network: string, chunk: string[], resolvers: Map<string, Array<{ resolve: (value: DexscreenerQuote | null) => void, reject: (err: any) => void }>>) {
  const url = `https://api.dexscreener.com/latest/dex/pairs/${network}/${chunk.join(',')}`
  let attempt = 0
  let lastError: any = null
  while (attempt < MAX_RETRY) {
    try {
      const response = await fetch(url, { headers: EXTERNAL_HEADERS })
      if (response.status === 429) {
        const backoff = 250 * Math.pow(2, attempt)
        await delay(backoff)
        attempt += 1
        continue
      }
      if (!response.ok) {
        lastError = new Error(`Dexscreener responded ${response.status}`)
        break
      }
      const json: any = await response.json()
      const pairs: any[] = Array.isArray(json?.pairs) ? json.pairs : []
      const map = new Map<string, DexscreenerQuote>()
      for (const item of pairs) {
        const address = String(item?.pairAddress || '').toLowerCase()
        const priceUsd = Number(item?.priceUsd)
        if (!address || !isFinite(priceUsd) || priceUsd <= 0) continue
        const changePct = Number(item?.priceChange?.h24 ?? item?.priceChange?.h6 ?? item?.priceChange?.h1 ?? item?.priceChange?.m5)
        const liquidityUsd = Number(item?.liquidity?.usd ?? 0)
        const fdvRaw = item?.fdv
        const fdv = typeof fdvRaw === 'number' ? fdvRaw : Number(fdvRaw?.usd ?? 0)
        map.set(address, {
          network,
          pair: address,
          priceUsd,
          changePct: isFinite(changePct) ? changePct : undefined,
          liquidityUsd: isFinite(liquidityUsd) ? liquidityUsd : undefined,
          fdv: isFinite(fdv) && fdv > 0 ? fdv : undefined,
          fetchedAt: Date.now(),
          raw: item
        })
      }
      // First pass: resolve anything we got directly
      const unresolved: string[] = []
      for (const addr of chunk) {
        const key = addr.toLowerCase()
        const entry = map.get(key) ?? null
        if (entry) {
          resolvePair(network, key, entry, resolvers)
        } else {
          unresolved.push(key)
        }
      }

      // Second pass: for unresolved addresses that look like token contracts,
      // try to map token -> best pair, then fetch that pair's quote.
      for (const tokenAddr of unresolved) {
        if (!isHexAddressLower(tokenAddr)) {
          resolvePair(network, tokenAddr, null, resolvers)
          continue
        }
        const bestPair = await resolveTokenToBestPair(network, tokenAddr)
        if (!bestPair) {
          resolvePair(network, tokenAddr, null, resolvers)
          continue
        }
        // Fetch the best pair's quote
        const quote = await fetchSinglePair(network, bestPair)
        if (quote) {
          // Cache under both the real pair address and the original token address key
          const realKey = toKey(network, bestPair)
          pairCache.set(realKey, { value: quote, expiresAt: Date.now() + CACHE_TTL_MS })
          resolvePair(network, tokenAddr, quote, resolvers)
        } else {
          resolvePair(network, tokenAddr, null, resolvers)
        }
      }
      return
    } catch (err) {
      lastError = err
      attempt += 1
      await delay(200 * attempt)
    }
  }
  // Failed after retries
  for (const addr of chunk) {
    const key = addr.toLowerCase()
    rejectPair(key, lastError, resolvers)
  }
}

async function fetchSinglePair(network: string, pair: string): Promise<DexscreenerQuote | null> {
  const url = `https://api.dexscreener.com/latest/dex/pairs/${network}/${pair}`
  let attempt = 0
  while (attempt < MAX_RETRY) {
    try {
      const r = await fetch(url, { headers: EXTERNAL_HEADERS })
      if (r.status === 429) {
        // Exponential backoff on rate limit
        await delay(250 * Math.pow(2, attempt))
        attempt += 1
        continue
      }
      if (!r.ok) {
        return null
      }
      const j: any = await r.json()
      const item = j?.pair || (Array.isArray(j?.pairs) ? j.pairs[0] : null)
      if (!item) return null
      const address = String(item?.pairAddress || '').toLowerCase()
      const priceUsd = Number(item?.priceUsd)
      if (!address || !isFinite(priceUsd) || priceUsd <= 0) return null
      const changePct = Number(item?.priceChange?.h24 ?? item?.priceChange?.h6 ?? item?.priceChange?.h1 ?? item?.priceChange?.m5)
      const liquidityUsd = Number(item?.liquidity?.usd ?? 0)
      const fdvRaw = item?.fdv
      const fdv = typeof fdvRaw === 'number' ? fdvRaw : Number(fdvRaw?.usd ?? 0)
      return {
        network,
        pair: address,
        priceUsd,
        changePct: isFinite(changePct) ? changePct : undefined,
        liquidityUsd: isFinite(liquidityUsd) ? liquidityUsd : undefined,
        fdv: isFinite(fdv) && fdv > 0 ? fdv : undefined,
        fetchedAt: Date.now(),
        raw: item
      }
    } catch {
      attempt += 1
      await delay(200 * attempt)
    }
  }
  return null
}

// Strict quote fetch: never remap a token address to a different pair.
// Useful when the caller provides an explicit LP address and wants only that.
export async function getDexPairQuoteStrict(network: string, pair: string): Promise<DexscreenerQuote | null> {
  if (!network || !pair) return null
  const net = network.toLowerCase()
  const pr = pair.toLowerCase()
  const key = toKey(net, pr)
  const now = Date.now()
  const cached = pairCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }
  const quote = await fetchSinglePair(net, pr)
  // Cache both hit and miss so we naturally throttle repeat calls
  pairCache.set(key, { value: quote, expiresAt: now + (quote ? CACHE_TTL_MS : NULL_CACHE_TTL_MS) })
  return quote
}

async function resolveTokenToBestPair(network: string, tokenAddress: string): Promise<string | null> {
  // Try chain-specific token endpoint first
  try {
    const tokenUrl = `https://api.dexscreener.com/latest/dex/tokens/${network}/${tokenAddress}`
    const rt = await fetch(tokenUrl, { headers: EXTERNAL_HEADERS })
    if (rt.ok) {
      const jt: any = await rt.json()
      const pairs: any[] = Array.isArray(jt?.pairs) ? jt.pairs : Array.isArray(jt?.pairs?.pairs) ? jt.pairs.pairs : []
      const pick = pickBestPairFromList(pairs, network, tokenAddress)
      if (pick) return pick
    }
  } catch {}

  // Fallback: C# approach - try global token endpoint (all chains), then filter by network
  try {
    const globalTokenUrl = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
    const rg = await fetch(globalTokenUrl, { headers: EXTERNAL_HEADERS })
    if (rg.ok) {
      const jg: any = await rg.json()
      const pairs: any[] = Array.isArray(jg?.pairs) ? jg.pairs : Array.isArray(jg?.pairs?.pairs) ? jg.pairs.pairs : []
      const pick = pickBestPairFromList(pairs, network, tokenAddress)
      if (pick) return pick
    }
  } catch {}

  // Final fallback to search
  try {
    const rs = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(tokenAddress)}`, { headers: EXTERNAL_HEADERS })
    if (rs.ok) {
      const js: any = await rs.json()
      const pairs: any[] = Array.isArray(js?.pairs) ? js.pairs : []
      const filtered = pairs.filter(p => String(p?.chainId || '').toLowerCase() === network)
      const pick = pickBestPairFromList(filtered, network, tokenAddress)
      if (pick) return pick
    }
  } catch {}

  return null
}

function pickBestPairFromList(pairs: any[], network: string, tokenAddress?: string): string | null {
  if (!pairs || !pairs.length) return null
  const normalized = tokenAddress ? tokenAddress.toLowerCase() : undefined
  
  // Filter: network match, valid pair address, liquidity not null (matching C# approach)
  const valid = pairs
    .filter(p => {
      const chain = String(p?.chainId || '').toLowerCase()
      if (chain !== network) return false
      const addr = String(p?.pairAddress || '').toLowerCase()
      if (!addr || !isHexAddressLower(addr)) return false
      const liq = p?.liquidity?.usd
      if (liq == null) return false // C#: filter out null liquidity
      return true
    })
    .map(p => ({
      addr: String(p.pairAddress).toLowerCase(),
      liquidityUsd: Number(p?.liquidity?.usd ?? 0),
      baseAddr: String(p?.baseToken?.address || '').toLowerCase(),
      quoteAddr: String(p?.quoteToken?.address || '').toLowerCase()
    }))
  
  if (!valid.length) return null
  
  // C# approach: OrderByDescending liquidity.Usd, then FirstOrDefault
  // We also prefer pairs where tokenAddress matches base/quote
  valid.sort((a, b) => {
    // If tokenAddress provided, prefer pairs where it's base/quote
    if (normalized) {
      const aMatches = (a.baseAddr === normalized || a.quoteAddr === normalized) ? 1 : 0
      const bMatches = (b.baseAddr === normalized || b.quoteAddr === normalized) ? 1 : 0
      if (aMatches !== bMatches) return bMatches - aMatches
    }
    // Then sort by liquidity USD descending
    return b.liquidityUsd - a.liquidityUsd
  })
  
  return valid[0]?.addr || null
}

function resolvePair(network: string, pair: string, quote: DexscreenerQuote | null, resolvers: Map<string, Array<{ resolve: (value: DexscreenerQuote | null) => void, reject: (err: any) => void }>>) {
  const key = toKey(network, pair)
  const list = resolvers.get(pair) || []
  const expires = Date.now() + (quote ? CACHE_TTL_MS : NULL_CACHE_TTL_MS)
  pairCache.set(key, { value: quote, expiresAt: expires })
  for (const { resolve } of list) {
    resolve(quote)
  }
}

function rejectPair(pair: string, error: any, resolvers: Map<string, Array<{ resolve: (value: DexscreenerQuote | null) => void, reject: (err: any) => void }>>) {
  const list = resolvers.get(pair) || []
  for (const { reject } of list) {
    reject(error)
  }
}

export function buildPairViewUrl(ref: DexscreenerPairRef | null | undefined): string | undefined {
  if (!ref) return undefined
  return buildDexscreenerViewUrl(undefined, ref.network, ref.pair)
}


