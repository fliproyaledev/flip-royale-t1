import type { NextApiRequest, NextApiResponse } from 'next'
import { loadDuels, settleRoom } from '../../../lib/duels'

function utcDayKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  
  // Optional: Add authentication/authorization check for cron jobs
  // For Vercel Cron, you can check the Authorization header
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // In production, Vercel Cron automatically adds this header
    // For local testing, you can set CRON_SECRET env variable
    if (process.env.NODE_ENV === 'production' && !authHeader) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }
  }
  
  try {
    const today = utcDayKey()
    const now = new Date()
    console.log(`🔄 [CRON-SETTLE-ARENAS] Starting arena settlement for ${today}`)
    
    const duels = await loadDuels()
    const settledRooms: string[] = []
    const errors: Array<{ roomId: string; error: string }> = []
    
    // Process each room
    for (const roomId in duels) {
      const room = duels[roomId]
      
      // Skip if already settled or cancelled
      if (room.status === 'settled' || room.status === 'cancelled') {
        continue
      }
      
      // Skip if evalAt hasn't been reached yet
      const evalAt = new Date(room.evalAt)
      if (now.getTime() < evalAt.getTime()) {
        continue
      }
      
      // Check if room is ready to settle
      // Room can be settled if:
      // 1. evalAt time has passed (UTC 00:00 reached)
      // 2. Both players have locked (if guest exists) OR only host exists
      const hasGuest = !!room.guest
      const bothLocked = room.host.locked && (hasGuest ? room.guest.locked : true)
      
      // If evalAt has passed, settle regardless of lock status
      // (This ensures rooms are settled at UTC 00:00 even if players didn't lock)
      if (now.getTime() >= evalAt.getTime()) {
        try {
          console.log(`🔄 [CRON-SETTLE-ARENAS] Settling room ${roomId} (evalAt: ${room.evalAt})`)
          
          // settleRoom will handle the settlement logic
          await settleRoom(roomId)
          
          settledRooms.push(roomId)
          console.log(`✅ [CRON-SETTLE-ARENAS] Settled room ${roomId}`)
        } catch (e: any) {
          // If room can't be settled (e.g., evalAt not reached), skip it
          if (e?.message?.includes('Evaluation time not reached')) {
            console.log(`⏭️ [CRON-SETTLE-ARENAS] Room ${roomId} not ready yet: ${e.message}`)
            continue
          }
          
          console.error(`❌ [CRON-SETTLE-ARENAS] Failed to settle room ${roomId}:`, e)
          errors.push({ roomId, error: e?.message || 'Unknown error' })
        }
      }
    }
    
    console.log(`✅ [CRON-SETTLE-ARENAS] Settlement complete: ${settledRooms.length} rooms settled, ${errors.length} errors`)
    
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

