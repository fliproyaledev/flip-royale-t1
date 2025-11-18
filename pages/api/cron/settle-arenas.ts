import type { NextApiRequest, NextApiResponse } from 'next'
import { loadDuels, saveDuels, settleRoom } from '../../../lib/duels'

function utcDayKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  // Allow GET + POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const isTestMode = req.query.test === '1'

  // Protect cron in production
  if (process.env.NODE_ENV === 'production' && !isTestMode) {
    if (!req.headers['x-vercel-cron']) {
      return res.status(401).json({ ok: false, error: 'Unauthorized (Not Vercel Cron)' })
    }
  }

  try {
    const today = utcDayKey()
    const now = new Date()

    console.log(`🔄 [CRON-ARENAS] Starting arena settlement for ${today}`)

    let duels = await loadDuels()

    const settledRooms: string[] = []
    const errors: Array<{ roomId: string; error: string }> = []

    for (const roomId in duels) {
      const room = duels[roomId]

      // Skip deleted or broken rooms
      if (!room || typeof room !== 'object') continue

      // Skip rooms already settled or cancelled
      if (room.status === 'settled' || room.status === 'cancelled') continue

      // Ensure evalAt exists
      if (!room.evalAt) {
        console.warn(`⚠️ Room ${roomId} missing evalAt → cancelling`)
        room.status = 'cancelled'
        continue
      }

      const evalAt = new Date(room.evalAt)

      // Not ready yet
      if (now.getTime() < evalAt.getTime()) continue

      try {
        console.log(`⚔️ Settling room ${roomId} (evalAt: ${room.evalAt})`)

        // Main logic
        await settleRoom(roomId)

        settledRooms.push(roomId)

        console.log(`✅ Room settled: ${roomId}`)

      } catch (e: any) {
        const msg = e?.message || 'Unknown error'

        if (msg.includes('Evaluation time not reached')) {
          console.log(`⏭️ Room ${roomId} not ready: ${msg}`)
          continue
        }

        console.error(`❌ Failed to settle room ${roomId}:`, msg)
        errors.push({ roomId, error: msg })
      }
    }

    // Save updated Duel state
    await saveDuels(duels)

    console.log(`🏁 Arena settlement finished → ${settledRooms.length} rooms settled`)

    return res.status(200).json({
      ok: true,
      date: today,
      settledCount: settledRooms.length,
      settledRooms,
      errors
    })

  } catch (e: any) {
    console.error('❌ [CRON-ARENAS] Fatal error:', e)
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' })
  }
}
