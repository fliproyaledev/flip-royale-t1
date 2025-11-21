import type { NextApiRequest, NextApiResponse } from "next";
import {
  loadUsers,
  saveUsers,
  creditGamePoints,
  type RoundPick,
  type UserRecord
} from "../../../lib/users";
import { getPriceForToken } from "../../../lib/price";

// Vercel Environment Variables'dan gizli anahtarı alıyoruz
const CRON_SECRET = process.env.CRON_SECRET;

// ---------------- Utility Functions ----------------

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

  // Yüzdelik değişim: (Kapanış - Açılış) / Açılış
  const pct = ((pEnd - pStart) / pStart) * 100;
  const signed = dir === "UP" ? pct : -pct;

  let pts = signed * 100;

  // Nerf (Duplicate) Cezası
  const nerf = nerfFactor(dup);
  const loss = 2 - nerf; // Kayıp durumunda daha fazla ceza (Infinex mantığı)

  pts = pts >= 0 ? pts * nerf : pts * loss;
  
  // Puanı -2500 ile +2500 arasında sınırla (Oyun dengesi için)
  pts = clamp(pts, -2500, 2500);

  return Math.round(pts);
}

function utcDayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ---------------- Handler ----------------

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
    console.log("🔒 [CRON] Finalizing Round Started...");
    
    const today = utcDayKey();
    const users = await loadUsers();
    const settledUsers: string[] = [];
    const errors: any[] = [];

    // ---------------------------------------------------------
    // ADIM 1: GLOBAL FİYAT FOTOĞRAFI (SNAPSHOT)
    // Tüm kullanıcıların kartlarındaki tokenleri bul ve tek seferde fiyatlarını çek.
    // Bu sayede herkes için "Kapanış" ve "Açılış" fiyatı milimetrik aynı olur.
    // ---------------------------------------------------------
    
    const allTokenIds = new Set<string>();

    // Hangi tokenlerin fiyatına ihtiyacımız var?
    Object.values(users).forEach((user: UserRecord) => {
      // Active round'daki kartlar (Puan hesaplamak için)
      user.activeRound?.forEach(p => p && allTokenIds.add(p.tokenId));
      // Next round'daki kartlar (Yeni başlangıç fiyatı belirlemek için)
      user.nextRound?.forEach(p => p && allTokenIds.add(p.tokenId));
    });

    // Fiyatları çek ve hafızaya (Map) al
    const priceMap: Record<string, number> = {};
    console.log(`📉 [CRON] Fetching prices for ${allTokenIds.size} tokens...`);

    await Promise.all(
      Array.from(allTokenIds).map(async (tokenId) => {
        try {
          const data = await getPriceForToken(tokenId);
          // Fiyat önceliği: pLive (Canlı) > pClose > p0
          const price = data.pLive || data.pClose || data.p0 || 0;
          if (price > 0) priceMap[tokenId] = price;
        } catch (e) {
          console.error(`Failed to fetch price for ${tokenId}`, e);
        }
      })
    );

    console.log("✅ [CRON] Prices snapshot taken. Processing users...");

    // ---------------------------------------------------------
    // ADIM 2: KULLANICILARI İŞLE (DAĞITIM)
    // ---------------------------------------------------------

    for (const uid in users) {
      const user = users[uid];
      if (!user) continue;

      // Veri onarımı
      if (!Array.isArray(user.activeRound)) user.activeRound = [];
      if (!Array.isArray(user.nextRound)) user.nextRound = Array(5).fill(null);

      // Eğer bu kullanıcı bugün zaten işlendiyse atla (Çifte işlem koruması)
      if (user.lastSettledDay === today) continue;

      try {
        let totalPoints = 0;

        // --- A) BİTEN TURUN PUANLARINI HESAPLA ---
        for (const pick of user.activeRound) {
          if (!pick || !pick.tokenId) continue;

          // 1. Durum: Kart Kilitli
          if (pick.locked && typeof pick.pointsLocked === "number") {
            totalPoints += pick.pointsLocked;
            continue;
          }

          // 2. Durum: Kart Açık (24s Kapanış Fiyatını Kullan)
          // Fiyatı API'den değil, yukarıda aldığımız "priceMap"ten alıyoruz.
          const closingPrice = priceMap[pick.tokenId];
          
          // Başlangıç fiyatı (startPrice) yoksa, token'in p0'ını kullan (Eski veri uyumluluğu)
          // ÖNEMLİ: 'startPrice' dünkü turun açılış fiyatıdır.
          const openingPrice = pick.startPrice || (await getPriceForToken(pick.tokenId)).p0;

          if (closingPrice && openingPrice) {
            const pts = calcPoints(openingPrice, closingPrice, pick.dir, pick.duplicateIndex);
            totalPoints += pts;
          }
        }

        // Puanları cüzdana ekle
        if (totalPoints !== 0) {
          creditGamePoints(user, totalPoints, `flip-round-${today}`, today);
        }

        // --- B) YENİ TURU BAŞLAT (Next -> Active) ---
        const nextPicksRaw = (user.nextRound || []).filter(Boolean) as RoundPick[];
        const newActiveRound: RoundPick[] = [];

        for (const pick of nextPicksRaw) {
          // Yeni tur için 'startPrice' belirliyoruz.
          // KRİTİK NOKTA: Burada kullandığımız fiyat, yukarıdaki 'closingPrice' ile AYNI.
          // Yani Dünün Kapanışı = Bugünün Açılışı.
          const entryPrice = priceMap[pick.tokenId];
          
          if (entryPrice) {
            newActiveRound.push({
              ...pick,
              startPrice: entryPrice, // Fiyat mühürlendi! 🔒
              locked: false,
              pLock: undefined,
              pointsLocked: undefined
            });
          }
        }

        // Kartları taşı
        if (newActiveRound.length > 0) {
          user.activeRound = newActiveRound;
          user.nextRound = Array(5).fill(null); // Next round boşaltılır
        } else {
          user.activeRound = [];
        }

        // Tarih ve Tur Sayacını Güncelle
        user.currentRound = (user.currentRound || 1) + 1;
        user.lastSettledDay = today;
        user.updatedAt = new Date().toISOString();

        settledUsers.push(user.id);

      } catch (err: any) {
        errors.push({ uid, error: err.message });
      }
    }

    // ---------------------------------------------------------
    // ADIM 3: KAYDET VE BİTİR
    // ---------------------------------------------------------
    
    await saveUsers(users);
    console.log(`🏁 [CRON] Round finalized. ${settledUsers.length} users settled.`);

    return res.status(200).json({
      ok: true,
      date: today,
      settledCount: settledUsers.length,
      priceSnapshotCount: Object.keys(priceMap).length,
      errors,
    });

  } catch (err: any) {
    console.error("CRON ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
