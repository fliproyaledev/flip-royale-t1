import type { NextApiRequest, NextApiResponse } from 'next'
import { createRoom } from '../../../lib/duels'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const { userId, entryCost = 2500 } = req.body

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ ok: false, error: 'userId required' })
    }

    const { room } = await createRoom(userId, entryCost)

    return res.status(200).json({ ok: true, room })
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || 'Create failed' })
  }
}


