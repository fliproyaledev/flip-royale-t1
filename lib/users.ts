import fs from 'fs'
import path from 'path'
import { loadUsersKV, saveUsersKV } from './kv'

const IS_VERCEL = !!process.env.VERCEL

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type LogEntry = {
  date: string       // YYYY-MM-DD
  type: 'daily' | 'duel' | 'system'
  dailyDelta?: number
  bonusGranted?: number
  note?: string
}

export type RoundPick = {
  tokenId: string
  dir: 'UP' | 'DOWN'
  duplicateIndex: number
  locked: boolean
  pLock?: number
  pointsLocked?: number
  startPrice?: number // Mühürlenmiş başlangıç fiyatı
}

// YENİ: Geçmiş Tur Detayları
export type RoundHistoryEntry = {
  roundNumber: number
  date: string
  totalPoints: number
  items: {
    tokenId: string
    symbol: string
    dir: 'UP' | 'DOWN'
    duplicateIndex: number
    points: number
    startPrice?: number
    closePrice?: number
  }[]
}

export type UserRecord = {
  id: string
  name?: string
  avatar?: string
  walletAddress?: string

  totalPoints: number
  bankPoints: number
  giftPoints: number

  logs: LogEntry[]
  createdAt?: string
  updatedAt: string

  activeRound?: RoundPick[]
  nextRound?: RoundPick[]
  currentRound?: number
  lastSettledDay?: string
  inventory?: Record<string, number>
  lastDailyPack?: string
  
  // GÜNCELLENDİ: History yapısı artık 'any' değil, detaylı tip
  roundHistory?: RoundHistoryEntry[] 
}

// ─────────────────────────────────────────────────────────────
// FILE FALLBACK PATHS
// ─────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')

function ensureDir() {
  if (IS_VERCEL) return
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

// ─────────────────────────────────────────────────────────────
// LOAD USERS
// ─────────────────────────────────────────────────────────────

export async function loadUsers(): Promise<Record<string, UserRecord>> {
  try {
    const kv = await loadUsersKV()
    if (kv && typeof kv === 'object' && Object.keys(kv).length > 0) {
      return kv as Record<string, UserRecord>
    }
  } catch (e) {
    console.warn('KV load failed:', e)
  }

  try {
    ensureDir()
    if (!fs.existsSync(USERS_FILE)) return {}
    const raw = fs.readFileSync(USERS_FILE, 'utf8')
    const json = JSON.parse(raw)
    if (json && typeof json === 'object') {
      try { await saveUsersKV(json) } catch {}
      return json as Record<string, UserRecord>
    }
  } catch {}
  return {}
}

// ─────────────────────────────────────────────────────────────
// SAVE USERS
// ─────────────────────────────────────────────────────────────

export async function saveUsers(map: Record<string, UserRecord>): Promise<void> {
  await saveUsersKV(map); 
  if (IS_VERCEL) return;
  try {
    ensureDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(map, null, 2), 'utf8');
  } catch (err) {
    console.warn('JSON write failed:', err);
  }
}

// ─────────────────────────────────────────────────────────────
// SYNC LOAD/SAVE (LOCAL DEV)
// ─────────────────────────────────────────────────────────────

export function loadUsersSync(): Record<string, UserRecord> {
  if (IS_VERCEL) return {}
  try {
    ensureDir()
    if (!fs.existsSync(USERS_FILE)) return {}
    const raw = fs.readFileSync(USERS_FILE, 'utf8')
    return JSON.parse(raw)
  } catch { return {} }
}

export function saveUsersSync(map: Record<string, UserRecord>): void {
  if (IS_VERCEL) { saveUsersKV(map).catch(() => {}); return }
  ensureDir()
  fs.writeFileSync(USERS_FILE, JSON.stringify(map, null, 2), 'utf8')
  saveUsersKV(map).catch(() => {})
}

