import { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers, getOrCreateUser } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { user: userId, token, dir } = req.query

  if (!userId || !token || !dir) {
    return res.status(400).json({ ok: false, error: 'Missing params' })
  }

  const users = await loadUsers()
  const user = getOrCreateUser(users, String(userId))

  // Ensure nextRound exists and has 5 slots
  if (!Array.isArray(user.nextRound)) {
    user.nextRound = Array(5).fill(null)
  }

  // Find empty slot (null)
  const slot = user.nextRound.findIndex((x) => x === null)
  if (slot === -1) {
    return res.status(400).json({ ok: false, error: 'nextRound full' })
  }

  // Count existing duplicates of this token
  const existing = user.nextRound.filter(
    (x) => x && x.tokenId === token
  )
  const duplicateIndex = existing.length + 1

  user.nextRound[slot] = {
    tokenId: String(token),
dir: (String(dir).toUpperCase() as "UP" | "DOWN"),
    duplicateIndex,
    locked: false,
  }

  user.updatedAt = new Date().toISOString()
  await saveUsers(users)

  return res.json({
    ok: true,
    addedPick: user.nextRound[slot],
    slot,
    user: userId,
  })
}
