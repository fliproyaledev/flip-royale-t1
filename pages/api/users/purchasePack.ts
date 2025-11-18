import type { NextApiRequest, NextApiResponse } from "next"
import { loadUsers, saveUsers, getOrCreateUser, debitBank } from "../../../lib/users"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // İstek metodu kontrolü
    if (req.method !== "POST" && req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" })
    }

    // FRONTEND user parametresi GÖNDERMİYOR → biz otomatik üretiriz
    const userId =
      req.query.user?.toString() ||
      req.body?.user?.toString() ||
      req.headers["x-user-id"]?.toString() ||
      "guest-" + Math.random().toString(36).slice(2, 9)

    const count = Number(req.query.count || req.body?.count || 1)

    if (!Number.isFinite(count) || count <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid count" })
    }

    // Kullanıcıları yükle
    const map = await loadUsers()

    // User oluştur veya getir
    const user = getOrCreateUser(map, userId)

    // 1 pack = 5000 points
    const packCost = 5000 * count

    if (user.bankPoints + user.giftPoints < packCost) {
      return res.status(400).json({ ok: false, error: "Insufficient points" })
    }

    // Puan düş
    debitBank(user, packCost, "purchase-pack")

    // Kullanıcıyı kaydet
    await saveUsers(map)

    return res.json({
      ok: true,
      user,
      purchased: count,
      cost: packCost
    })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "Server error" })
  }
}
