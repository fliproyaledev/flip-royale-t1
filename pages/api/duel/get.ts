import type { NextApiRequest, NextApiResponse } from 'next'
import { loadDuels, seedDailyRooms } from '../../../lib/duels'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id || '')
  // Ensure today's rooms are seeded (idempotent)
  try { await seedDailyRooms(25, 2500) } catch {}
  const map = await loadDuels()
  if (!id) {
    return res.status(200).json({ ok: true, rooms: Object.values(map) })
  }
  const room = map[id]
  if (!room) return nodFound(res)
  return res.status(200).json({ ok: true, room })
}

function nodFound(res: NextApiResponse) {
  return res.status(404).json({ ok: false, error: 'Not found' })
}


