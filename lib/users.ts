import fs from 'fs'
import path from 'path'
import { loadUsersKV, saveUsersKV } from './kv'

export type LogEntry = {
  date: string
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
}

const DATA_DIR = path.join(process.cwd(), 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

// -----------------------------------------------
// 1. LOAD USERS
// -----------------------------------------------

export async function loadUsers(): Promise<Record<string, UserRecord>> {
  try {
    const kvData = await loadUsersKV()
    if (kvData && Object.keys(kvData).length > 0) {
      return kvData as Record<string, UserRecord>
    }
  } catch (err) {
    console.warn('KV load failed, using JSON fallback:', err)
  }

  try {
    ensureDir()
    if (!fs.existsSync(USERS_FILE)) return {}
    const raw = fs.readFileSync(USERS_FILE, 'utf8')
    const json = JSON.parse(raw)
    return json || {}
  } catch {
    return {}
  }
}

// -----------------------------------------------
// 2. SAVE USERS
// -----------------------------------------------

export async function saveUsers(map: Record<string, UserRecord>) {
  try {
    await saveUsersKV(map)
  } catch (err) {
    console.warn('KV save failed, JSON fallback:', err)
  }

  try {
    ensureDir()
    fs.writeFileSync(USERS_FILE, JSON.stringify(map, null, 2), 'utf8')
  } catch (err) {
    console.warn('JSON save failed:', err)
  }
}

// -----------------------------------------------
// 3. FIXED getOrCreateUser
// -----------------------------------------------

export function getOrCreateUser(map: Record<string, UserRecord>, userId: string): UserRecord {
  // Prevent invalid IDs
  if (!userId || userId === 'undefined' || userId.trim() === '') {
    throw new Error(`Invalid userId: "${userId}"`)
  }

  let user = map[userId]

  if (!user) {
    // NEW USER DEFAULTS
    const now = new Date().toISOString()

    user = {
      id: userId,
      totalPoints: 0,
      bankPoints: 10000,   // NEW USERS GET +10.000 GIFT POINTS (usable)
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
      nextRound: Array(5).fill(null),
      currentRound: 1,
      lastSettledDay: null
    }

    map[userId] = user
  }

  // AUTO-FIX OLD USERS
  if (!Array.isArray(user.logs)) user.logs = []
  if (typeof user.totalPoints !== 'number') user.totalPoints = 0
  if (typeof user.bankPoints !== 'number') user.bankPoints = 0
  if (typeof user.giftPoints !== 'number') user.giftPoints = 0
  if (!user.activeRound) user.activeRound = []
  if (!user.nextRound) user.nextRound = Array(5).fill(null)
  if (!user.currentRound) user.currentRound = 1

  return user
}

// -----------------------------------------------
// 4. POINT / LOG FUNCTIONS
// -----------------------------------------------

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

export function creditGamePoints(user: UserRecord, amount: number, note?: string, dateIso?: string) {
  if (!Number.isFinite(amount)) return

  if (amount > 0) {
    user.totalPoints += amount
  }

  user.bankPoints += amount

  user.logs.push({
    type: 'system',
    date: (dateIso || new Date().toISOString().slice(0, 10)),
    dailyDelta: amount > 0 ? amount : 0,
    note
  })

  user.updatedAt = new Date().toISOString()
}

export function debitBank(user: UserRecord, amount: number, note?: string, dateIso?: string) {
  if (!Number.isFinite(amount)) return

  const giftUsed = Math.min(amount, user.giftPoints || 0)
  const remain = amount - giftUsed

  if (giftUsed > 0) {
    user.giftPoints -= giftUsed
    user.bankPoints -= giftUsed
  }

  if (remain > 0) {
    user.bankPoints = Math.max(0, user.bankPoints - remain)
  }

  user.logs.push({
    type: 'system',
    date: (dateIso || new Date().toISOString().slice(0, 10)),
    dailyDelta: 0,
    note
  })

  user.updatedAt = new Date().toISOString()
}
