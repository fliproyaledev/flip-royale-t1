// pages/api/round/load.ts

import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, getOrCreateUser } from '../../../lib/users'
import type { RoundPick } from '../../../lib/users'

const MAX_SLOTS = 5

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  // USER ID'Yİ HER YERDEN OKU (header + query + body)
  const userId =
    req.headers['x-user-id']?.toString() ||
    req.query.userId?.toString() ||
    req.query.user?.toString() ||
    req.body?.userId?.toString() ||
    req.body?.user?.toString() ||
    ''

  if (!userId) {
    return res.status(400).json({ ok: false, error: 'userId required' })
  }

  const users = await loadUsers()
  const user = getOrCreateUser(users, userId)

  // ACTIVE ROUND
  const activeRound = Array.isArray(user.activeRound) ? user.activeRound : []

  // NEXT ROUND: VERİYİ BOZMADAN SADECE 5 SLota normalize et
  const rawNext = Array.isArray(user.nextRound)
    ? (user.nextRound as (RoundPick | null)[])
    : []

  const nextRound: (RoundPick | null)[] = new Array(MAX_SLOTS).fill(null)
  for (let i = 0; i < Math.min(MAX_SLOTS, rawNext.length); i++) {
    nextRound[i] = rawNext[i] ?? null
  }

  // DİKKAT: Burada user'ı SAVE ETMİYORUZ, hiçbir şeyi silmiyoruz.
  return res.status(200).json({
    ok: true,
    activeRound,
    nextRound,
    currentRound: user.currentRound ?? 1,
    lastSettledDay: user.lastSettledDay ?? null,
  })
}
