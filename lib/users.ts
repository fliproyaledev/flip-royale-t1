import fs from 'fs'
import path from 'path'
import { loadUsersKV, saveUsersKV } from './kv'

export type LogEntry = {
  date: string // ISO date (YYYY-MM-DD)
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
}

export type UserRecord = {
  id: string
  name?: string
  avatar?: string
  walletAddress?: string // Wallet address for wallet connection

  totalPoints: number // leaderboard points (never decreased, excludes gift points)
  bankPoints: number  // spendable points for Arena (includes gift points)
  giftPoints: number  // initial gift points (not counted in leaderboard)

  logs: LogEntry[]
  createdAt?: string // Registration timestamp
  updatedAt: string

  // Flip Royale round data (server-side storage)
  activeRound?: RoundPick[]      // Current active round picks
  nextRound?: RoundPick[]        // Next round picks (saved)
  currentRound?: number          // Current round number
  lastSettledDay?: string        // Last day when round was settled (YYYY-MM-DD)
}

const DATA_DIR = path.join(process.cwd(), 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

// Try KV first, fallback to JSON file for backward compatibility
export async function loadUsers(): Promise<Record<string, UserRecord>> {
  try {
    // Try KV (Vercel production)
    const kvData = await loadUsersKV()
    if (kvData && Object.keys(kvData).length > 0) {
      return kvData as Record<string, UserRecord>
    }
  } catch (err) {
    console.warn('KV load failed, trying JSON fallback:', err)
  }

  // Fallback to JSON file (local dev or migration period)
  try {
    ensureDir()
    if (!fs.existsSync(USERS_FILE)) return {}
    const raw = fs.readFileSync(USERS_FILE, 'utf8')
    const json = JSON.parse(raw)
    if (json && typeof json === 'object') {
      // Migrate to KV if KV is available
      try {
        await saveUsersKV(json)
      } catch {}
      return json as Record<string, UserRecord>
    }
    return {}
  } catch {
    return {}
  }
}

export async function saveUsers(map: Record<string, UserRecord>): Promise<void> {
  try {
    // Save to KV (Vercel production)
    await saveUsersKV(map)
  } catch (err) {
    console.warn('KV save failed, trying JSON fallback:', err)
  }

  // Also save to JSON file for backup/local dev
  try {
    ensureDir()
    fs.writeFileSync(USERS_FILE, JSON.stringify(map, null, 2), 'utf8')
  } catch (err) {
    console.warn('JSON save failed:', err)
  }
}

// Güvenli user oluşturma / getirme
export function getOrCreateUser(map: Record<string, UserRecord>, userId: string): UserRecord {
  // Invalid ID’leri tamamen blokla
  if (!userId || userId === 'undefined' || userId.trim() === '') {
    throw new Error(`Invalid userId: "${userId}"`)
  }

  let user = map[userId]

  if (!user) {
    const now = new Date().toISOString()
    // Yeni kayıt: 10.000 gift + 10.000 bank
    user = {
      id: userId,
      totalPoints: 0,
      bankPoints: 10000,
      giftPoints: 10000,
      logs: [
        {
          type: 'system',
          date: now.slice(0, 10),
          bonusGranted: 10000,
          note: 'user-registered'
        }
      ],
      createdAt: now,
      updatedAt: now,
      activeRound: [],
      nextRound: Array(5).fill(null) as any,
      currentRound: 1,
      // lastSettledDay undefined başlasın
    }
    map[userId] = user
  }

  // Eski kayıtları otomatik tamir et
  if (!Array.isArray(user.logs)) user.logs = []
  if (typeof user.totalPoints !== 'number') user.totalPoints = 0
  if (typeof user.bankPoints !== 'number') user.bankPoints = 0
  if (typeof user.giftPoints !== 'number') user.giftPoints = 0
  if (!user.activeRound) user.activeRound = []
  if (!user.nextRound) user.nextRound = Array(5).fill(null) as any
  if (!user.currentRound) user.currentRound = 1

  return user
}

// Sync version for backward compatibility (loads from JSON file)
export function loadUsersSync(): Record<string, UserRecord> {
  try {
    ensureDir()
    if (!fs.existsSync(USERS_FILE)) return {}
    const raw = fs.readFileSync(USERS_FILE, 'utf8')
    const json = JSON.parse(raw)
    return json && typeof json === 'object' ? (json as Record<string, UserRecord>) : {}
  } catch {
    return {}
  }
}

export function saveUsersSync(map: Record<string, UserRecord>): void {
  ensureDir()
  fs.writeFileSync(USERS_FILE, JSON.stringify(map, null, 2), 'utf8')
  // Async KV save (fire and forget)
  saveUsersKV(map).catch(() => {})
}

export function applyDailyDelta(user: UserRecord, dateIso: string, delta: number, note?: string) {
  if (delta > 0) {
    user.totalPoints += delta
    // Also credit spendable balance so points are usable in both modes
    user.bankPoints += delta
  }
  user.logs.push({ type: 'daily', date: dateIso.slice(0, 10), dailyDelta: delta, note })
  user.updatedAt = new Date().toISOString()
}

export function grantDailyBonus(user: UserRecord, dateIso: string, bonus: number, note?: string) {
  if (bonus > 0) {
    user.totalPoints += bonus
    // Mirror to spendable balance for unified points
    user.bankPoints += bonus
    user.logs.push({
      type: 'daily',
      date: dateIso.slice(0, 10),
      dailyDelta: 0,
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

// Credit game points (for leaderboard) - updates both totalPoints and bankPoints
export function creditGamePoints(user: UserRecord, amount: number, note?: string, dateIso?: string) {
  if (!Number.isFinite(amount)) return
  // Only add positive amounts to totalPoints (leaderboard)
  if (amount > 0) {
    user.totalPoints += amount
  }
  // Always update bankPoints (spendable balance)
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

  // Spend gift points first, then normal points
  const giftPointsToSpend = Math.min(amount, user.giftPoints || 0)
  const remainingAmount = amount - giftPointsToSpend

  // Deduct gift points first
  if (giftPointsToSpend > 0) {
    user.giftPoints = Math.max(0, (user.giftPoints || 0) - giftPointsToSpend)
    // Also deduct from bankPoints when gift points are spent
    user.bankPoints = Math.max(0, user.bankPoints - giftPointsToSpend)
  }

  // Deduct remaining from bankPoints (normal points)
  if (remainingAmount > 0) {
    user.bankPoints = Math.max(0, user.bankPoints - remainingAmount)
  }

  user.logs.push({
    type: 'system',
    date: dateIso || new Date().toISOString().slice(0, 10),
    dailyDelta: 0,
    note
  })
  user.updatedAt = new Date().toISOString()
}
