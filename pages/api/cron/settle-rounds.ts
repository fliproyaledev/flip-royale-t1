import type { NextApiRequest, NextApiResponse } from "next";
import {
  loadUsers,
  saveUsers,
  creditGamePoints,
  type RoundPick,
  type UserRecord,
  type RoundHistoryEntry
} from "../../../lib/users";
import { getPriceForToken } from "../../../lib/price";
import { TOKEN_MAP } from "../../../lib/tokens";
import { saveDailyRoundSummary, type DailyRoundSummary } from "../../../lib/history";

const CRON_SECRET = process.env.CRON_SECRET;

// ---------------- UTILITY FUNCTIONS ----------------

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
  pStart: number,
  pEnd: number,
  dir: "UP" | "DOWN",
  dup: number
) {
  if (!isFinite(pStart) || !isFinite(pEnd) || pStart <= 0 || pEnd <= 0) return 0;

  const pct = ((pEnd - pStart) / pStart) * 100;
  const signed = dir === "UP" ? pct : -pct;

  let pts = signed * 100;

  const nerf = nerfFactor(dup);
  const loss = 2 - nerf;

  pts = pts >= 0 ? pts * nerf : pts * loss;
  
  pts = clamp(pts, -2500, 2500);

  return Math.round(pts);
}

function utcDayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ---------------- HANDLER ----------------

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // 1. Güvenlik Kontrolleri
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });

  const { key } = req.query;
  if (!CRON_SECRET) return res.status(500).json({ ok: false, error: "Server Error: CRON_SECRET not set" });
  if (key !== CRON_SECRET) return res.status(401).json({ ok: false, error: "Unauthorized" });

  try {
    console.log("🔒 [CRON] Finalizing Round & Saving Stats...");
    
    const today = utcDayKey();
    const users = await loadUsers();
    const settledUsers: string[] = [];
    const errors: any[] = []; // <-- HATA ÇÖZÜMÜ: errors değişkeni tanımlandı
    
    // --- GLOBAL İSTATİSTİK DEĞİŞKENLERİ ---
    let dailyTotalPlayers = 0;
    let dailyTotalPoints = 0;
    let dailyTopPlayer: DailyRoundSummary['topPlayer'] = null;
    const tokenPerformance: Record<string, number> = {}; 
    // --------------------------------------

    // 1. Fiyat Snapshot
    const allTokenIds = new Set<string>();
    Object.values(users).forEach((user: UserRecord) => {
      user.activeRound?.forEach(p => p && allTokenIds.add(p.tokenId));
      user.nextRound?.forEach(p => p && allTokenIds.add(p.tokenId));
    });

    const priceMap: Record<string, number> = {};
    await Promise.all(
      Array.from(allTokenIds).map(async (tokenId) => {
        try {
          const data = await getPriceForToken(tokenId);
          const price = data.pLive || data.pClose || data.p0 || 0;
          if (price > 0) priceMap[tokenId] = price;
        } catch (e) {
          console.error(`Failed to fetch price for ${tokenId}`, e);
        }
      })
    );

    console.log("✅ [CRON] Prices snapshot taken. Processing users...");

    // 2. Kullanıcıları İşle
    for (const uid in users) {
      const user = users[uid];
      if (!user) continue;

      // Veri onarımı
      if (!Array.isArray(user.activeRound)) user.activeRound = [];
      if (!Array.isArray(user.nextRound)) user.nextRound = Array(5).fill(null);
      if (!Array.isArray(user.roundHistory)) user.roundHistory = [];

      // Çifte işlem koruması
      // Not: Test bittikten sonra buradaki yorum satırını açmayı unutmayın
      // if (user.lastSettledDay === today) continue; 

      try {
        let totalPoints = 0;
        const historyItems: RoundHistoryEntry['items'] = [];
        let hasActiveRound = false;

        // A) BİTEN TURU HESAPLA
        for (const pick of user.activeRound) {
          if (!pick || !pick.tokenId) continue;
          hasActiveRound = true;

          let itemPoints = 0;
          let closingPrice = 0;
          let openingPrice = 0;

          // 1. Durum: Kart Kilitli
          if (pick.locked && typeof pick.pointsLocked === "number") {
            itemPoints = pick.pointsLocked;
            closingPrice = pick.pLock || 0;
            openingPrice = pick.startPrice || 0;
          } 
          // 2. Durum: Kart Açık
          else {
            closingPrice = priceMap[pick.tokenId] || 0;
            openingPrice = pick.startPrice || (await getPriceForToken(pick.tokenId)).p0;

            if (closingPrice && openingPrice) {
              itemPoints = calcPoints(openingPrice, closingPrice, pick.dir, pick.duplicateIndex);
            }
          }

          totalPoints += itemPoints;
          
          // Token performansını kaydet
          if (!tokenPerformance[pick.tokenId] || itemPoints > tokenPerformance[pick.tokenId]) {
             tokenPerformance[pick.tokenId] = itemPoints; 
          }

          const tokenInfo = TOKEN_MAP[pick.tokenId];
          historyItems.push({
            tokenId: pick.tokenId,
            symbol: tokenInfo ? tokenInfo.symbol : pick.tokenId,
            dir: pick.dir,
            duplicateIndex: pick.duplicateIndex,
            points: itemPoints,
            startPrice: openingPrice,
            closePrice: closingPrice
          });
        }

        // İSTATİSTİK TOPLA (Global)
        if (hasActiveRound) {
            dailyTotalPlayers++;
            dailyTotalPoints += totalPoints;

            if (!dailyTopPlayer || totalPoints > dailyTopPlayer.points) {
                dailyTopPlayer = {
                    username: user.name || 'Unknown',
                    avatar: user.avatar || '/avatars/default-avatar.png',
                    points: totalPoints
                };
            }
        }

        // Puanları cüzdana ekle
        if (totalPoints !== 0) {
          creditGamePoints(user, totalPoints, `flip-round-${today}`, today);
        }

        // HISTORY KAYDET (Kişisel)
        if (historyItems.length > 0) {
            const historyEntry: RoundHistoryEntry = {
                roundNumber: user.currentRound || 1,
                date: today,
                totalPoints: totalPoints,
                items: historyItems
            };
            user.roundHistory.unshift(historyEntry);
            if (user.roundHistory.length > 50) user.roundHistory = user.roundHistory.slice(0, 50);
        }

        // B) YENİ TURU BAŞLAT
        const nextPicksRaw = (user.nextRound || []).filter(Boolean) as RoundPick[];
        const newActiveRound: RoundPick[] = [];

        for (const pick of nextPicksRaw) {
          const entryPrice = priceMap[pick.tokenId];
          if (entryPrice) {
            newActiveRound.push({
              ...pick,
              startPrice: entryPrice, // Fiyat mühürle
              locked: false,
              pLock: undefined,
              pointsLocked: undefined
            });
          }
        }

        user.activeRound = newActiveRound.length > 0 ? newActiveRound : [];
        user.nextRound = Array(5).fill(null);
        user.currentRound = (user.currentRound || 1) + 1;
        user.lastSettledDay = today;
        user.updatedAt = new Date().toISOString();

        settledUsers.push(user.id);

      } catch (err: any) {
        // Hata durumunda logla
        errors.push({ uid, error: err.message }); 
        console.error(`Error settling user ${uid}:`, err);
      }
    }

    // --- GLOBAL İSTATİSTİĞİ REDIS'E KAYDET ---
    let bestTokenSymbol = '-';
    let bestTokenPoints = -Infinity;
    for (const [tid, pts] of Object.entries(tokenPerformance)) {
        if (pts > bestTokenPoints) {
            bestTokenPoints = pts;
            bestTokenSymbol = TOKEN_MAP[tid]?.symbol || tid;
        }
    }

    const dailySummary: DailyRoundSummary = {
        date: today,
        totalPlayers: dailyTotalPlayers,
        totalPointsDistributed: dailyTotalPoints,
        topPlayer: dailyTopPlayer,
        bestToken: bestTokenSymbol !== '-' ? { symbol: bestTokenSymbol, changePct: 0 } : null
    };

    await saveDailyRoundSummary(dailySummary); 
    console.log("📊 [CRON] Global Stats Saved:", dailySummary);
    // -----------------------------------------

    await saveUsers(users);

    return res.status(200).json({
      ok: true,
      date: today,
      settledCount: settledUsers.length,
      globalStats: dailySummary
    });

  } catch (err: any) {
    console.error("CRON ERROR (Main Block):", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
