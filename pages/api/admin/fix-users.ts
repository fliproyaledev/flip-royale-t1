import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow only GET
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  // Simple security check
  const secret = req.query.secret
  if (!secret || secret !== process.env.ADMIN_FIX_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }

  try {
    const users = await loadUsers()
    const beforeKeys = Object.keys(users)

    const removed: string[] = []
    const fixed: string[] = []

    for (const id of beforeKeys) {
      const user = users[id]

      // 1) Remove invalid IDs like "undefined", "", null
      if (!id || id === 'undefined' || id.trim() === '') {
        delete users[id]
        removed.push(id)
        continue
      }

      // 2) Auto-fix missing fields
      let changed = false

      if (!Array.isArray(user.logs)) {
        user.logs = []
        changed = true
      }

      if (typeof user.totalPoints !== 'number') {
        user.totalPoints = 0
        changed = true
      }

      if (typeof user.bankPoints !== 'number') {
        user.bankPoints = 0
        changed = true
      }

      if (typeof user.giftPoints !== 'number') {
        user.giftPoints = 0
        changed = true
      }

      if (!user.activeRound) {
        user.activeRound = []
        changed = true
      }

      if (!user.nextRound) {
        user.nextRound = Array(5).fill(null)
        changed = true
      }

      if (!user.currentRound) {
        user.currentRound = 1
        changed = true
      }

      if (changed) {
        fixed.push(id)
      }
    }

    await saveUsers(users)

    return res.status(200).json({
      ok: true,
      removed,
      fixed,
      totalUsers: Object.keys(users).length
    })
  } catch (err: any) {
    console.error('fix-users error:', err)
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' })
  }
}
