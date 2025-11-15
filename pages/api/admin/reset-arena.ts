import type { NextApiRequest, NextApiResponse } from 'next'
import { loadDuels, saveDuels } from '../../../lib/duels'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  try {
    // Clear all duel rooms
    await saveDuels({})
    return res.status(200).json({ ok: true, message: 'Arena rooms cleared successfully' })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to clear arena rooms' })
  }
}

