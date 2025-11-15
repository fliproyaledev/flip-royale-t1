import tokenListRaw from './token-list.json'

export type Token = {
  id: string
  symbol: string
  name: string
  logo: string
  about: string
  // Dexscreener pair endpoint URL or source URL to derive chain/pair
  dexscreenerUrl?: string
  dexscreenerNetwork?: string
  dexscreenerPair?: string
}

export type DexscreenerLink = {
  network?: string
  pair?: string
}

function parseDexscreenerLink(input?: string): DexscreenerLink {
  if (!input) return {}
  try {
    const trimmed = input.trim()
    if (!trimmed) return {}
    const url = new URL(trimmed)
    if (!url.hostname.includes('dexscreener')) return {}
    const segments = url.pathname.split('/').filter(Boolean)

    let network: string | undefined
    let pair: string | undefined

    const removePools = (value?: string) => {
      if (!value) return value
      return value === 'pools' ? undefined : value
    }

    if (segments.length >= 6 && segments[0] === 'latest' && segments[1] === 'dex' && segments[2] === 'pairs') {
      network = segments[3]
      pair = removePools(segments[4]) ? segments[4] : segments[5]
    } else if (segments.length >= 3 && segments[0] === 'pairs') {
      network = segments[1]
      pair = removePools(segments[2]) ? segments[2] : segments[3]
    } else if (segments.length >= 2) {
      network = segments[0]
      pair = removePools(segments[1]) ? segments[1] : segments[2]
    }

    if (!pair) {
      pair = url.searchParams.get('pairAddress') || undefined
    }
    if (!network) {
      network = url.searchParams.get('chainId') || undefined
    }

    return {
      network: network?.toLowerCase(),
      pair: pair?.toLowerCase()
    }
  } catch {
    return {}
  }
}

export function buildDexscreenerApiUrl(input?: string, network?: string | null, pair?: string | null): string | undefined {
  const info = network && pair ? { network, pair } : parseDexscreenerLink(input)
  if (!info.network || !info.pair) return undefined
  return `https://api.dexscreener.com/latest/dex/pairs/${info.network.toLowerCase()}/${info.pair.toLowerCase()}`
}

export function buildDexscreenerViewUrl(input?: string, network?: string | null, pair?: string | null): string | undefined {
  const info = network && pair ? { network, pair } : parseDexscreenerLink(input)
  if (!info.network || !info.pair) return undefined
  return `https://dexscreener.com/${info.network.toLowerCase()}/${info.pair.toLowerCase()}`
}

type RawRow = {
  [key: string]: any
}

function sanitizeId(input: string): string {
  const base = (input || '').toLowerCase().replace(/^\$+/, '')
  const cleaned = base.replace(/[^a-z0-9]+/g, '')
  return cleaned || 'token'
}

function imageToId(imageName?: string): string {
  if (!imageName) return 'token'
  const base = imageName.split('/').pop() || imageName
  return sanitizeId(base.replace(/\.[a-z0-9]+$/i, ''))
}

function rowToToken(row: RawRow): Token {
  const name = String(row['CARD NAME / TOKEN NAME'] || row['name'] || '').trim()
  const symbol = String(row['TICKER'] || row['symbol'] || '').replace(/\$/g, '').replace(/^\$+/, '').trim().toUpperCase()
  const logoFile = String(row['IMAGE NAME'] || row['image'] || '').trim()
  // Column name kept as-is in the JSON but values are Dexscreener URLs now
  const pool = String(
    row['DEXSCREENER LINK'] ||
    row['GECKO TERMINAL POOL LINK'] ||
    row['dexscreenerUrl'] ||
    ''
  ).trim()
  const parsed = parseDexscreenerLink(pool)
  const type = String(row['TYPE'] || '').trim()
  const derivedId = sanitizeId(symbol) || imageToId(logoFile) || sanitizeId(name)
  const viewUrl = buildDexscreenerViewUrl(pool)
  return {
    id: derivedId,
    symbol: symbol || derivedId.toUpperCase(),
    name: name || symbol || derivedId,
    logo: logoFile ? `/token-logos/${logoFile}` : '/token-logos/placeholder.png',
    about: type || '',
    dexscreenerUrl: viewUrl || pool || undefined,
    dexscreenerNetwork: parsed.network,
    dexscreenerPair: parsed.pair,
  }
}

const jsonRows: RawRow[] = Array.isArray((tokenListRaw as any)?.Sayfa1) ? (tokenListRaw as any).Sayfa1 : []
export const jsonTokens: Token[] = jsonRows.map(rowToToken)

// Seed tokens to ensure backward compatibility with existing demo ids
const seedTokens: Token[] = [
  { id:'virtual', symbol:'VIRTUAL', name:'Virtual Protocol',   logo:'/token-logos/virtual.png',        about:'Virtual Protocol native token.' },
]

const existingIds = new Set(jsonTokens.map(t => t.id))
const merged: Token[] = [
  ...jsonTokens,
  ...seedTokens.filter(t => !existingIds.has(t.id))
]

export const TOKENS: Token[] = merged

export const TOKEN_MAP: Record<string, Token> = Object.fromEntries(
  TOKENS.map(t => [t.id, t])
)

// Known id aliases to keep backward compatibility with older seed ids
export const TOKEN_ALIASES: Record<string, string> = {
  fancy: 'facy',
}

export function getTokenById(id: string): Token | undefined {
  if (!id) return undefined
  const key = id.toLowerCase()
  return TOKEN_MAP[key] || TOKEN_MAP[TOKEN_ALIASES[key]]
}

// Helper to check if token should be visible based on FDV threshold
// Returns true if FDV is >= 10M or if FDV is not available (to avoid hiding tokens without data)
export function isTokenVisibleByFDV(tokenId: string, fdv?: number | null): boolean {
  if (fdv == null || fdv === 0) return true // Show tokens without FDV data
  return fdv >= 10_000_000 // 10M USD threshold
}

export { parseDexscreenerLink }


