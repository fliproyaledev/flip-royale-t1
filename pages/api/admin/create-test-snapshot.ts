import type { NextApiRequest, NextApiResponse } from 'next'
import { addRoundSnapshot } from '../../../lib/rounds'
import { TOKENS } from '../../../lib/tokens'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const now = new Date().toISOString()
  const items = []

  for (const token of TOKENS) {
    const base = Math.random() * 3 + 0.5
    const close = base + (Math.random() - 0.5) * 0.3

    items.push({
      tokenId: token.id,
      p0: base,
      pClose: close,
      ts: now,
      source: 'test',
      network: token.dexscreenerNetwork || 'base',
      pair: token.dexscreenerPair || null
    })
  }

  await addRoundSnapshot({
    id: now,
    items
  })

  return res.status(200).json({
    ok: true,
    created: items.length,
    ts: now
  })
}
