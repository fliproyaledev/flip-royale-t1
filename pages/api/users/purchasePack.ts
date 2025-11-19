import type { NextApiRequest, NextApiResponse } from "next"
import { loadUsers, saveUsers, getOrCreateUser, debitBank } from "../../../lib/users"
import { makeRandom5 } from "../../../lib/game-utils"
import { TOKENS } from "../../../lib/tokens"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" })
    }

    // ---------------------------
    //  USER ID SADECE BURADAN GELİR
    // ---------------------------
    let userId = req.headers["x-user-id"]?.toString() || ""

    // Yeni kullanıcı → guest ID üret
    if (!userId || userId === "null" || userId === "undefined") {
      userId = "guest-" + Math.random().toString(36).slice(2, 10)
    }

    // Kaç paket alınıyor?
    const count = Number(req.body?.count || 1)
    if (!Number.isFinite(count) || count <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid count" })
    }

    // Paket fiyatı
    const packCost = 5000 * count

    // ---------------------------
    //  USERS LOAD → KV üzerinden
    // ---------------------------
    const map = await loadUsers()
    const user = getOrCreateUser(map, userId)

    // Para kontrolü
    if (user.bankPoints + user.giftPoints < packCost) {
      return res.status(400).json({ ok: false, error: "Insufficient points" })
    }

    // ---------------------------
    //  PUAN DÜŞÜŞÜ (önce gift → sonra bank)
    // ---------------------------
    debitBank(user, packCost, "purchase-pack")

    // Generate cards
    const allNewCards: string[] = []
    for(let i=0; i<count; i++) {
      const cards = makeRandom5(TOKENS)
      allNewCards.push(...cards)
    }

    // Update inventory
    if (!user.inventory) user.inventory = {}
    for (const cardId of allNewCards) {
      user.inventory[cardId] = (user.inventory[cardId] || 0) + 1
    }

    // ---------------------------
    //  KAYDET
    // ---------------------------
    await saveUsers(map)

    return res.status(200).json({
      ok: true,
      purchased: count,
      cost: packCost,
      user,
      newCards: allNewCards
    })

  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "Server error" })
  }
}
