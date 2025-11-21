// lib/price.ts

import tokenList from './token-list.json'

type TokenRow = {
  TYPE: string
  'CARD NAME / TOKEN NAME': string
  TICKER: string
  'GECKO TERMINAL POOL LINK': string
  'IMAGE NAME': string
}

type DirectPriceResult = {
  p0: number
  pLive: number
  pClose: number
  changePct: number
  fdv: number
  ts: string
  source: string
  dexNetwork?: string
  dexPair?: string
  dexUrl?: string
}

const rows: TokenRow[] = (tokenList as any)?.Sayfa1 ?? []

function normalize(str: string | undefined | null) {
  return (str || '').trim().toLowerCase()
}

/**
 * tokenId -> token-list.json satırı
 */
function findRowForToken(tokenId: string): TokenRow | null {
  const id = normalize(tokenId)
  if (!id) return null

  // 1) İsim ile birebir eşleşme
  let row =
    rows.find(
      (r) => normalize(r['CARD NAME / TOKEN NAME']) === id
    ) || null
  if (row) return row

  // 2) Ticker ile eşleşme (WIRE, ALTT vs.)
  row =
    rows.find((r) => {
      const tickerRaw = (r.TICKER || '').replace('$', '')
      const tickerNorm = normalize(tickerRaw)
      return tickerNorm === id
    }) || null
  if (row) return row

  // 3) İsim / ticker içinde geçiyorsa
  row =
    rows.find((r) => {
      const nameNorm = normalize(r['CARD NAME / TOKEN NAME'])
      const tickerRaw = (r.TICKER || '').replace('$', '')
      const tickerNorm = normalize(tickerRaw)
      return (
        nameNorm === id ||
        tickerNorm === id ||
        nameNorm.includes(id) ||
        tickerNorm.includes(id)
      )
    }) || null

  return row || null
}

/**
 * Her türlü "pool link" içinden chainId + pairId çıkar
 * Örn:
 *  - https://api.dexscreener.io/latest/dex/pairs/base/pools/0xABC...
 *  - https://dexscreener.com/base/0xABC...
 *  - https://www.geckoterminal.com/base/pools/0xABC...
 */
function getDexParamsFromLink(rawLink: string): { chainId: string; pairId: string } | null {
  const link = (rawLink || '').trim()
  if (!link) return null

  // 0x... adresini yakala
  const addrMatch = link.match(/0x[0-9a-fA-F]{40}/)
  if (!addrMatch) return null
  const pairId = addrMatch[0]

  // chainId tahmini: linkte geçen bilinen chainlerden biri
  const chainMatch = link.match(
    /(ethereum|bsc|bnb|polygon|matic|avalanche|avax|fantom|ftm|harmony|arbitrum|optimism|base|blast|scroll|linea|mantle|solana)/i
  )
  const chainId = chainMatch ? chainMatch[1].toLowerCase() : 'base'

  return { chainId, pairId }
}

function deriveBaseline(currentPrice: number, changePct?: number): number {
  if (!isFinite(changePct ?? NaN) || (changePct as number) <= -100 || changePct === 0) {
    return currentPrice
  }
  const baseline = currentPrice / (1 + (changePct as number) / 100)
  return baseline > 0 ? baseline : currentPrice
}

/**
 * token-list.json satırından gerçek Dexscreener API endpoint'ine gidip fiyat çeker
 */
async function fetchPriceFromRow(row: TokenRow): Promise<DirectPriceResult | null> {
  const params = getDexParamsFromLink(row['GECKO TERMINAL POOL LINK'])
  if (!params) {
    console.error('No pairId/chainId could be derived from link for', row['CARD NAME / TOKEN NAME'])
    return null
  }

  const { chainId, pairId } = params
  const apiUrl = `https://api.dexscreener.com/latest/dex/pairs/${chainId}/${pairId}`

  try {
    const res = await fetch(apiUrl, {
      headers: {
        Accept: 'application/json'
      }
    })

    if (!res.ok) {
      console.error('Dexscreener API error:', res.status, apiUrl)
      return null
    }

    const data = await res.json()
    const pair = Array.isArray(data?.pairs) ? data.pairs[0] : null
    if (!pair || !pair.priceUsd) {
      console.error('No priceUsd in Dexscreener response for', row['CARD NAME / TOKEN NAME'])
      return null
    }

    const price = Number(pair.priceUsd)
    if (!isFinite(price) || price <= 0) return null

    const changeRaw =
      pair.priceChange && typeof pair.priceChange.h24 !== 'undefined'
        ? Number(pair.priceChange.h24)
        : 0

    const baseline = deriveBaseline(price, changeRaw)
    const fdv = pair.fdv != null ? Number(pair.fdv) : 0

    const dexNetwork = String(pair.chainId || chainId || 'base')
    const dexPair = String(pair.pairAddress || pairId)
    const dexUrl = typeof pair.url === 'string' && pair.url.length > 0
      ? String(pair.url)
      : `https://dexscreener.com/${dexNetwork}/${dexPair}`

    return {
      p0: baseline,
      pLive: price,
      pClose: price,
      changePct: isFinite(changeRaw) ? changeRaw : 0,
      fdv,
      ts: new Date().toISOString(),
      source: 'dexscreener-direct',
      dexNetwork,
      dexPair,
      dexUrl
    }
  } catch (err) {
    console.error('Exception while fetching price for', row['CARD NAME / TOKEN NAME'], err)
    return null
  }
}

/**
 * Unified price getter for CRON and backend use
 * Returns p0, pLive, pClose and changePct exactly like /api/price endpoint
 */
export async function getPriceForToken(tokenId: string) {
  // 1️⃣ token-list.json’da satırı bul
  const row = findRowForToken(tokenId)

  if (row) {
    const direct = await fetchPriceFromRow(row)
    if (direct) {
      return direct
    }
  } else {
    console.warn('No row found in token-list.json for tokenId:', tokenId)
  }

  // 2️⃣ Son çare: random fallback (artık sadece gerçekten mecbur kalırsak)
  console.warn('FALLBACK price used for token', tokenId)
  const base = 1 + Math.random() * 3
  return {
    p0: base,
    pLive: base,
    pClose: base,
    changePct: 0,
    fdv: 0,
    ts: new Date().toISOString(),
    source: 'fallback'
  }
}
