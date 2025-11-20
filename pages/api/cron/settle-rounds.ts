import type { NextApiRequest, NextApiResponse } from "next";
import {
  loadUsers,
  saveUsers,
  creditGamePoints,
  type RoundPick,
} from "../../../lib/users";

import { getPriceForToken } from "../../../lib/price";

// Vercel Environment Variables'dan gizli anahtarı alıyoruz
const CRON_SECRET = process.env.CRON_SECRET;

// ---------------- Utility ----------------

function nerfFactor(dup: number): number {
  if (dup <= 1) return 1;
  if (dup === 2) return 0.75;
  if (dup === 3) return 0.5;
  if (dup === 4) return 0.25;
  return 0;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function calcPoints(
  p0: number,
  pClose: number,
  dir: "UP" | "DOWN",
  dup: number,
  boostLevel: 0 | 50 | 100,
  boostActive: boolean
) {
  if (!isFinite(p0) || !isFinite(pClose) || p0 <= 0 || pClose <= 0) return 0;

  const pct = ((pClose - p0) / p0) * 100;
  const signed = dir === "UP" ? pct : -pct;

  let pts = signed * 100;

  const nerf = nerfFactor(dup);
  const loss = 2 - nerf;

  pts = pts >= 0 ? pts * nerf : pts * loss;
  pts = clamp(pts, -2500, 2500);

  if (boostActive && boostLevel && pts > 0) {
    pts *= boostLevel === 100 ? 2 : boostLevel === 50 ? 1.5 : 1;
  }

  return Math.round(pts);
}

function utcDayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ---------------- Handler ----------------

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Sadece GET isteklerine izin ver
  if (req.method !== "GET")
    return res.status(405).json({ ok: false, error: "GET only" });

  // ---------------------------------------------------------
  // GÜVENLİK KONTROLÜ (Harici Cron Servisi İçin)
  // URL'den gelen 'key' parametresini kontrol eder.
  // Örnek kullanım: https://site.com/api/cron/settle-rounds?key=GIZLI_SIFRE
  // ---------------------------------------------------------
  const { key } = req.query;

  if (!CRON_SECRET) {
    return res.status(500).json({ ok: false, error: "Server Error: CRON_SECRET not set in env" });
  }

  if (key !== CRON_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized: Invalid Secret Key" });
  }
  // ---------------------------------------------------------

  try {
    const today = utcDayKey();
    const users = await loadUsers();

    const settledUsers: string[] = [];
    const errors: any[] = [];

    for (const uid in users) {
      const user = users[uid];
      if (!user) continue;

      if (!Array.isArray(user.activeRound)) user.activeRound = [];
      if (!Array.isArray(user.nextRound))
        user.nextRound = Array(5).fill(null);

      // Eğer kullanıcı bugün zaten hesaplandıysa atla
      if (user.lastSettledDay === today) continue;

      try {
        let total = 0;

        // 1. ADIM: Eski Active Round'un Puanlarını Hesapla
        for (const pick of user.activeRound) {
          if (!pick || !pick.tokenId) continue;

          // Eğer kart kilitliyse, kilitli puanı kullan
          if (pick.locked && typeof pick.pointsLocked === "number") {
            total += pick.pointsLocked;
            continue;
          }

          // Eğer kilitli değilse, UTC 00:00'daki kapanış fiyatıyla hesapla
          const price = await getPriceForToken(pick.tokenId);

          const pts = calcPoints(
            price.p0,
            price.pClose,
            pick.dir,
            pick.duplicateIndex,
            0, // Boost seviyesi Cron'da 0 varsayıldı
            false // Boost aktifliği Cron'da false varsayıldı
          );

          total += pts;
        }

        // Puanları kullanıcının hesabına yükle
        if (total !== 0) {
          creditGamePoints(
            user,
            total,
            `flip-round-${today}`,
            today
          );
        }

        // 2. ADIM: Next Round Kartlarını Active Round'a Taşı
        const next = (user.nextRound || []).filter(Boolean) as RoundPick[];

        if (next.length > 0) {
          user.activeRound = next;
          user.nextRound = Array(5).fill(null); // Next Round'u sıfırla
        } else {
          user.activeRound = []; // Next Round boşsa Active Round'u da boşalt
        }

        // Tur ve yerleşim gününü güncelle
        user.currentRound = (user.currentRound || 1) + 1;
        user.lastSettledDay = today;
        user.updatedAt = new Date().toISOString();

        settledUsers.push(user.id);
      } catch (err: any) {
        errors.push({ uid, error: err.message });
      }
    }

    // 3. ADIM: Verileri Kaydet (Upstash/Redis)
    await saveUsers(users);

    return res.status(200).json({
      ok: true,
      date: today,
      settledCount: settledUsers.length,
      settledUsers,
      errors,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
