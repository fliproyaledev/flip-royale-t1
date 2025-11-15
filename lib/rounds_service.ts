import { TOKENS, parseDexscreenerLink } from './tokens'
import type { DexscreenerPairRef, DexscreenerQuote } from './dexscreener'
import { getDexPairQuote } from './dexscreener'
import { getGeckoPoolQuote } from './gecko'
import { addRoundSnapshot, type RoundPriceItem } from './rounds'

function deriveBaseline(currentPrice: number, changePct?: number): number {
  if (!isFinite(changePct ?? NaN) || (changePct as number) <= -100 || (changePct as number) === 0) {
    return currentPrice
  }
  const baseline = currentPrice / (1 + (changePct as number) / 100)
  return baseline > 0 ? baseline : currentPrice
}

function buildExplicitPair(token: any): DexscreenerPairRef | null {
  const net = (token?.dexscreenerNetwork || '').toLowerCase()
  const pr = (token?.dexscreenerPair || '').toLowerCase()
  if (net && pr) return { network: net, pair: pr }
  if (token?.dexscreenerUrl) {
    const parsed = parseDexscreenerLink(token.dexscreenerUrl)
    if (parsed.network && parsed.pair) {
      return { network: parsed.network.toLowerCase(), pair: parsed.pair.toLowerCase() }
    }
  }
  return null
}

export async function closeRound(): Promise<{ id: string; count: number }> {
  const nowIso = new Date().toISOString()
  const items: RoundPriceItem[] = []
  for (const token of TOKENS) {
    const explicit = buildExplicitPair(token)
    let price: number | null = null
    let changePct: number | undefined
    let source: string | undefined

    if (explicit) {
      const q: DexscreenerQuote | null = await getDexPairQuote(explicit.network, explicit.pair)
      if (q) {
        price = q.priceUsd
        changePct = q.changePct
        source = 'dexscreener'
      } else {
        const g = await getGeckoPoolQuote(explicit.network, explicit.pair, token.symbol)
        if (g) {
          price = g.priceUsd
          changePct = g.changePct
          source = 'gecko'
        }
      }
    }

    if (price != null) {
      const p0 = deriveBaseline(price, changePct)
      items.push({
        tokenId: token.id,
        p0,
        pClose: price,
        ts: nowIso,
        source,
        network: explicit?.network,
        pair: explicit?.pair
      })
    }
  }

  await addRoundSnapshot({ id: nowIso, items })
  return { id: nowIso, count: items.length }
}


