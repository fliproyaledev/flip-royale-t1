// =======================
// duels.ts (REDIS UPDATED)
// =======================

import fs from 'fs'
import path from 'path'

import { TOKEN_MAP } from './tokens'
import type { Token } from './tokens'

// ESKİ IMPORTLAR SİLİNDİ (Dexscreener/Gecko)
// YENİ IMPORT: Fiyatı Redis'ten okuyan fonksiyon
import { getPriceForToken } from './price' 

import {
  getOrCreateUser,
  loadUsers,
  saveUsers,
  creditBank,
  creditGamePoints,
  debitBank
} from './users'

import { loadDuelsKV, saveDuelsKV } from './kv'

// ---------------------
// TYPES
// ---------------------
export type DuelPickInput = { tokenId: string; direction: 'up' | 'down' }

export type DuelPick = {
  tokenId: string
  direction: 'up' | 'down'
  // Network/Pair artık zorunlu değil çünkü Oracle yönetiyor, ama tip uyumu için opsiyonel bırakabiliriz
  network?: string 
  pair?: string
  locked: boolean
  lockedAt?: string
  lockedPct?: number
}

export type DuelSide = {
  userId: string
  entryPaid: boolean
  locked: boolean
  lockedAt?: string
  picks: DuelPick[]
  score?: number
}

export type DuelRoom = {
  id: string
  createdAt: string
  baseDay: string
  evalAt: string
  entryCost: number
  status: 'open' | 'ready' | 'locked' | 'settled' | 'cancelled'
  host: DuelSide
  guest?: DuelSide
  seq?: number
  result?: {
    settledAt: string
    winner: 'host' | 'guest' | 'draw'
    hostScore: number
    guestScore: number
    payoutPerWinner: number
  }
}

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'duels.json')
const IS_VERCEL = !!process.env.VERCEL

function ensureDir() {
  if (IS_VERCEL) return
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

// ---------------------
// LOAD & SAVE
// ---------------------
export async function loadDuels(): Promise<Record<string, DuelRoom>> {
  try {
    const kv = await loadDuelsKV()
    if (kv && Object.keys(kv).length > 0) return kv
  } catch {}

  try {
    ensureDir()
    if (!fs.existsSync(FILE)) return {}
    const raw = fs.readFileSync(FILE, 'utf8')
    const json = JSON.parse(raw)
    await saveDuelsKV(json).catch(() => {})
    return json
  } catch {
    return {}
  }
}

export async function saveDuels(map: Record<string, DuelRoom>): Promise<void> {
  await saveDuelsKV(map).catch(() => {})
  if (IS_VERCEL) return
  try {
    ensureDir()
    fs.writeFileSync(FILE, JSON.stringify(map, null, 2), 'utf8')
  } catch {}
}

// ---------------------
// HELPERS
// ---------------------
export function todayIsoDate(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10)
}

export function nextMidnightIso(from?: Date): string {
  const d = from ? new Date(from) : new Date()
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
  return n.toISOString()
}

// ---------------------
// PRICE CALC (GÜNCELLENDİ)
// ---------------------
async function currentSignedPctFor(
  token: Token,
  direction: 'up' | 'down'
): Promise<{ pct: number; network?: string; pair?: string } | null> {
  
  // YENİ MANTIK: Direkt Redis Cache'den (Oracle'dan) oku
  const priceData = await getPriceForToken(token.id)
  
  // Eğer veri yoksa veya hata varsa null dön
  if (!priceData || priceData.source.startsWith('fallback')) return null

  const pct = priceData.changePct
  if (typeof pct !== 'number') return null

  const signed = direction === 'up' ? pct : -pct
  
  // Network/Pair bilgisini de priceData'dan alıp dönüyoruz
  return { 
    pct: signed, 
    network: priceData.dexNetwork, 
    pair: priceData.dexPair 
  }
}

// Count today rooms
export function countRoomsForDate(map: Record<string, DuelRoom>, dateIso: string): number {
  return Object.values(map).filter(r => r.baseDay === dateIso).length
}

const SYSTEM_USER_ID = 'system'

