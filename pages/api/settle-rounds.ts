export const config = {
  runtime: 'nodejs',
};
import type { NextApiRequest, NextApiResponse } from 'next'
import { 
  loadUsers, 
  saveUsers, 
  creditGamePoints, 
  type RoundPick 
} from '../../lib/users'

import { getPriceForToken } from '../../lib/users'

// --- Utility: Duplicate Pick Nerf ---
function nerfFactor(dup: number): number {
  if (dup <= 1) return 1;
  if (dup === 2) return 0.75;
  if (dup === 3) return 0.5;
  if (dup === 4) return 0.25;
  return 0;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

function calcPoints(
  p0: number,
  pClose: number,
  dir: 'UP' | 'DOWN',
  dup: number,
  boostLevel: 0 | 50 | 100,
  boostActive: boolean
) {
  if (!isFinite(p0) || !isFinite(pClose) || p0 <= 0 || pClose <= 0) return 0;

  const pct = ((pClose - p0) / p0) * 100;
  const signed = dir === 'UP' ? pct : -pct;
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
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  // ☑ Vercel Cron sadece GET gönderir
  if (req.method !== 'GET')
    return res.status(405).json({ ok: false, error: 'GET only' })

  // ☑ Yeni doğrulama: sadece bu header yeterli
  if (!req.headers['x-vercel-cron']) {
    return res.status(401).json({ ok: false, error: 'Unauthorized (Not Cron)' })
  }

  try {
    const today = utcDayKey();

    const users = await loadUsers();
    const settledUsers: string[] = [];
    const errors: any[] = [];

    for (const id in users) {
      const user = users[id];
      if (!user || !user.id) continue;

      if (!Array.isArray(user.activeRound)) user.activeRound = [];
      if (!Array.isArray(user.nextRound)) user.nextRound = Array(5).fill(null);

      if (user.lastSettledDay === today) continue;

      try {
        let total = 0;

        for (const pick of user.activeRound) {
          if (!pick || !pick.tokenId) continue;

          if (pick.locked && typeof pick.pointsLocked === 'number') {
            total += pick.pointsLocked;
            continue;
          }

          const price = await getPriceForToken(pick.tokenId);

          const pts = calcPoints(
            price.p0,
            price.pClose,
            pick.dir,
            pick.duplicateIndex,
            0,
            false
          );

          total += pts;
        }

        if (total !== 0) {
          creditGamePoints(user, total, `flip-round-${today}`, today);
        }

        const next = (user.nextRound || []).filter(Boolean) as RoundPick[];

        if (next.length > 0) {
          user.activeRound = next;
          user.nextRound = Array(5).fill(null);
        } else {
          user.activeRound = [];
        }

        user.currentRound = (user.currentRound || 1) + 1;
        user.lastSettledDay = today;
        user.updatedAt = new Date().toISOString();

        settledUsers.push(user.id);

      } catch (e: any) {
        errors.push({ userId: id, error: e.message });
      }
    }

    await saveUsers(users);

    return res.status(200).json({
      ok: true,
      date: today,
      settledCount: settledUsers.length,
      settledUsers,
      errors
    });

  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}



