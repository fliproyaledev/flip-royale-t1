import type { NextApiRequest, NextApiResponse } from 'next'
import { closeRound } from '../../../lib/rounds_service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const result = await closeRound()
    return res.status(200).json({ ok: true, ...result })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' })
  }
}


