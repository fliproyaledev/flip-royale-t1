import type { NextApiRequest, NextApiResponse } from "next";
import {
  loadDuels,
  saveDuels,
  settleRoom,
} from "../../../lib/duels";

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

  // GÜVENLİK KONTROLÜ: Sadece Vercel Cron tarafından çağrıldığından emin ol
  if (!req.headers["x-vercel-cron"]) {
    // Manuel testlerde 401 hatası almanız normaldir ve bu güvenliğin çalıştığını gösterir.
    return res
      .status(401)
      .json({ ok: false, error: "Unauthorized (Not Vercel Cron)" });
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

      // Zaten hesaplanmış veya iptal edilmiş odaları atla
      if (room.status === "settled" || room.status === "cancelled") continue;

      // Değerlendirme zamanı yoksa atla
      if (!room.evalAt) continue;

      const evalAt = new Date(room.evalAt);

      // Değerlendirme zamanı henüz gelmediyse atla
      if (now.getTime() < evalAt.getTime()) continue;

      try {
        // Odadaki düelloyu hesapla ve kazananı belirle
        await settleRoom(roomId);
        settled.push(roomId);
      } catch (err: any) {
        errors.push({ roomId, error: err.message });
      }
    }

    // Değişiklikleri kaydet
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
