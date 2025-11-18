import type { NextApiRequest, NextApiResponse } from "next";
import { 
  loadUsers, 
  saveUsers, 
  getOrCreateUser, 
  debitBank 
} from "../../../lib/users";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = String(req.query.user || "").trim();
    const packCount = Number(req.query.count || 1);

    if (!userId) {
      return res.status(400).json({ ok: false, error: "Missing user" });
    }
    if (!Number.isFinite(packCount) || packCount < 1) {
      return res.status(400).json({ ok: false, error: "Invalid count" });
    }

    // Load map
    const users = await loadUsers();

    // Load or create user
    const user = getOrCreateUser(users, userId);

    // PACK COST = 5000 per pack
    const cost = packCount * 5000;

    // Payment uses debitBank → spends giftPoints first (correct)
    debitBank(user, cost, `purchase-pack-${packCount}`);

    user.updatedAt = new Date().toISOString();

    await saveUsers(users);

    return res.json({
      ok: true,
      user: {
        id: user.id,
        bankPoints: user.bankPoints,
        giftPoints: user.giftPoints,
        totalPoints: user.totalPoints,
      }
    });

  } catch (err: any) {
    console.error("purchasePack error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
