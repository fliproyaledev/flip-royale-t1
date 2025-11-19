import type { NextApiRequest, NextApiResponse } from "next";
import { loadUsers, saveUsers, type RoundPick } from "../../../lib/users";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { userId, slot, tokenId, dir } = req.body;

    if (!userId || slot === undefined || !tokenId || !dir) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
    }

    if (!["UP", "DOWN"].includes(dir)) {
      return res.status(400).json({ ok: false, error: "Invalid direction" });
    }

    const users = await loadUsers();
    const user = users[userId];

    if (!user) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    if (!Array.isArray(user.nextRound)) {
      user.nextRound = [null, null, null, null, null];
    }

    const newPick: RoundPick = {
      tokenId,
      dir: dir as "UP" | "DOWN",
      duplicateIndex: 1,
      locked: false,
    };

    user.nextRound[slot] = newPick;
    user.updatedAt = new Date().toISOString();

    await saveUsers(users);

    return res.status(200).json({ ok: true, nextRound: user.nextRound });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
