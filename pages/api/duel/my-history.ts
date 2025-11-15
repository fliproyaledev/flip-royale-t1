import type { NextApiRequest, NextApiResponse } from 'next'
import { loadDuels } from '../../../lib/duels'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = String(req.query.userId || '')
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId required' })
    }

    const map = await loadDuels()
    
    // Find all settled rooms where user participated (as host or guest)
    const userRooms = Object.values(map)
      .filter(room => {
        if (room.status !== 'settled' || !room.result) return false
        return room.host.userId === userId || (room.guest && room.guest.userId === userId)
      })
      .map(room => {
        const isHost = room.host.userId === userId
        const mySide = isHost ? room.host : room.guest
        const opponentSide = isHost ? room.guest : room.host
        
        return {
          roomId: room.id,
          roomSeq: room.seq,
          baseDay: room.baseDay,
          settledAt: room.result!.settledAt,
          entryCost: room.entryCost,
          myScore: isHost ? room.result!.hostScore : room.result!.guestScore,
          opponentScore: isHost ? room.result!.guestScore : room.result!.hostScore,
          winner: room.result!.winner,
          payoutPerWinner: room.result!.payoutPerWinner,
          myPicks: mySide?.picks || [],
          opponentPicks: opponentSide?.picks || [],
          isHost,
          opponentUserId: opponentSide?.userId || null
        }
      })
      .sort((a, b) => new Date(b.settledAt).getTime() - new Date(a.settledAt).getTime())

    return res.status(200).json({ ok: true, rooms: userRooms })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to load arena history' })
  }
}

