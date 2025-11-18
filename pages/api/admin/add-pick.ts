import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers, getOrCreateUser, type RoundPick } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const userId = String(req.query.user || '')
  const tokenId = String(req.query.token || '')
  const dir = String(req.query.dir || 'UP').toUpperCase() as 'UP' | 'DOWN'

  if (!userId || !tokenId) {
    return res.status(400).json({ ok: false, error: 'Missing user or token' })
  }

  const users = await loadUsers()
  const user = getOrCreateUser(users, userId)

  const newPick: RoundPick = {
    tokenId,
    dir,
    duplicateIndex: 1,
    locked: false
  }

  user.activeRound = user.activeRound || []
  user.activeRound.push(newPick)

  user.updatedAt = new Date().toISOString()

  await saveUsers(users)

  return res.status(200).json({
    ok: true,
    addedPick: newPick,
    user: userId
  })
}
