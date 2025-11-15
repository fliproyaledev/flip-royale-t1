import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const users = await loadUsers()
    const list = Object.values(users)
      .map(u => {
        // Get all daily logs to calculate rounds played and best round
        const dailyLogs = (u.logs || []).filter(l => l.type === 'daily')
        const roundsPlayed = dailyLogs.length
        const bestRound = dailyLogs.length > 0 
          ? Math.max(0, ...dailyLogs.map(l => l.dailyDelta || 0))
          : 0
        
        return {
          id: u.id,
          name: u.name || u.id,
          avatar: u.avatar,
          totalPoints: u.totalPoints || 0,
          roundsPlayed,
          bestRound,
          logs: dailyLogs
        }
      })
      .filter(u => u.totalPoints > 0) // Only return users with points
      .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
    return res.status(200).json({ ok: true, users: list })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' })
  }
}


