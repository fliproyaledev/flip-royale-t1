import type { NextApiRequest, NextApiResponse } from 'next'
import { lockPicks, DuelPickInput } from '../../../lib/duels'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  try {
    const roomId = String(req.body?.roomId || '')
    const userId = String(req.body?.userId || '')
    const picks: DuelPickInput[] = Array.isArray(req.body?.picks) ? req.body.picks : []
    if (!roomId || !userId) return res.status(400).json({ ok: false, error: 'roomId and userId required' })
    if (!Array.isArray(picks) || picks.length < 1 || picks.length > 5) return res.status(400).json({ ok: false, error: 'Provide 1 to 5 picks' })
    const room = await lockPicks(roomId, userId, picks)
    return res.status(200).json({ ok: true, room })
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || 'Failed to lock picks' })
  }
}

