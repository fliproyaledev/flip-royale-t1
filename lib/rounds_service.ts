// lib/rounds_service.ts

import { TOKENS, parseDexscreenerLink } from './tokens'
import type { DexscreenerPairRef, DexscreenerQuote } from './dexscreener'
import {
  getDexPairQuoteStrict,
  getDexPairQuote,
  buildPairViewUrl
} from './dexscreener'
import { getGeckoPoolQuote } from './gecko'
import { addRoundSnapshot, type RoundPriceItem } from './rounds'

function deriveBaseline(currentPrice: number, changePct?: number): number {
  if (!isFinite(changePct ?? NaN) || changePct <= -100 || changePct === 0) {
    return currentPrice
  }
  const baseline = currentPrice / (1 + changePct / 100)
  return baseline > 0 ? baseline : currentPrice
}

function resolveExplicitPair(token: any): DexscreenerPairRef | null {
  const net = (token.dexscreenerNetwork || '').toLowerCase()
  const pr = (token.dexscreenerPair || '').toLowerCase()

  if (net && pr) return { network: net, pair: pr }

  if (token.dexscreenerUrl) {
    const parsed = parseDexscreenerLink(token.dexscreenerUrl)
    if (parsed.network && parsed.pair) {
      return {
        network: parsed.network.toLowerCase(),
        pair: parsed.pair.toLowerCase()
      }
    }
  }

  return null
}

async function getFinalPrice(
  token: any,
  pair: DexscreenerPairRef
): Promise<{
  price: number | null
  changePct?: number
  source?: 'dexscreener' | 'gecko'
}> {
  // 1) Strict Dexscreener
  const strict = await getDexPairQuoteStrict(pair.network, pair.pair)
  if (strict) {
    return {
      price: strict.priceUsd,
      changePct: strict.changePct,
      source: 'dexscreener'
    }
  }

  // 2) Normal Dexscreener
  const soft = await getDexPairQuote(pair.network, pair.pair)
  if (soft) {
    return {
      price: soft.priceUsd,
      changePct: soft.changePct,
      source: 'dexscreener'
    }
  }

  // 3) Gecko fallback
  const gecko = await getGeckoPoolQuote(pair.network, pair.pair, token.symbol)
  if (gecko) {
    return {
      price: gecko.priceUsd,
      changePct: gecko.changePct,
      source: 'gecko'
    }
  }

  return { price: null }
}

export async function closeRound(): Promise<{ id: string; count: number }> {
  const nowIso = new Date().toISOString()
  const items: RoundPriceItem[] = []

  for (const token of TOKENS) {
    const explicit = resolveExplicitPair(token)
    if (!explicit) continue  // LP adresi olmayan token atlanır (doğru davranış)

    const { price, changePct, source } = await getFinalPrice(token, explicit)

    if (price != null) {
      const p0 = deriveBaseline(price, changePct)
      items.push({
        tokenId: token.id,
        p0,
        pClose: price,
        ts: nowIso,
        source,
        network: explicit.network,
        pair: explicit.pair
      })
    }
  }

  await addRoundSnapshot({ id: nowIso, items })
  return { id: nowIso, count: items.length }
}
