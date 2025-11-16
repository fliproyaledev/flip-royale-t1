import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, getOrCreateUser } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  
  try {
    const userId = String(req.query?.userId || '')
    if (!userId) return res.status(400).json({ ok: false, error: 'userId required' })
    
    const users = await loadUsers()
    const user = getOrCreateUser(users, userId)
    
    return res.status(200).json({ 
      ok: true, 
      activeRound: user.activeRound || null,
      nextRound: user.nextRound || null,
      currentRound: user.currentRound || 1,
      lastSettledDay: user.lastSettledDay || null
    })
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || 'Failed to load round data' })
  }
}

