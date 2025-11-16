import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers, getOrCreateUser } from '../../../lib/users'
import type { RoundPick } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  
  try {
    const userId = String(req.body?.userId || '')
    if (!userId) return res.status(400).json({ ok: false, error: 'userId required' })
    
    const activeRound = req.body?.activeRound as RoundPick[] | undefined
    const nextRound = req.body?.nextRound as RoundPick[] | undefined
    const currentRound = Number(req.body?.currentRound) || undefined
    
    const users = await loadUsers()
    const user = getOrCreateUser(users, userId)
    
    // Update round data
    if (activeRound !== undefined) {
      user.activeRound = activeRound
    }
    if (nextRound !== undefined) {
      user.nextRound = nextRound
    }
    if (currentRound !== undefined) {
      user.currentRound = currentRound
    }
    
    user.updatedAt = new Date().toISOString()
    await saveUsers(users)
    
    return res.status(200).json({ 
      ok: true, 
      user: {
        activeRound: user.activeRound,
        nextRound: user.nextRound,
        currentRound: user.currentRound
      }
    })
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || 'Failed to save round data' })
  }
}