// ─────────────────────────────────────────────────────────────
// CREATE OR REPAIR USER
// ─────────────────────────────────────────────────────────────

export function getOrCreateUser(map: Record<string, UserRecord>, userId: string): UserRecord {
  if (!userId || userId.trim() === '' || userId === 'undefined') {
    throw new Error(`Invalid userId: "${userId}"`)
  }

  let user = map[userId]

  if (!user) {
    const now = new Date().toISOString()
    user = {
      id: userId,
      totalPoints: 0,
      bankPoints: 10000,
      giftPoints: 10000,
      logs: [{
        type: 'system',
        date: now.slice(0, 10),
        bonusGranted: 10000,
        note: 'user-registered'
      }],
      createdAt: now,
      updatedAt: now,
      activeRound: [],
      nextRound: Array(5).fill(null) as any,
      currentRound: 1,
      inventory: {},
      roundHistory: []
    }
    map[userId] = user
  }

  // Auto-repair old users
  if (!Array.isArray(user.logs)) user.logs = []
  if (typeof user.totalPoints !== 'number') user.totalPoints = 0
  if (typeof user.bankPoints !== 'number') user.bankPoints = 0
  if (typeof user.giftPoints !== 'number') user.giftPoints = 0
  if (!Array.isArray(user.activeRound)) user.activeRound = []
  if (!Array.isArray(user.nextRound)) user.nextRound = Array(5).fill(null) as any
  if (!user.currentRound) user.currentRound = 1
  if (!user.inventory || typeof user.inventory !== 'object') user.inventory = {}
  if (!Array.isArray(user.roundHistory)) user.roundHistory = []

  return user
}

// ─────────────────────────────────────────────────────────────
// POINT OPERATIONS
// ─────────────────────────────────────────────────────────────

export function applyDailyDelta(user: UserRecord, dateIso: string, delta: number, note?: string) {
  if (delta > 0) {
    user.totalPoints += delta
    user.bankPoints += delta
  }
  user.logs.push({
    type: 'daily',
    date: dateIso.slice(0, 10),
    dailyDelta: delta,
    note
  })
  user.updatedAt = new Date().toISOString()
}

export function grantDailyBonus(user: UserRecord, dateIso: string, bonus: number, note?: string) {
  if (bonus > 0) {
    user.totalPoints += bonus
    user.bankPoints += bonus
    user.logs.push({
      type: 'daily',
      date: dateIso.slice(0, 10),
      bonusGranted: bonus,
      note
    })
    user.updatedAt = new Date().toISOString()
  }
}

export function creditBank(user: UserRecord, amount: number, note?: string, dateIso?: string) {
  if (!Number.isFinite(amount)) return
  user.bankPoints += amount
  user.logs.push({
    type: 'system',
    date: dateIso || new Date().toISOString().slice(0, 10),
    bonusGranted: amount,
    note
  })
  user.updatedAt = new Date().toISOString()
}

export function creditGamePoints(user: UserRecord, amount: number, note?: string, dateIso?: string) {
  if (!Number.isFinite(amount)) return
  if (amount > 0) user.totalPoints += amount
  user.bankPoints += amount
  user.logs.push({
    type: 'system',
    date: dateIso || new Date().toISOString().slice(0, 10),
    dailyDelta: amount > 0 ? amount : 0,
    note
  })
  user.updatedAt = new Date().toISOString()
}

export function debitBank(user: UserRecord, amount: number, note?: string, dateIso?: string) {
  if (!Number.isFinite(amount)) return
  let useGift = Math.min(amount, user.giftPoints)
  user.giftPoints -= useGift
  amount -= useGift
  if (amount > 0) {
    user.bankPoints = Math.max(0, user.bankPoints - amount)
  }
  user.logs.push({
    type: 'system',
    date: dateIso || new Date().toISOString().slice(0, 10),
    note
  })
  user.updatedAt = new Date().toISOString()
}
