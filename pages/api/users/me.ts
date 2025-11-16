import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, getOrCreateUser, saveUsers } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  try {
    const userId = String(req.query.userId || '')
    if (!userId) return res.status(400).json({ ok: false, error: 'userId required' })
    const users = await loadUsers()
    const u = getOrCreateUser(users, userId)
    
    // Check if this is a new user (first registration)
    const isNewUser = (u.totalPoints === 0 && u.bankPoints === 0 && (u.giftPoints === undefined || u.giftPoints === 0)) && (!u.logs || u.logs.length === 0)
    
    if (isNewUser) {
      // Bootstrap starter gift points for new users (not counted in leaderboard)
      u.giftPoints = 10000
      u.bankPoints = 10000  // Gift points are spendable, so bankPoints reflects total spendable
      u.totalPoints = 0     // Not counted in leaderboard
      u.createdAt = new Date().toISOString() // Record registration timestamp
      u.updatedAt = new Date().toISOString()
      
      // Log registration
      u.logs.push({ 
        type: 'system', 
        date: new Date().toISOString().slice(0, 10), 
        note: 'user-registered',
        bonusGranted: 10000
      })
    }
    
    // Update wallet address if provided (for wallet connection)
    const walletAddress = String(req.query.walletAddress || req.body?.walletAddress || '')
    if (walletAddress && walletAddress.startsWith('0x')) {
      u.walletAddress = walletAddress
      u.updatedAt = new Date().toISOString()
    }
    
    await saveUsers(users)
    return res.status(200).json({ ok: true, user: u })
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || 'failed' })
  }
}

