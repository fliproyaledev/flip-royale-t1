import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers, getOrCreateUser, creditGamePoints } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== 'POST') {
    return res.status(405).json({ ok:false, error:'Method not allowed' })
  }
  try{
    const userId = String(req.body?.userId || '')
    const amount = Number(req.body?.amount || 0)
    const isGamePoints = req.body?.isGamePoints !== false // Default to true for game points (leaderboard)
    if(!userId || !Number.isFinite(amount)) return res.status(400).json({ ok:false, error:'userId and amount required' })
    const users = await loadUsers()
    const u = getOrCreateUser(users, userId)
    
    // Use creditGamePoints for game earnings (updates both totalPoints and bankPoints)
    // Use creditBank only for admin grants (only updates bankPoints)
    if (isGamePoints) {
      creditGamePoints(u, amount, 'game-earnings')
    } else {
      // For admin grants, use creditBank (doesn't update totalPoints)
      const { creditBank } = await import('../../../lib/users')
      creditBank(u, amount, 'admin-grant')
    }
    
    await saveUsers(users)
    return res.status(200).json({ ok:true, bankPoints: u.bankPoints, totalPoints: u.totalPoints })
  }catch(e:any){
    return res.status(400).json({ ok:false, error: e?.message || 'grant failed' })
  }
}

