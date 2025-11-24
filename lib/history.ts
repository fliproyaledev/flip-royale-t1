import { kv } from '@vercel/kv' // Veya kullandığın redis client
import { loadUsersKV, saveUsersKV } from './kv' // Mevcut KV yapını kullan

// Günlük Global Özet Tipi
export type DailyRoundSummary = {
  date: string
  totalPlayers: number
  totalPointsDistributed: number
  topPlayer: {
    username: string
    avatar: string
    points: number
  } | null
  bestToken: {
    symbol: string
    changePct: number
  } | null
}

// Günlük özeti kaydet (Cron kullanacak)
export async function saveDailyRoundSummary(summary: DailyRoundSummary) {
  try {
    // Her gün için ayrı bir key: "round_summary:2025-11-24"
    await kv.set(`round_summary:${summary.date}`, summary)
    
    // Ayrıca tüm tarihlerin listesini de tutalım ki "Previous Rounds" listesi yapabilelim
    await kv.lpush('round_history_dates', summary.date)
  } catch (e) {
    console.error('Failed to save daily summary:', e)
  }
}

// Geçmiş turların listesini çek (Frontend kullanacak)
export async function getPreviousRounds(limit = 10): Promise<DailyRoundSummary[]> {
  try {
    // Tarih listesinden son X günü çek
    const dates = await kv.lrange('round_history_dates', 0, limit - 1)
    if (!dates || dates.length === 0) return []

    const keys = dates.map(d => `round_summary:${d}`)
    if (keys.length === 0) return []

    // O tarihlerin detaylarını çek
    const summaries = await kv.mget(...keys)
    
    return summaries.filter(Boolean) as DailyRoundSummary[]
  } catch (e) {
    return []
  }
}
