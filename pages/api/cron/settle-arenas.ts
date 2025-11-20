import type { NextApiRequest, NextApiResponse } from "next";
import {
  loadDuels,
  saveDuels,
  settleRoom,
} from "../../../lib/duels";

// CRON GÜVENLİK ANAHTARI
const CRON_SECRET = process.env.CRON_SECRET;

function utcDayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET")
    return res.status(405).json({ ok: false, error: "GET only" });

  // GÜVENLİK KONTROLÜ (Yeni ve Güvenli Yöntem)
  const vercelCronHeader = req.headers["x-vercel-cron"];

  if (!CRON_SECRET) {
    return res
      .status(500) // 500 kodu, sunucu hatası (konfigürasyon eksik)
      .json({ ok: false, error: "Configuration Error: CRON_SECRET is missing." });
  }
  
  if (vercelCronHeader !== CRON_SECRET) {
    return res
      .status(401)
      .json({ ok: false, error: "Unauthorized: Invalid CRON_SECRET or missing header." });
  }

  try {
    const today = utcDayKey();
    const now = new Date();

    const duels = await loadDuels();
    const settled: string[] = [];
    const errors: any[] = [];

    for (const roomId in duels) {
      const room = duels[roomId];
      if (!room) continue;

      if (room.status === "settled" || room.status === "cancelled") continue;

      if (!room.evalAt) continue;

      const evalAt = new Date(room.evalAt);

      if (now.getTime() < evalAt.getTime()) continue;

      try {
        await settleRoom(roomId);
        settled.push(roomId);
      } catch (err: any) {
        errors.push({ roomId, error: err.message });
      }
    }

    await saveDuels(duels);

    return res.status(200).json({
      ok: true,
      date: today,
      settledCount: settled.length,
      settledRooms: settled,
      errors,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
