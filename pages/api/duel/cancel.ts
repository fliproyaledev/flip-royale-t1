import type { NextApiRequest, NextApiResponse } from 'next'
import { cancelRoom } from '../../../lib/duels'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return returnJson(res, 405, { ok: false, error: 'Method not allowed' })
  }
  try {
    const roomId = String(req.body?.roomId || '')
    const userId = String(req.body?.userId || '')
    if (!roomId || !userId) return returnJson(res, 400, { ok: false, error: 'roomId and userId required' })
    const result = await cancelRoom(roomId, userId)
    return returnJson(res, 200, { ok: true, room: result.room })
  } catch (e: any) {
    return returnJson(res, 400, { ok: false, error: e?.message || 'Failed to cancel room' })
  }
}

function returnJson(res: NextApiResponse, status: number, body: any) {
  res.status(status).json(body)
}

