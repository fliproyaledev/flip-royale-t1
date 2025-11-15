import type { NextApiRequest, NextApiResponse } from 'next'
// Creation by users is disabled; rooms are auto-seeded daily.

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return res.status(403).json({ ok: false, error: 'Room creation disabled. Daily rooms are auto-created.' })
}


