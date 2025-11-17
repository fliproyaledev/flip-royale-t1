import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers, creditGamePoints, type RoundPick } from '../../../lib/users'

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

async function getPrice(tokenId: string): Promise<any> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const r = await fetch(`${baseUrl}/api/price?token=${encodeURIComponent(tokenId)}`, {
      headers: { 'User-Agent': 'FlipRoyale-Cron/1.0' }
    })

    if (!r.ok) throw new Error(`Price API returned ${r.status}`)

    const data = await r.json()
    return {
      p0: data.p0 || data.pLive || 1,
      pLive: data.pLive || 1,
      pClose: data.pClose || data.pLive || 1,
      changePct: data.changePct
    }
  } catch (e) {
    console.error(`Failed to fetch price for ${tokenId}:`, e)
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

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  // Allow test mode: ?test=1
  const isTestMode = req.query.test === '1'

  // Block non-cron requests in production (except test mode)
  if (process.env.NODE_ENV === 'production' && !isTestMode) {
    const isCron = !!req.headers['x-vercel-cron']
    if (!isCron) {
      return res.status(401).json({ ok: false, error: 'Unauthorized (Not from Vercel Cron)' })
    }
  }

  try {
    const today = utcDayKey()
    console.log(`🔄 [CRON-SETTLE] Starting round settlement for ${today}`)

    const users = await loadUsers()
    const settledUsers: string[] = []
    const errors: Array<{ userId: string; error: string }> = []

    for (const userId in users) {
      const user = users[userId]

      if (!user.activeRound || user.activeRound.length === 0) continue
      if (user.lastSettledDay === today) continue

      try {
        let totalPoints = 0

        for (const pick of user.activeRound) {
          if (!pick || !pick.tokenId) continue

          if (pick.locked && pick.pointsLocked !== undefined) {
            totalPoints += pick.pointsLocked
            continue
          }

          try {
            const priceData = await getPrice(pick.tokenId)
            const pClose = priceData.pClose || priceData.pLive
            const p0 = priceData.p0 || priceData.pLive

            const points = calcPoints(
              p0,
              pClose,
              pick.dir,
              pick.duplicateIndex,
              0,
              false
            )
            totalPoints += points
          } catch (e) {
            console.error(`Point calc failed for ${pick.tokenId}:`, e)
          }
        }

        if (totalPoints !== 0) {
          creditGamePoints(user, totalPoints, `flip-royale-round-${today}`, today)
        }

        const validNextRound = (user.nextRound || []).filter(p => p !== null) as RoundPick[]
        if (validNextRound.length > 0) {
          user.activeRound = validNextRound
          user.nextRound = Array(5).fill(null) as any
        } else {
          user.activeRound = []
        }

        user.currentRound = (user.currentRound || 1) + 1
        user.lastSettledDay = today
        user.updatedAt = new Date().toISOString()

        settledUsers.push(userId)

      } catch (e: any) {
        errors.push({ userId, error: e?.message || 'Unknown error' })
      }
    }

    await saveUsers(users)

    return res.status(200).json({
      ok: true,
      date: today,
      settledCount: settledUsers.length,
      settledUsers,
      errors
    })

  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' })
  }
}
