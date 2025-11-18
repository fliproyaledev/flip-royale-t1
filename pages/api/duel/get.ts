import type { NextApiRequest, NextApiResponse } from 'next'
import { loadDuels, seedDailyRooms } from '../../../lib/duels'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id || '')
  // Clean up any legacy auto-seeded rooms before responding
  try {
    await seedDailyRooms()
  } catch {}
  const map = await loadDuels()
  const today = new Date().toISOString().slice(0, 10)
  
  if (!id) {
    // Return only today's rooms that are still active (open, ready, or locked)
    const todayRooms = Object.values(map).filter(r => 
      r.baseDay === today && 
      (r.status === 'open' || r.status === 'ready' || r.status === 'locked' || r.status === 'settled')
    )
    // Sort by status: open/ready first, then locked, then settled
    todayRooms.sort((a, b) => {
      const statusOrder = { 'open': 0, 'ready': 1, 'locked': 2, 'settled': 3, 'cancelled': 4 }
      return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99)
    })
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


