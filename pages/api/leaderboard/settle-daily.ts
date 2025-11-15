import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers, getOrCreateUser, applyDailyDelta, grantDailyBonus } from '../../../lib/users'
import { loadLeaderboardConfig } from '../../../lib/config'

type DailyInput = {
  userId: string
  deltaPoints: number
}

function toIsoDate(date?: string | number | Date): string {
  const d = date ? toUTCDate(date) : new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)).toISOString().slice(0, 10)
}

function toUTCDate(input: string | number | Date): Date { return new Date(input) }

function normalizePercents(percs: number[]): number[] {
  const clamped = percs.map(p => Math.max(0, Number(p) || 0))
  const sum = clamped.reduce((a, b) => a + b, 0)
  if (sum <= 0) return Array.from({ length: 20 }, (_v, i) => ((21 - (i + 1)) / 210) * 100)
  return clamped.map(p => (p / sum) * 100)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  try {
    const date = toIsoDate(req.body?.date)
    const daily: DailyInput[] = Array.isArray(req.body?.daily) ? req.body.daily : []
    const bonusPool = Number(req.body?.bonusPool ?? 20000)
    const cfg = loadLeaderboardConfig()
    const percents: number[] = normalizePercents(Array.isArray((req.body?.bonusPercents)) ? req.body.bonusPercents : cfg.dailyBonusPercents)

    const users = await loadUsers()

    // 1) Apply daily deltas (positives add to total; negatives only logged)
    for (const item of daily) {
      if (!item?.userId || !Number.isFinite(item?.deltaPoints)) continue
      const user = getOrCreateUser(users, item.userId)
      applyDailyDelta(user, date, Number(item.deltaPoints), 'daily-delta')
    }

    // 2) Build ranking by positive delta (competition ranking with tie handling)
    const positives = daily
      .filter(i => i && i.userId && Number(i.deltaPoints) > 0)
      .map(i => ({ userId: i.userId, delta: Number(i.deltaPoints) }))
      .sort((a, b) => b.delta - a.delta)

    type Group = { delta: number; users: string[] }
    const groups: Group[] = []
    for (const p of positives) {
      if (!groups.length || groups[groups.length - 1].delta !== p.delta) {
        groups.push({ delta: p.delta, users: [p.userId] })
      } else {
        groups[groups.length - 1].users.push(p.userId)
      }
    }

    // 3) Assign percentage shares to groups up to top-20 with split on boundary ties
    const awards: Array<{ userId: string; bonus: number; rankFrom: number; rankTo: number; delta: number }> = []
    let rank = 1
    let remainingPercents = percents.slice(0) // copy

    for (const g of groups) {
      if (rank > 20) break
      const startRank = rank
      const endRank = Math.min(20, startRank + g.users.length - 1)
      const slice = remainingPercents.slice(0, endRank - startRank + 1)
      const sliceSum = slice.reduce((a, b) => a + b, 0)
      const eachShare = g.users.length > 0 ? Math.floor(((sliceSum * bonusPool) / 100) / g.users.length) : 0
      for (const uid of g.users) {
        const user = getOrCreateUser(users, uid)
        grantDailyBonus(user, date, eachShare, `daily-bonus-${date} ranks ${startRank}-${endRank}`)
        awards.push({ userId: uid, bonus: eachShare, rankFrom: startRank, rankTo: endRank, delta: g.delta })
      }
      remainingPercents = remainingPercents.slice(endRank - startRank + 1)
      rank = endRank + 1
    }

    await saveUsers(users)

    return res.status(200).json({
      ok: true,
      date,
      bonusPool: bonusPool,
      winnersCount: awards.length,
      awards,
      schemePercents: percents
    })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' })
  }
}


