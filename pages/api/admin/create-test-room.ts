import type { NextApiRequest, NextApiResponse } from 'next'
import { createRoom, joinRoom } from '../../../lib/duels'
import { loadUsers, saveUsers, getOrCreateUser } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const user1 = String(req.query.user1 || '')
  const user2 = String(req.query.user2 || '')

  if (!user1 || !user2) {
    return res.status(400).json({ ok: false, error: 'Missing users' })
  }

  const users = await loadUsers()
  getOrCreateUser(users, user1)
  getOrCreateUser(users, user2)
  await saveUsers(users)

  const created = await createRoom(user1, 2500)

  const roomId = created.room.id

  // Eval time → 10 sec after creation
  created.room.evalAt = new Date(Date.now() + 10_000).toISOString()

  await joinRoom(roomId, user2)

  return res.status(200).json({
    ok: true,
    testRoom: roomId,
    evalAt: created.room.evalAt,
    note: 'Room will settle automatically in ~10 seconds when cron runs.'
  })
}
