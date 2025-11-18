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
  fdv?: number
  fetchedAt: number
  raw: any
}

const CACHE_TTL_MS = 45_000
const NULL_CACHE_TTL_MS = 60_000
const CHUNK_SIZE = 30
const FLUSH_DELAY_MS = 25
const MAX_RETRY = 3

const EXTERNAL_HEADERS: Record<string, string> = {
  accept: 'application/json',
  'user-agent': 'FlipRoyale/1.0 (+https://fliproyale.xyz)'
}

type CacheEntry = {
  expiresAt: number
  value: DexscreenerQuote | null
}

type NetworkQueue = {
  pairs: Set<string>
  resolvers: Map<string, Array<{ resolve: (v: DexscreenerQuote | null) => void; reject: (e: any) => void }>>
  timer?: NodeJS.Timeout
}

// Global cache maps
const globalAny = globalThis as any
const pairCache: Map<string, CacheEntry> = globalAny.__flip_dex_cache ?? (globalAny.__flip_dex_cache = new Map())
const networkQueues: Map<string, NetworkQueue> = globalAny.__flip_dex_q ?? (globalAny.__flip_dex_q = new Map())

function toKey(network: string, pair: string) {
  return `${network}:${pair}`.toLowerCase()
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isHex(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s)
}

/**
 * Ana fonksiyon — Dexscreener üzerinden fiyat çekme
 */
export async function getDexPairQuote(network: string, pair: string): Promise<DexscreenerQuote | null> {
  if (!network || !pair) return null

  const key = toKey(network, pair)
  const now = Date.now()

  // Cache hit
  const cached = pairCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  // Yeni fetch queue'ya giriyor
  return enqueue(network, pair)
}

/**
 * tokens.ts → Token nesnesi → pair bul
 */
export async function findDexPairForToken(t: Token): Promise<DexscreenerPairRef | null> {
  if (!t?.dexscreenerNetwork || !t?.dexscreenerPair) return null

  return {
    network: t.dexscreenerNetwork,
    pair: t.dexscreenerPair
  }
}

/**
 * Ağ bazlı fetch kuyruğu oluşturur
 */
function getNetworkQueue(network: string): NetworkQueue {
  const net = network.toLowerCase()
  let q = networkQueues.get(net)
  if (!q) {
    q = {
      pairs: new Set(),
      resolvers: new Map()
    }
    networkQueues.set(net, q)
  }
  return q
}

function enqueue(network: string, pair: string): Promise<DexscreenerQuote | null> {
  const q = getNetworkQueue(network)
  const p = pair.toLowerCase()

  return new Promise((resolve, reject) => {
    const arr = q.resolvers.get(p) || []
    arr.push({ resolve, reject })
    q.resolvers.set(p, arr)

    q.pairs.add(p)

    if (!q.timer) {
      q.timer = setTimeout(() => flushQueue(network), FLUSH_DELAY_MS)
    }
  })
}

async function flushQueue(network: string) {
  const net = network.toLowerCase()
  const q = networkQueues.get(net)
  if (!q) return

  q.timer = undefined

  const pairs = Array.from(q.pairs)
  q.pairs.clear()

  const resolvers = q.resolvers
  q.resolvers = new Map()

  for (let i = 0; i < CHUNK_SIZE; i += CHUNK_SIZE) {
    const chunk = pairs.slice(i, i + CHUNK_SIZE)
    await fetchChunk(net, chunk, resolvers)
  }
}

async function fetchChunk(
  network: string,
  chunk: string[],
  resolvers: Map<string, Array<{ resolve: (v: DexscreenerQuote | null) => void; reject: (e: any) => void }>>
) {
  const url = `https://api.dexscreener.com/latest/dex/pairs/${network}/${chunk.join(',')}`

  let attempt = 0
  let lastErr: any = null

  while (attempt < MAX_RETRY) {
    try {
      const res = await fetch(url, { headers: EXTERNAL_HEADERS })

      if (res.status === 429) {
        await delay(250 * Math.pow(2, attempt))
        attempt++
        continue
      }

      if (!res.ok) {
        lastErr = new Error(`Dexscreener HTTP ${res.status}`)
        break
      }

      const json: any = await res.json()
      const list: any[] = Array.isArray(json?.pairs) ? json.pairs : []

      const mapped = new Map<string, DexscreenerQuote>()

      for (const it of list) {
        const addr = (it?.pairAddress || '').toLowerCase()
        const priceUsd = Number(it?.priceUsd)
        if (!addr || !isFinite(priceUsd)) continue

        const changePct = Number(
          it?.priceChange?.h24 ??
          it?.priceChange?.h6 ??
          it?.priceChange?.h1 ??
          it?.priceChange?.m5 ??
          0
        )

        const liquidityUsd = Number(it?.liquidity?.usd ?? 0)
        const fdvRaw = it?.fdv
        const fdv = typeof fdvRaw === 'number' ? fdvRaw : Number(fdvRaw?.usd ?? 0)

        mapped.set(addr, {
          network,
          pair: addr,
          priceUsd,
          changePct: isFinite(changePct) ? changePct : undefined,
          liquidityUsd: isFinite(liquidityUsd) ? liquidityUsd : undefined,
          fdv: isFinite(fdv) && fdv > 0 ? fdv : undefined,
          fetchedAt: Date.now(),
          raw: it
        })
      }

      // Çözümle
      for (const key of chunk) {
        const lower = key.toLowerCase()
        const quote = mapped.get(lower) ?? null
        resolvePair(network, lower, quote, resolvers)
      }

      return
    } catch (err) {
      lastErr = err
      attempt++
      await delay(200 * attempt)
    }
  }

  // Başarısız olursa hepsi null
  for (const key of chunk) {
    rejectPair(key.toLowerCase(), lastErr, resolvers)
  }
}

function resolvePair(
  network: string,
  pair: string,
  quote: DexscreenerQuote | null,
  resolvers: Map<string, Array<{ resolve: (v: DexscreenerQuote | null) => void; reject: (e: any) => void }>>
) {
  const key = toKey(network, pair)
  const expires = Date.now() + (quote ? CACHE_TTL_MS : NULL_CACHE_TTL_MS)

  pairCache.set(key, { value: quote, expiresAt: expires })

  const arr = resolvers.get(pair) || []
  for (const { resolve } of arr) resolve(quote)
}

function rejectPair(
  pair: string,
  error: any,
  resolvers: Map<string, Array<{ resolve: (v: DexscreenerQuote | null) => void; reject: (e: any) => void }>>
) {
  const arr = resolvers.get(pair) || []
  for (const { reject } of arr) reject(error)
}

export function buildPairViewUrl(ref: DexscreenerPairRef | null | undefined): string | undefined {
  if (!ref) return undefined
  return buildDexscreenerViewUrl(undefined, ref.network, ref.pair)
}
