import type { NextApiRequest, NextApiResponse } from 'next'
import { 
  loadUsers, 
  saveUsers, 
  creditGamePoints, 
  type RoundPick 
} from '../../../lib/users'

// --- Utility: Duplicate Pick Nerf ---
function nerfFactor(dup: number): number {
  if (dup <= 1) return 1
  if (dup === 2) return 0.75
  if (dup === 3) return 0.5
  if (dup === 4) return 0.25
  if (dup >= 5) return 0
  return 0
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max)
}

// --- POINT CALCULATION ---
function calcPoints(
  p0: number,
  pNow: number,
  dir: 'UP' | 'DOWN',
  dup: number,
  boostLevel: 0 | 50 | 100,
  boostActive: boolean
): number {
  if (!isFinite(p0) || !isFinite(pNow) || p0 <= 0 || pNow <= 0) return 0

  const pct = ((pNow - p0) / p0) * 100
  const signed = dir === 'UP' ? pct : -pct
  let pts = signed * 100

  const nerf = nerfFactor(dup)
  const loss = 2 - nerf

  if (pts >= 0) pts *= nerf
  else pts *= loss

  pts = clamp(pts, -2500, 2500)

  if (boostActive && boostLevel && pts > 0) {
    pts *= boostLevel === 100 ? 2 : boostLevel === 50 ? 1.5 : 1
  }

  return Math.round(pts)
}

// --- PRICE FETCH FROM INTERNAL API ---
async function getPrice(tokenId: string): Promise<any> {
  try {
    const baseUrl =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const r = await fetch(
      `${baseUrl}/api/price?token=${encodeURIComponent(tokenId)}`,
      { headers: { 'User-Agent': 'FlipRoyale-Cron/1.0' } }
    )

    if (!r.ok) throw new Error(`Price API failed ${r.status}`)
    const d = await r.json()

    return {
      p0: d.p0 || d.pLive || 1,
      pLive: d.pLive || 1,
      pClose: d.pClose || d.pLive || 1,
      changePct: d.changePct || 0
    }
  } catch (e) {
    console.error(`❌ Price fetch error for ${tokenId}:`, e)
    return { p0: 1, pLive: 1, pClose: 1, changePct: 0 }
  }
}

// --- UTC DATE KEY ---
function utcDayKey() {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// --- HANDLER ---
export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  const isTestMode = req.query.test === '1'

  // Allow only Vercel Cron in production
  if (process.env.NODE_ENV === 'production' && !isTestMode) {
    if (!req.headers['x-vercel-cron']) {
      return res.status(401).json({ ok: false, error: 'Unauthorized (Not Vercel Cron)' })
    }
  }

  try {
    const today = utcDayKey()
    console.log(`🔄 [CRON-Rounds] Settling rounds for ${today}`)

    const users = await loadUsers()
    const settledUsers: string[] = []
    const errors: any[] = []

    for (const id in users) {
      const user = users[id]

      if (!user || typeof user !== 'object') continue
      if (!user.id || user.id.trim() === '') continue

      if (!Array.isArray(user.activeRound)) user.activeRound = []
      if (!Array.isArray(user.nextRound)) user.nextRound = Array(5).fill(null)

      // Already settled today
      if (user.lastSettledDay === today) continue

      try {
        let totalPoints = 0

        for (const pick of user.activeRound) {
          if (!pick || !pick.tokenId) continue

          // If pick was manually locked
          if (pick.locked && typeof pick.pointsLocked === 'number') {
            totalPoints += pick.pointsLocked
            continue
          }

          const price = await getPrice(pick.tokenId)

          const points = calcPoints(
            price.p0,
            price.pClose,
            pick.dir,
            pick.duplicateIndex,
            0,
            false
          )

          totalPoints += points
        }

        // Apply points to leaderboard + bank
        if (totalPoints !== 0) {
          creditGamePoints(
            user,
            totalPoints,
            `flip-royale-round-${today}`,
            today
          )
        }

        // Move nextRound → activeRound
        const next = (user.nextRound || []).filter(Boolean) as RoundPick[]

        if (next.length > 0) {
          user.activeRound = next
          user.nextRound = Array(5).fill(null)
        } else {
          user.activeRound = []
        }

        user.currentRound = (user.currentRound || 1) + 1
        user.lastSettledDay = today
        user.updatedAt = new Date().toISOString()

        settledUsers.push(user.id)

      } catch (e: any) {
        errors.push({ userId: id, error: e?.message || 'Unknown error' })
      }
    }

    await saveUsers(users)

    return res.status(200).json({
      ok: true,
      date: today,
      settledUsers,
      settledCount: settledUsers.length,
      errors
    })

  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' })
  }
}
