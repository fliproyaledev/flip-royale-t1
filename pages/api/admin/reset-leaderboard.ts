import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  try {
    const users = await loadUsers()
    // Reset all totalPoints to 0 (keep giftPoints and bankPoints)
    for (const userId in users) {
      const user = users[userId]
      user.totalPoints = 0
      // Keep giftPoints and bankPoints as they are
      user.updatedAt = new Date().toISOString()
    }
    await saveUsers(users)
    return res.status(200).json({ ok: true, message: 'Leaderboard reset successfully' })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to reset leaderboard' })
  }
}