// ---------------------
// CREATE ROOM
// ---------------------
export async function createRoom(userId: string, entryCost = 2500) {
  const map = await loadDuels()
  const date = todayIsoDate()

  const id = `duel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  const now = new Date()

  const room: DuelRoom = {
    id,
    createdAt: now.toISOString(),
    baseDay: date,
    evalAt: nextMidnightIso(now),
    entryCost,
    status: 'open',
    host: { userId, entryPaid: false, locked: false, picks: [] }
  }

  const users = await loadUsers()
  const host = getOrCreateUser(users, userId)

  if (host.bankPoints < entryCost) throw new Error('Insufficient points')
  debitBank(host, entryCost, `duel-entry-${id}`, date)

  room.host.entryPaid = true
  map[id] = room

  await saveDuels(map)
  await saveUsers(users)

  return { room, users }
}

// ---------------------
// JOIN ROOM
// ---------------------
export async function joinRoom(roomId: string, userId: string) {
  const map = await loadDuels()
  const room = map[roomId]

  if (!room) throw new Error('Room not found')
  if (room.status !== 'open') throw new Error('Room not open')

  const users = await loadUsers()

  if (room.host.userId === userId) throw new Error('Host cannot join own room')

  const guest = getOrCreateUser(users, userId)
  if (guest.bankPoints < room.entryCost) throw new Error('Insufficient points')

  debitBank(guest, room.entryCost, `duel-entry-${room.id}`, room.baseDay)
  room.guest = { userId, entryPaid: true, locked: false, picks: [] }
  room.status = 'ready'

  map[roomId] = room
  await saveUsers(users)
  await saveDuels(map)

  return { room, users }
}

// ---------------------
// SET PICKS
// ---------------------
export async function setPicks(roomId: string, userId: string, picks: DuelPickInput[]) {
  if (!Array.isArray(picks) || picks.length !== 5)
    throw new Error('Must select 5 picks')

  const map = await loadDuels()
  const room = map[roomId]
  if (!room) throw new Error('Room not found')

  const side =
    room.host.userId === userId
      ? room.host 
      : room.guest?.userId === userId
      ? room.guest 
      : null

  if (!side) throw new Error('Not a participant')
  if (!side.entryPaid) throw new Error('Entry not paid')

  const lockedMap = new Map<string, DuelPick>()
  side.picks.forEach(pk => pk.locked && lockedMap.set(pk.tokenId, pk))

  for (const id of lockedMap.keys()) {
    if (!picks.find(p => p.tokenId === id))
      throw new Error('Cannot remove locked pick')
  }

  side.picks = picks.map(p =>
    lockedMap.get(p.tokenId)
      ? { ...lockedMap.get(p.tokenId)!, direction: p.direction }
      : { tokenId: p.tokenId, direction: p.direction, locked: false }
  )

  map[roomId] = room
  await saveDuels(map)
  return room
}

// ---------------------
// LOCK PICKS
// ---------------------
export async function lockPicks(
  roomId: string,
  userId: string,
  picks: DuelPickInput[],
  now: Date = new Date()
) {
  if (!Array.isArray(picks) || picks.length === 0)
    throw new Error('Provide picks')

  const map = await loadDuels()
  const room = map[roomId]
  if (!room) throw new Error('Room not found')

  const side =
    room.host.userId === userId
      ? room.host 
      : room.guest?.userId === userId
      ? room.guest
      : null

  if (!side) throw new Error('Not a participant')
  if (!side.entryPaid) throw new Error('Entry not paid')
  if (!side.picks.length) throw new Error('Set picks first')

  const nowIso = now.toISOString()
  const reqMap = new Map(picks.map(p => [p.tokenId, p]))

  const updated: DuelPick[] = []

  for (const pk of side.picks) {
    if (reqMap.has(pk.tokenId)) {
      const req = reqMap.get(pk.tokenId)!
      const token = TOKEN_MAP[req.tokenId]
      if (!token) throw new Error('Unknown token')

      const r = await currentSignedPctFor(token, req.direction)
      if (!r) throw new Error('Price fetch error (Oracle not ready?)')

      updated.push({
        tokenId: req.tokenId,
        direction: req.direction,
        network: r.network,
        pair: r.pair,
        locked: true,
        lockedAt: nowIso,
        lockedPct: r.pct
      })
    } else {
      updated.push(pk)
    }
  }

  side.picks = updated
  if (side.picks.length === 5 && side.picks.every(p => p.locked)) {
    side.locked = true
    side.lockedAt = nowIso
  }

  if (
    room.host.locked &&
    room.guest &&
    room.guest.locked
  ) {
    room.status = 'locked'
  }

  map[roomId] = room
  await saveDuels(map)
  return room
}

// ---------------------
// SETTLE ROOM
// ---------------------
export async function settleRoom(roomId: string) {
  const map = await loadDuels()
  const room = map[roomId]
  if (!room) throw new Error('Room not found')

  if (room.status === 'settled')
    return { room, users: await loadUsers() }

  const now = new Date()
  const evalAt = new Date(room.evalAt)
  if (now.getTime() < evalAt.getTime())
    throw new Error('Eval time not reached')

  async function computeScore(side?: DuelSide): Promise<number> {
    if (!side) return 0
    let score = 0

    for (const pk of side.picks) {
      if (pk.lockedPct !== undefined) {
        score += pk.lockedPct
        continue
      }

      const token = TOKEN_MAP[pk.tokenId]
      if (!token) continue

      const r = await currentSignedPctFor(token, pk.direction)
      if (r) score += r.pct
    }

    return score
  }

  const hostScore = await computeScore(room.host)
  const guestScore = await computeScore(room.guest)

  let winner: 'host' | 'guest' | 'draw' = 'draw'
  if (room.guest) {
    if (hostScore > guestScore) winner = 'host'
    else if (guestScore > hostScore) winner = 'guest'
  }

  const users = await loadUsers()
  const hostUser = getOrCreateUser(users, room.host.userId)
  const guestUser = room.guest ? getOrCreateUser(users, room.guest.userId) : null

  let payout = 0

  if (winner === 'draw') {
    creditBank(hostUser, room.entryCost, `duel-refund-${room.id}`, room.baseDay)
    if (guestUser) creditBank(guestUser, room.entryCost, `duel-refund-${room.id}`, room.baseDay)
  } else {
    payout = room.entryCost * 2
    const target = winner === 'host' ? hostUser : guestUser!
    creditGamePoints(target, payout, `duel-win-${room.id}`, room.baseDay)
  }

  room.status = 'settled'
  room.result = {
    settledAt: now.toISOString(),
    winner,
    hostScore,
    guestScore,
    payoutPerWinner: payout
  }

  map[roomId] = room
  await saveDuels(map)
  await saveUsers(users)

  return { room, users }
}

// ---------------------
// CANCEL ROOM
// ---------------------
export async function cancelRoom(roomId: string, userId: string) {
  const map = await loadDuels()
  const room = map[roomId]

  if (!room) throw new Error('Room not found')
  if (room.status !== 'open') throw new Error('Room not open')
  if (room.host.userId !== userId) throw new Error('Only host can cancel')

  const users = await loadUsers()
  const host = getOrCreateUser(users, userId)

  creditBank(host, room.entryCost, `duel-cancel-${room.id}`, room.baseDay)

  room.status = 'cancelled'
  room.result = {
    settledAt: new Date().toISOString(),
    winner: 'draw',
    hostScore: 0,
    guestScore: 0,
    payoutPerWinner: 0
  }

  map[roomId] = room
  await saveDuels(map)
  await saveUsers(users)

  return { room, users }
}

// ---------------------
// CLEANUP LEGACY ROOMS
// ---------------------
export async function seedDailyRooms() {
  const map = await loadDuels()
  const today = todayIsoDate()
  let changed = false

  for (const [id, room] of Object.entries(map)) {
    if (!room) continue

    // Remove legacy auto-seeded rooms (system host, never filled)
    if (room.host?.userId === SYSTEM_USER_ID && !room.guest && !room.host.entryPaid) {
      delete map[id]
      changed = true
      continue
    }

    // Cancel stale rooms from previous days that never settled properly
    if (
      room.baseDay !== today &&
      (room.status === 'open' || room.status === 'ready' || room.status === 'locked')
    ) {
      room.status = 'cancelled'
      changed = true
    }
  }

  if (changed) {
    await saveDuels(map)
  }
}
