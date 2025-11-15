import type { NextApiRequest, NextApiResponse } from 'next'
import { joinRoom } from '../../../lib/duels'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  try {
    const roomId = String(req.body?.roomId || '')
    const userId = String(req.body?.userId || '')
    if (!roomId || !userId) return res.status(400).json({ ok: false, error: 'roomId and userId required' })
    const result = await joinRoom(roomId, userId)
    return res.status(200).json({ ok: true, room: result.room })
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || 'Failed to join room' })
  }
}

