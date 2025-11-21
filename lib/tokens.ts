import tokenListRaw from '../data/token-list.json'

export type Token = {
  id: string
  symbol: string
  name: string
  logo: string
  about: string
  dexscreenerUrl?: string
  dexscreenerNetwork?: string
  dexscreenerPair?: string
}

// Yardımcı: Adres Temizleyici (Ne gelirse gelsin saf 0x adresi döndürür)
function cleanAddress(input?: string): string | undefined {
  if (!input) return undefined;
  // Sadece 42 karakterlik 0x ile başlayan hex string'i çekip alır
  const match = input.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0].toLowerCase() : undefined;
}

export type DexscreenerLink = {
  network?: string
  pair?: string
}

export function parseDexscreenerLink(input?: string): DexscreenerLink {
  if (!input) return {}
  try {
    const url = new URL(input)
    const parts = url.pathname.split('/')
    // /base/0x...
    if (parts.length >= 3) {
      return { 
        network: parts[1].toLowerCase(), 
        pair: cleanAddress(parts[2]) 
      }
    }
  } catch {}
  return {}
}

export function buildDexscreenerViewUrl(url?: string, net?: string, pair?: string): string {
  if (url && url.includes('dexscreener.com')) return url
  if (net && pair) {
    const cleanPair = cleanAddress(pair);
    if(cleanPair) return `https://dexscreener.com/${net}/${cleanPair}`
  }
  return ''
}

type RawRow = { [key: string]: any }

// Token ID güvenli hale getirilir
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

// Satırdan token oluşturma (Temizlenmiş Veri İle)
function rowToToken(row: RawRow): Token {
  const name = String(row['CARD NAME / TOKEN NAME'] || row['name'] || '').trim()
  const symbol = String(row['TICKER'] || row['symbol'] || '')
    .replace(/\$/g, '')
    .trim()
    .toUpperCase()

  const logoFile = String(row['IMAGE NAME'] || row['image'] || '').trim()

  // JSON'dan gelen pair linkini al ve temizle
  const rawLink = String(row['GECKO TERMINAL POOL LINK'] || row['dexscreenerPair'] || '').trim()
  const cleanPair = cleanAddress(rawLink)
  const network = 'base' // Varsayılan ağ

  // ID üretimi
  const derivedId = sanitizeId(symbol) || imageToId(logoFile) || sanitizeId(name)

  // View URL oluştur
  const viewUrl = cleanPair ? `https://dexscreener.com/${network}/${cleanPair}` : ''

  return {
    id: derivedId,
    symbol: symbol || derivedId.toUpperCase(),
    name: name || symbol || derivedId,
    logo: logoFile ? `/token-logos/${logoFile}` : '/token-logos/placeholder.png',
    about: String(row['TYPE'] || '').trim(),
    
    // Temizlenmiş veri
    dexscreenerUrl: viewUrl,
    dexscreenerNetwork: network,
    dexscreenerPair: cleanPair,
  }
}

const jsonRows: RawRow[] = Array.isArray((tokenListRaw as any)?.Sayfa1)
  ? (tokenListRaw as any).Sayfa1
  : []

export const jsonTokens: Token[] = jsonRows.map(rowToToken)

const seedTokens: Token[] = [
  {
    id: 'virtual',
    symbol: 'VIRTUAL',
    name: 'Virtual Protocol',
    logo: '/token-logos/virtual.png',
    about: 'Virtual Protocol native token.',
  },
]

const existingIds = new Set(jsonTokens.map(t => t.id))

export const TOKENS: Token[] = [
  ...jsonTokens,
  ...seedTokens.filter(t => !existingIds.has(t.id)),
]

export const TOKEN_MAP: Record<string, Token> = Object.fromEntries(
  TOKENS.map(t => [t.id, t])
)

export const TOKEN_ALIASES: Record<string, string> = {
  fancy: 'facy',
}

export function getTokenById(id: string): Token | undefined {
  if (!id) return undefined
  const key = id.toLowerCase()
  return TOKEN_MAP[key] || TOKEN_MAP[TOKEN_ALIASES[key]]
}
