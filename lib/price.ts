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
 * tokenId; isim, isim lower, ticker (WIRE), ticker lower vb. ne gelirse
 * yakalayabilecek şekilde esnek tutuldu.
 */
function findRowForToken(tokenId: string): TokenRow | null {
  const id = normalize(tokenId)

  if (!id) return null

  // Önce direkt isim eşleşmesi
  let row =
    rows.find(
      (r) => normalize(r['CARD NAME / TOKEN NAME']) === id
    ) || null

  if (row) return row

  // Sonra ticker (WIRE, ALTT vs.) ile eşleşmeye çalış
  row =
    rows.find((r) => {
      const tickerRaw = (r.TICKER || '').replace('$', '')
      const tickerNorm = normalize(tickerRaw)
      return tickerNorm === id
    }) || null

  if (row) return row

  // Son çare: tokenId bir isim parçasıysa (ör: 'wire', 'virgen')
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

function deriveBaseline(currentPrice: number, changePct?: number): number {
  if (!isFinite(changePct ?? NaN) || (changePct as number) <= -100 || changePct === 0) {
    return currentPrice
  }
  const baseline = currentPrice / (1 + (changePct as number) / 100)
  return baseline > 0 ? baseline : currentPrice
}

/**
 * token-list.json içindeki linkten direkt Dexscreener (veya ne verdiyse) çağır
 */
async function fetchPriceFromRow(row: TokenRow): Promise<DirectPriceResult | null> {
  const url = row['GECKO TERMINAL POOL LINK']
  if (!url) return null

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json'
      }
    })

    if (!res.ok) {
      console.error('Price fetch error:', res.status, url)
      return null
    }

    const data = await res.json()

    const pair = Array.isArray(data?.pairs) ? data.pairs[0] : null
    if (!pair || !pair.priceUsd) {
      console.error('No priceUsd in response for', row['CARD NAME / TOKEN NAME'])
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

    const dexNetwork =
      typeof pair.chainId === 'string' && pair.chainId.length > 0
        ? String(pair.chainId)
        : 'base'

    const dexPair =
      typeof pair.pairAddress === 'string' && pair.pairAddress.length > 0
        ? String(pair.pairAddress)
        : typeof pair.poolAddress === 'string' && pair.poolAddress.length > 0
          ? String(pair.poolAddress)
          : ''

    const dexUrl =
      typeof pair.url === 'string' && pair.url.length > 0
        ? String(pair.url)
        : dexPair
          ? `https://dexscreener.com/${dexNetwork}/${dexPair}`
          : undefined

    return {
      p0: baseline,
      pLive: price,
      pClose: price,
      changePct: isFinite(changeRaw) ? changeRaw : 0,
      fdv,
      ts: new Date().toISOString(),
      source: 'dexscreener-direct-json',
      dexNetwork,
      dexPair: dexPair || undefined,
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
  // 1️⃣ token-list.json’da bu tokenId'ye karşılık gelen satırı bul
  const row = findRowForToken(tokenId)

  if (row) {
    const direct = await fetchPriceFromRow(row)
    if (direct) {
      return direct
    }
  } else {
    console.warn('No row found in token-list.json for tokenId:', tokenId)
  }

  // 2️⃣ Son çare: random fallback (artık yalnızca gerçekten çözümsüz kaldığında)
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
