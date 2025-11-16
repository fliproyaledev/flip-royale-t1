import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers, creditGamePoints, type RoundPick } from '../../../lib/users'

// Helper functions (same logic as client-side)
function nerfFactor(dup: number): number {
  if (dup <= 1) return 1
  if (dup === 2) return 0.75
  if (dup === 3) return 0.5
  if (dup === 4) return 0.25
  if (dup === 5) return 0
  return 0
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max)
}

// Helper function to calculate points (same logic as client-side)
function calcPoints(p0: number, pNow: number, dir: 'UP' | 'DOWN', dup: number, boostLevel: 0 | 50 | 100, boostActive: boolean): number {
  if (!isFinite(p0) || !isFinite(pNow) || p0 <= 0 || pNow <= 0) return 0
  
  const pct = ((pNow - p0) / p0) * 100
  const signed = dir === 'UP' ? pct : -pct
  let pts = signed * 100 // Each 1% change equals 100 points
  
  const nerf = nerfFactor(dup)
  const loss = 2 - nerf
  
  if (pts >= 0) {
    pts = pts * nerf
  } else {
    pts = pts * loss
  }
  
  pts = clamp(pts, -2500, 2500)
  
  if (boostActive && boostLevel && pts > 0) {
    pts *= (boostLevel === 100 ? 2 : boostLevel === 50 ? 1.5 : 1)
  }
  
  return Math.round(pts)
}

// Helper to get price data (uses internal price API)
async function getPrice(tokenId: string): Promise<{ p0: number; pLive: number; pClose: number; changePct?: number }> {
  try {
    // Use internal API endpoint - in server-side context, we can call it directly
    // For Vercel, we need to construct the URL properly
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    const r = await fetch(`${baseUrl}/api/price?token=${encodeURIComponent(tokenId)}`, {
      headers: {
        'User-Agent': 'FlipRoyale-Cron/1.0'
      }
    })
    
    if (!r.ok) {
      throw new Error(`Price API returned ${r.status}`)
    }
    
    const data = await r.json()
    return {
      p0: data.p0 || data.pLive || 1,
      pLive: data.pLive || 1,
      pClose: data.pClose || data.pLive || 1,
      changePct: data.changePct
    }
  } catch (e) {
    console.error(`Failed to fetch price for ${tokenId}:`, e)
    // Return zero change if fetch fails (will result in 0 points)
    return { p0: 1, pLive: 1, pClose: 1, changePct: 0 }
  }
}

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
    console.log(`🔄 [CRON-SETTLE] Starting round settlement for ${today}`)
    
    const users = await loadUsers()
    const settledUsers: string[] = []
    const errors: Array<{ userId: string; error: string }> = []
    
    // Process each user's active round
    for (const userId in users) {
      const user = users[userId]
      
      // Skip if user has no active round or already settled today
      if (!user.activeRound || user.activeRound.length === 0) {
        continue
      }
      
      if (user.lastSettledDay === today) {
        console.log(`⏭️ [CRON-SETTLE] User ${userId} already settled today`)
        continue
      }
      
      try {
        // Calculate points for each pick
        let totalPoints = 0
        const roundResults: Array<{ tokenId: string; points: number }> = []
        
        for (const pick of user.activeRound) {
          if (!pick || !pick.tokenId) continue
          
          // For locked cards, use locked points
          if (pick.locked && pick.pointsLocked !== undefined) {
            totalPoints += pick.pointsLocked
            roundResults.push({ tokenId: pick.tokenId, points: pick.pointsLocked })
            continue
          }
          
          // For unlocked cards, fetch price and calculate points
          try {
            const priceData = await getPrice(pick.tokenId)
            
            // Use pClose if available (UTC 00:00 snapshot), otherwise use pLive
            const pClose = priceData.pClose || priceData.pLive
            const p0 = priceData.p0 || priceData.pLive
            
            // Calculate points based on 24h change (p0 to pClose)
            const points = calcPoints(p0, pClose, pick.dir, pick.duplicateIndex, 0, false)
            totalPoints += points
            roundResults.push({ tokenId: pick.tokenId, points })
          } catch (e) {
            console.error(`Failed to calculate points for ${pick.tokenId}:`, e)
            // Continue with other picks
          }
        }
        
        // Credit points to user
        if (totalPoints !== 0) {
          creditGamePoints(user, totalPoints, `flip-royale-round-${today}`, today)
        }
        
        // Move nextRound to activeRound
        const validNextRound = (user.nextRound || []).filter(p => p !== null) as RoundPick[]
        if (validNextRound.length > 0) {
          user.activeRound = validNextRound
          user.nextRound = Array(5).fill(null) as any
        } else {
          user.activeRound = []
        }
        
        // Update round number and last settled day
        user.currentRound = (user.currentRound || 1) + 1
        user.lastSettledDay = today
        user.updatedAt = new Date().toISOString()
        
        settledUsers.push(userId)
        console.log(`✅ [CRON-SETTLE] Settled user ${userId}: ${totalPoints} points`)
      } catch (e: any) {
        console.error(`❌ [CRON-SETTLE] Failed to settle user ${userId}:`, e)
        errors.push({ userId, error: e?.message || 'Unknown error' })
      }
    }
    
    // Save all changes
    await saveUsers(users)
    
    console.log(`✅ [CRON-SETTLE] Settlement complete: ${settledUsers.length} users settled, ${errors.length} errors`)
    
    return res.status(200).json({
      ok: true,
      date: today,
      settledCount: settledUsers.length,
      settledUsers,
      errors
    })
  } catch (e: any) {
    console.error('❌ [CRON-SETTLE] Fatal error:', e)
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' })
  }
}

