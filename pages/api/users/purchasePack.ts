import type { NextApiRequest, NextApiResponse } from "next"
import { loadUsers, saveUsers, getOrCreateUser, debitBank } from "../../../lib/users"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" })
    }

    // --- USERID KONTROLÜ (TEK DOĞRU YÖNTEM) ---
    let userId = req.headers["x-user-id"]?.toString() || ""

    if (!userId || userId === "null" || userId === "undefined") {
      // İlk defa pack alan guest kullanıcı
      userId = "guest-" + Math.random().toString(36).slice(2, 9)
    }

    const count = Number(req.body?.count || 1)
    if (!Number.isFinite(count) || count <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid count" })
    }

    const packCost = 5000 * count

    // --- USERS LOAD ---
    const map = await loadUsers()
    const user = getOrCreateUser(map, userId)

    // --- POINT CHECK ---
    if (user.bankPoints + user.giftPoints < packCost) {
      return res.status(400).json({ ok: false, error: "Insufficient points" })
    }

    // --- BUY PACK (gift -> bank sıralaması zaten debitBank içinde) ---
    debitBank(user, packCost, "purchase-pack")

    // --- SAVE ---
    await saveUsers(map)

    return res.json({
      ok: true,
      purchased: count,
      cost: packCost,
      user
    })

  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "Server error" })
  }
}
