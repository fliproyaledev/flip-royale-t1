import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const users = await loadUsers()
    const list = Object.values(users)
      .map(u => {
        const lastDaily = [...(u.logs || [])].reverse().find(l => l.type === 'daily') || null
        return {
          id: u.id,
          name: u.name || u.id,
          avatar: u.avatar,
          totalPoints: u.totalPoints,
          lastLog: lastDaily
        }
      })
      .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
    return res.status(200).json({ ok: true, users: list })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' })
  }
}


