export const config = {
  runtime: "nodejs",
};
import crypto from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { loadDuels, saveDuels, settleRoom } from '../../lib/duels'

function utcDayKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// --- Manual Vercel HMAC validation ---
function verifyVercelSignature(signature: string | undefined, secret: string): boolean {
  if (!signature) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update('') // empty payload
    .digest('hex')

  return signature === expected
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  // ✔ Vercel Cron always sends GET
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Only GET allowed' })
  }

  // ✔ Validate HMAC signature
  const signature = req.headers['x-vercel-signature'] as string
  const secret = process.env.CRON_SECRET!

  const valid = verifyVercelSignature(signature, secret)

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

      // skip invalid rooms
      if (!room || typeof room !== 'object') continue

      // skip finished rooms
      if (room.status === 'settled' || room.status === 'cancelled') continue

      // ensure evalAt exists
      if (!room.evalAt) {
        console.warn(`⚠️ Room ${roomId} missing evalAt → cancelled`)
        room.status = 'cancelled'
        continue
      }

      const evalAt = new Date(room.evalAt)

      // Not ready
      if (now.getTime() < evalAt.getTime()) continue

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




