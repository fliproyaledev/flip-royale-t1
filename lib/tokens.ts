import tokenListRaw from './token-list.json'

export type Token = {
  id: string
  symbol: string
  name: string
  logo: string
  about: string

  // Dexscreener için ayrılmış alanlar
  dexscreenerUrl?: string
  dexscreenerNetwork?: string
  dexscreenerPair?: string
}

export type DexscreenerLink = {
  network?: string
  pair?: string
}

/**
 * Dexscreener linklerini analiz eder:
 * Örnek:
 * https://dexscreener.com/base/0xEXAMPLEPAIR
 */
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

    const clean = (v?: string) => (v === 'pools' ? undefined : v)

    // en gelişmiş pattern (latest/dex/pairs/network/pair)
    if (segments.length >= 5 && segments[0] === 'latest' && segments[1] === 'dex' && segments[2] === 'pairs') {
      network = clean(segments[3])

      // Dexscreener API linklerinde "pools/:pair" yapısını da destekle
      if (segments[4] === 'pools') {
        pair = clean(segments[5])
      } else {
        pair = clean(segments[4])
      }
    }
    // klasik pattern (pairs/network/pair)
    else if (segments.length >= 3 && segments[0] === 'pairs') {
      network = clean(segments[1])
      pair = clean(segments[2])
    }
    // basit pattern (network/pair)
    else if (segments.length >= 2) {
      network = clean(segments[0])
      pair = clean(segments[1])
    }

    // Eğer hala bulunamadıysa son segmenti pair olarak dene (örn: pools/:pair patterni)
    if (!pair && segments.length >= 1) {
      pair = clean(segments[segments.length - 1])
    }

    if (!pair) pair = url.searchParams.get('pairAddress') || undefined
    if (!network) network = url.searchParams.get('chainId') || undefined

    return {
      network: network?.toLowerCase(),
      pair: pair?.toLowerCase(),
    }
  } catch {
    return {}
  }
}

/** Dexscreener API URL üretir */
export function buildDexscreenerApiUrl(
  input?: string,
  network?: string | null,
  pair?: string | null
): string | undefined {
  const info = network && pair ? { network, pair } : parseDexscreenerLink(input)
  if (!info.network || !info.pair) return undefined

  return `https://api.dexscreener.com/latest/dex/pairs/${info.network}/${info.pair}`
}

/** Dexscreener görüntüleme URL üretir */
export function buildDexscreenerViewUrl(
  input?: string,
  network?: string | null,
  pair?: string | null
): string | undefined {
  const info = network && pair ? { network, pair } : parseDexscreenerLink(input)
  if (!info.network || !info.pair) return undefined

  return `https://dexscreener.com/${info.network}/${info.pair}`
}

type RawRow = { [key: string]: any }

/** Token ID güvenli hale getirilir */
function sanitizeId(input: string): string {
  const base = (input || '').toLowerCase().replace(/^\$+/, '')
  const clean = base.replace(/[^a-z0-9]+/g, '')
  return clean || 'token'
}

function imageToId(imageName?: string): string {
  if (!imageName) return 'token'
  const base = imageName.split('/').pop() || imageName
  return sanitizeId(base.replace(/\.[a-z0-9]+$/i, ''))
}

/** Satırdan token oluşturma */
function rowToToken(row: RawRow): Token {
  const name = String(row['CARD NAME / TOKEN NAME'] || row['name'] || '').trim()
  const symbol = String(row['TICKER'] || row['symbol'] || '')
    .replace(/\$/g, '')
    .trim()
    .toUpperCase()

  const logoFile = String(row['IMAGE NAME'] || row['image'] || '').trim()

  const pool = String(
    row['DEXSCREENER LINK'] ||
    row['GECKO TERMINAL POOL LINK'] ||
    row['dexscreenerUrl'] ||
    ''
  ).trim()

  const parsed = parseDexscreenerLink(pool)
  const type = String(row['TYPE'] || '').trim()

  // ID üretimi
  const derivedId =
    sanitizeId(symbol) ||
    imageToId(logoFile) ||
    sanitizeId(name)

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

/** token-list.json içeriğini çekiyoruz */
const jsonRows: RawRow[] = Array.isArray((tokenListRaw as any)?.Sayfa1)
  ? (tokenListRaw as any).Sayfa1
  : []

export const jsonTokens: Token[] = jsonRows.map(rowToToken)

/** Eski sistem ile uyum için tek seed token */
const seedTokens: Token[] = [
  {
    id: 'virtual',
    symbol: 'VIRTUAL',
    name: 'Virtual Protocol',
    logo: '/token-logos/virtual.png',
    about: 'Virtual Protocol native token.',
  },
]

/** Duplicate engelleme */
const existingIds = new Set(jsonTokens.map(t => t.id))

export const TOKENS: Token[] = [
  ...jsonTokens,
  ...seedTokens.filter(t => !existingIds.has(t.id)),
]

/** Token Map */
export const TOKEN_MAP: Record<string, Token> = Object.fromEntries(
  TOKENS.map(t => [t.id, t])
)

/** Eski ID aliasları */
export const TOKEN_ALIASES: Record<string, string> = {
  fancy: 'facy',
}

/** ID → token */
export function getTokenById(id: string): Token | undefined {
  if (!id) return undefined
  const key = id.toLowerCase()
  return TOKEN_MAP[key] || TOKEN_MAP[TOKEN_ALIASES[key]]
}

/** FDV filtresi – token saklama */
export function isTokenVisibleByFDV(tokenId: string, fdv?: number | null): boolean {
  if (fdv == null || fdv === 0) return true
  return fdv >= 10_000_000
}

export { parseDexscreenerLink }
