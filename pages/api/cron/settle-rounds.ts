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
import { saveDailyRoundSummary, type DailyRoundSummary } from "../../../lib/history"; // <-- YENİ İMPORT

const CRON_SECRET = process.env.CRON_SECRET;

// ... (Yardımcı fonksiyonlar: nerfFactor, clamp, calcPoints, utcDayKey AYNI KALSIN) ...
// ... (Burayı yer kaplamaması için kısalttım, eski helperlarını koru) ...

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });

  const { key } = req.query;
  if (!CRON_SECRET) return res.status(500).json({ ok: false, error: "Server Error: CRON_SECRET not set" });
  if (key !== CRON_SECRET) return res.status(401).json({ ok: false, error: "Unauthorized" });

  try {
    console.log("🔒 [CRON] Finalizing Round & Saving Stats...");
    
    const today = utcDayKey();
    const users = await loadUsers();
    const settledUsers: string[] = [];
    
    // --- GLOBAL İSTATİSTİK DEĞİŞKENLERİ ---
    let dailyTotalPlayers = 0;
    let dailyTotalPoints = 0;
    let dailyTopPlayer: DailyRoundSummary['topPlayer'] = null;
    const tokenPerformance: Record<string, number> = {}; // Hangi token ne kadar kazandırdı
    // --------------------------------------

    // 1. Fiyat Snapshot (AYNI KALSIN)
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
        } catch (e) {}
      })
    );

    // 2. Kullanıcıları İşle
    for (const uid in users) {
      const user = users[uid];
      if (!user) continue;

      // Veri onarımı
      if (!Array.isArray(user.activeRound)) user.activeRound = [];
      if (!Array.isArray(user.nextRound)) user.nextRound = Array(5).fill(null);
      if (!Array.isArray(user.roundHistory)) user.roundHistory = [];

      // Çifte işlem koruması
      if (user.lastSettledDay === today) continue;

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

          if (pick.locked && typeof pick.pointsLocked === "number") {
            itemPoints = pick.pointsLocked;
            closingPrice = pick.pLock || 0;
            openingPrice = pick.startPrice || 0;
          } else {
            closingPrice = priceMap[pick.tokenId] || 0;
            openingPrice = pick.startPrice || (await getPriceForToken(pick.tokenId)).p0;

            if (closingPrice && openingPrice) {
              // calcPoints fonksiyonun dosyada tanımlı olduğunu varsayıyorum
              itemPoints = calcPoints(openingPrice, closingPrice, pick.dir, pick.duplicateIndex, 0, false);
            }
          }

          totalPoints += itemPoints;
          
          // Token performansını kaydet (En iyi kartı bulmak için)
          if (!tokenPerformance[pick.tokenId] || itemPoints > tokenPerformance[pick.tokenId]) {
             // Basit mantık: En yüksek puan getiren kartı "En İyi Token" seçelim
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

        // İSTATİSTİK TOPLA (Eğer oynadıysa)
        if (hasActiveRound) {
            dailyTotalPlayers++;
            dailyTotalPoints += totalPoints;

            // En iyi oyuncuyu güncelle
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
              startPrice: entryPrice,
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
        console.error(`Error settling user ${uid}:`, err);
      }
    }

    // --- GLOBAL İSTATİSTİĞİ REDIS'E KAYDET ---
    // En iyi tokeni bul
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
    console.error("CRON ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
