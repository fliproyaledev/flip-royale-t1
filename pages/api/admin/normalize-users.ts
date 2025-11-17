import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsersKV, saveUsersKV } from '../../../lib/kv'

const ADMIN_KEY = process.env.ADMIN_KEY || "superadmin123"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: "Method not allowed" })
  }

  const key = req.query.key
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" })
  }

  try {
    const users = await loadUsersKV()
    const updatedUsers: any = {}
    const DEFAULT_NEXT = [null, null, null, null, null]

    Object.values(users).forEach((u: any) => {
      const user = { ...u }

      if (!user.createdAt) user.createdAt = new Date().toISOString()
      if (!user.updatedAt) user.updatedAt = new Date().toISOString()

      if (typeof user.totalPoints !== "number") user.totalPoints = 0
      if (typeof user.bankPoints !== "number") user.bankPoints = 0
      if (typeof user.giftPoints !== "number") user.giftPoints = 0

      if (!Array.isArray(user.logs)) user.logs = []

      if (!user.activeRound) user.activeRound = []
      if (!user.nextRound) user.nextRound = DEFAULT_NEXT
      if (!user.currentRound) user.currentRound = 1
      if (!user.lastSettledDay) user.lastSettledDay = ""

      updatedUsers[user.id] = user
    })

    await saveUsersKV(updatedUsers)

    return res.status(200).json({
      ok: true,
      count: Object.keys(updatedUsers).length,
      message: "All users normalized successfully."
    })

  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err.message || "Unknown error"
    })
  }
}
