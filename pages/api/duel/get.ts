import type { NextApiRequest, NextApiResponse } from 'next'
import { loadDuels, seedDailyRooms } from '../../../lib/duels'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id || '')
  // Ensure today's rooms are seeded (idempotent) - this also removes old rooms
  try { await seedDailyRooms(25, 2500) } catch {}
  const map = await loadDuels()
  const today = new Date().toISOString().slice(0, 10)
  
  if (!id) {
    // Return only today's rooms
    const todayRooms = Object.values(map).filter(r => r.baseDay === today)
    return res.status(200).json({ ok: true, rooms: todayRooms })
  }
  const room = map[id]
  if (!room) return nodFound(res)
  // Only return room if it's from today
  if (room.baseDay !== today) return nodFound(res)
  return res.status(200).json({ ok: true, room })
}

function nodFound(res: NextApiResponse) {
  return res.status(404).json({ ok: false, error: 'Not found' })
}


