import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, getOrCreateUser, saveUsers } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  try {
    const userId = String(req.query.userId || '')
    if (!userId) return res.status(400).json({ ok: false, error: 'userId required' })
    const users = await loadUsers()
    const u = getOrCreateUser(users, userId)
    // Bootstrap starter points for new users so points are usable across modes
    if ((u.totalPoints === 0 && u.bankPoints === 0) && (!u.logs || u.logs.length === 0)) {
      u.totalPoints = 50000
      u.bankPoints = 50000
      u.updatedAt = new Date().toISOString()
    }
    await saveUsers(users)
    return res.status(200).json({ ok: true, user: u })
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || 'failed' })
  }
}

