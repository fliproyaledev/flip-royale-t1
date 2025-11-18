import type { NextApiRequest, NextApiResponse } from "next";
import { getUser, saveUser } from "../../../lib/users";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const id = String(req.query.id || "");
    let packs = Number(req.query.packs || 1);

    if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
    if (packs <= 0) packs = 1;

    const PACK_COST = 5000;
    const totalCost = PACK_COST * packs;

    const user = await getUser(id);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    let { bankPoints, giftPoints } = user;

    // ---- STEP 1: GIFT POINTS HARCA ----
    let remainingCost = totalCost;

    if (giftPoints > 0) {
      const useGift = Math.min(giftPoints, remainingCost);
      giftPoints -= useGift;
      remainingCost -= useGift;
    }

    // ---- STEP 2: BANK POINTS HARCA (gerekirse) ----
    if (remainingCost > 0) {
      if (bankPoints < remainingCost) {
        return res.status(400).json({
          ok: false,
          error: "Not enough points"
        });
      }
      bankPoints -= remainingCost;
    }

    // ---- STEP 3: Kullanıcının puanlarını güncelle ----
    user.giftPoints = giftPoints;
    user.bankPoints = bankPoints;

    // totalPoints = bankPoints (UI için)
    user.totalPoints = bankPoints;

    // Yeni kart eklemeyi burada yapabilirsiniz (zaten vardı)

    await saveUser(user);

    return res.json({
      ok: true,
      message: "Pack purchased successfully",
      cost: totalCost,
      giftPoints,
      bankPoints,
      totalPoints: user.totalPoints,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
