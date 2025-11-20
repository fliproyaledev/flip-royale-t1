import type { NextApiRequest, NextApiResponse } from 'next'
import { loadDuels, saveDuels, settleRoom } from '../../../lib/duels'
import { verifySignature } from '@vercel/cron'   // 🔥 ÖNEMLİ

function utcDayKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  // ✔ Cron GET ile gelir → sadece GET'e izin ver
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Only GET allowed' })
  }

  // ✔ Vercel HMAC Signature doğrulaması
  const signature = req.headers['x-vercel-signature'] as string

  const valid = await verifySignature(
    signature,
    process.env.CRON_SECRET!
  )

  if (!valid) {
    return res.status(401).json({ ok: false, error: 'Unauthorized (Bad Signature)' })
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

      // Skip invalid rooms
      if (!room || typeof room !== 'object') continue

      // Already finished
      if (room.status === 'settled' || room.status === 'cancelled')
        continue

      // Missing eval time → auto-cancel
      if (!room.evalAt) {
        console.warn(`⚠️ Room ${roomId} missing evalAt → cancelling`)
        room.status = 'cancelled'
        continue
      }

      const evalAt = new Date(room.evalAt)

      // Not ready to evaluate yet
      if (now.getTime() < evalAt.getTime())
        continue

      try {
        console.log(`⚔️ Settling room ${roomId} (evalAt: ${room.evalAt})`)

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

    // Save updates
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
