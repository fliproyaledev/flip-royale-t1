import type { NextApiRequest, NextApiResponse } from 'next'
import { TOKENS } from '../../../lib/tokens'
import type { DexscreenerPairRef, DexscreenerQuote } from '../../../lib/dexscreener'
import { getDexPairQuote } from '../../../lib/dexscreener'
import { getGeckoPoolQuote } from '../../../lib/gecko'
import { getLatestRound } from '../../../lib/rounds'
import { parseDexscreenerLink } from '../../../lib/tokens'

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const snapshot = await getLatestRound()
  if (!snapshot) {
    return res.status(200).json({ roundId: null, items: [] })
  }

  const p0ById = new Map(snapshot.items.map(i => [i.tokenId, i.p0]))

  const items = []
  for (const token of TOKENS) {
    const p0 = p0ById.get(token.id)
    if (!p0 || !(p0 > 0)) continue
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
    if (price == null) continue
    const pct = ((price - p0) / p0) * 100
    items.push({
      tokenId: token.id,
      p0,
      pLive: price,
      pClose: price,
      changePct: pct,
      source,
      network: explicit?.network,
      pair: explicit?.pair
    })
  }

  return res.status(200).json({ roundId: snapshot.id, items })
}


