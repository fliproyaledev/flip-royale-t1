import type { NextApiRequest, NextApiResponse } from 'next'
import { loadDuels, settleRoom } from '../../../lib/duels'

function utcDayKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  // Vercel Cron uses GET → allow GET + POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  // Allow manual browser testing: ?test=1
  const isTestMode = req.query.test === '1'

  // Only allow Vercel Cron in production (except manual test)
  if (process.env.NODE_ENV === 'production' && !isTestMode) {
    const isCron = !!req.headers['x-vercel-cron']
    if (!isCron) {
      return res.status(401).json({ ok: false, error: 'Unauthorized (Not from Vercel Cron)' })
    }
  }

  try {
    const today = utcDayKey()
    const now = new Date()
    console.log(`🔄 [CRON-SETTLE-ARENAS] Starting arena settlement for ${today}`)

    const duels = await loadDuels()
    const settledRooms: string[] = []
    const errors: Array<{ roomId: string; error: string }> = []

    for (const roomId in duels) {
      const room = duels[roomId]

      if (room.status === 'settled' || room.status === 'cancelled') continue

      const evalAt = new Date(room.evalAt)
      if (now.getTime() < evalAt.getTime()) continue

      try {
        console.log(`🔄 Settling room ${roomId} (evalAt: ${room.evalAt})`)

        await settleRoom(roomId)

        settledRooms.push(roomId)
        console.log(`✅ Settled room ${roomId}`)
      } catch (e: any) {
        if (e?.message?.includes('Evaluation time not reached')) {
          console.log(`⏭️ Room ${roomId} not ready: ${e.message}`)
          continue
        }

        console.error(`❌ Failed to settle room ${roomId}:`, e)
        errors.push({ roomId, error: e?.message || 'Unknown error' })
      }
    }

    console.log(`✅ Arena settlement done: ${settledRooms.length} rooms settled, ${errors.length} errors`)

    return res.status(200).json({
      ok: true,
      date: today,
      settledCount: settledRooms.length,
      settledRooms,
      errors
    })
  } catch (e: any) {
    console.error('❌ [CRON-SETTLE-ARENAS] Fatal error:', e)
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' })
  }
}
