// pages/api/round/load.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, getOrCreateUser } from '../../../lib/users'
import type { RoundPick } from '../../../lib/users'

type LoadResponse = {
  ok: boolean
  activeRound: RoundPick[]
  nextRound: (RoundPick | null)[]
  currentRound: number
  lastSettledDay: string | null
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LoadResponse | { ok: false; error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const userId = String(req.query.userId || req.query.user || '').trim()
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId required' })
    }

    // Tüm kullanıcıları Redis’ten çek
    const users = await loadUsers()

    // Kullanıcıyı oluştur / düzelt
    const user = getOrCreateUser(users, userId)

    // Güvenlik: alanları normalize et
    if (!Array.isArray(user.activeRound)) {
      user.activeRound = []
    }
    if (!Array.isArray(user.nextRound)) {
      user.nextRound = Array(5).fill(null) as any
    }
    if (!user.currentRound || typeof user.currentRound !== 'number') {
      user.currentRound = 1
    }

    const lastSettled =
      typeof user.lastSettledDay === 'string' && user.lastSettledDay.length > 0
        ? user.lastSettledDay
        : null

    return res.status(200).json({
      ok: true,
      activeRound: user.activeRound,
      nextRound: user.nextRound,
      currentRound: user.currentRound,
      lastSettledDay: lastSettled,
    })
  } catch (e: any) {
    console.error('[ROUND/LOAD] error:', e)
    return res
      .status(500)
      .json({ ok: false, error: e?.message || 'Failed to load round data' })
  }
}
