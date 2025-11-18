import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers } from '../../../lib/users'
import { saveDuels } from '../../../lib/duels'
import { saveRoundsKV } from '../../../lib/kv'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const users = await loadUsers()
  for (const id in users) {
    const u = users[id]
    u.activeRound = []
    u.nextRound = Array(5).fill(null)
    u.currentRound = 1
    u.lastSettledDay = undefined
  }
  await saveUsers(users)

  await saveDuels({})
  await saveRoundsKV([])

  return res.status(200).json({
    ok: true,
    message: 'All data wiped (users rounds, duels, round snapshots).'
  })
}
