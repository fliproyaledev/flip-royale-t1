import type { NextApiRequest, NextApiResponse } from 'next'
import { getPreviousRounds } from '../../../lib/history'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  try {
    // Son 14 günün verisini çek
    const history = await getPreviousRounds(14)
    
    return res.status(200).json({ 
        ok: true, 
        history: history || [] 
    })
  } catch (error: any) {
    console.error('Leaderboard History API Error:', error)
    return res.status(500).json({ ok: false, error: 'Internal Server Error' })
  }
}
