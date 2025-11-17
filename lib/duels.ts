import fs from 'fs'
import path from 'path'
import { TOKEN_MAP } from './tokens'
import type { Token } from './tokens'
import type { DexscreenerPairRef, DexscreenerQuote } from './dexscreener'
import { getDexPairQuote, findDexPairForToken } from './dexscreener'
import { getGeckoPoolQuote } from './gecko'

// ⬇️ BURASI DÜZELTİLDİ — users.ts ile uyumlu hale getirildi
import {
  getOrCreateUser,
  loadUsers,
  saveUsers,
  creditBank,          // refund için gerekli
  creditGamePoints,
  debitBank,
  loadUsersSync,        // build hatası artık yok
  saveUsersSync
} from './users'

import { loadDuelsKV, saveDuelsKV } from './kv'

export type DuelPickInput = { tokenId: string; direction: 'up' | 'down' }
export type DuelPick = {
  tokenId: string
  direction: 'up' | 'down'
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

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { mode: 0o755, recursive: true })
}

export async function loadDuels(): Promise<Record<string, DuelRoom>> {
  try {
    const kvData = await loadDuelsKV()
    if (Object.keys(kvData).length > 0) {
      return kvData as Record<string, DuelRoom>
    }
  } catch (err) {
    console.warn('KV load failed, trying JSON fallback:', err)
  }

  try {
    ensureDir()
    if (!fs.existsSync(FILE)) return {}
    const raw = fs.readFileSync(FILE, 'utf8')
    const json = JSON.parse(raw)
    if (json && typeof json === 'object') {
      try {
        await saveDuelsKV(json)
      } catch {}
      return json as Record<string, DuelRoom>
    }
    return {}
  } catch {
    return {}
  }
}

export async function saveDuels(map: Record<string, DuelRoom>): Promise<void> {
  try {
    await saveDuelsKV(map)
  } catch (err) {
    console.warn('KV save failed, trying JSON fallback:', err)
  }

  try {
    ensureDir()
    fs.writeFileSync(FILE, JSON.stringify(map, null, 2), 'utf8')
  } catch (err) {
    console.warn('JSON save failed:', err)
  }
}

export function loadDuelsSync(): Record<string, DuelRoom> {
  try {
    ensureDir()
    if (!fs.existsSync(FILE)) return {}
    const raw = fs.readFileSync(FILE, 'utf8')
    const json = JSON.parse(raw)
    return json && typeof json === 'object' ? json as Record<string, DuelRoom> : {}
  } catch {
    return {}
  }
}

export function saveDuelsSync(map: Record<string, DuelRoom>): void {
  ensureDir()
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2), 'utf8')
  saveDuelsKV(map).catch(() => {})
}

export function todayIsoDate(): string {
  const d = new Date()
  const iso = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)).toISOString()
  return iso.slice(0, 10)
}

export function nextMidnightIso(from?: Date): string {
  const d = from ? new Date(from) : new Date()
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0))
  return n.toISOString()
}

async function currentSignedPctFor(
  token: Token,
  direction: 'up' | 'down'
): Promise<{ pct: number; network: string; pair: string } | null> {
  
  const explicitNet = (token.dexscreenerNetwork || '').toLowerCase()
  const explicitPair = (token.dexscreenerPair || '').toLowerCase()

  let ref: DexscreenerPairRef | null = null

  if (explicitNet && explicitPair) {
    ref = { network: explicitNet, pair: explicitPair }
  } else {
    const found = await findDexPairForToken(token)
    if (!found) return null
    ref = { network: found.network, pair: found.pair }
  }

  const quote: DexscreenerQuote | null = await getDexPairQuote(ref.network, ref.pair)
  let pct: number | undefined = quote?.changePct

  if (typeof pct !== 'number' || !isFinite(pct)) {
    const g = await getGeckoPoolQuote(ref.network, ref.pair, token.symbol)
    if (g && typeof g.changePct === 'number' && isFinite(g.changePct)) pct = g.changePct
  }

  if (typeof pct !== 'number' || !isFinite(pct)) return null

  const sign = direction === 'up' ? 1 : -1
  return { pct: pct * sign, network: ref.network, pair: ref.pair }
}

export function countRoomsForDate(map: Record<string, DuelRoom>, dateIso: string): number {
  return Object.values(map).filter(r => r.baseDay === dateIso).length
}

const SYSTEM_USER_ID = 'system'

export async function createRoom(userId: string, entryCost = 2500) {
  const map = await loadDuels()
  const date = todayIsoDate()
  const existing = countRoomsForDate(map, date)
  if (existing >= 25) throw new Error('Daily room cap reached')

  const id = `duel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
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
  const hostUser = getOrCreateUser(users, userId)

  if (hostUser.bankPoints < entryCost) throw new Error('Insufficient points for entry')
  debitBank(hostUser, entryCost, `duel-entry-${id}`, date)

  room.host.entryPaid = true

  map[id] = room
  await saveDuels(map)
  await saveUsers(users)
  return { room, users }
}

export async function joinRoom(roomId: string, userId: string) {
  const map = await loadDuels()
  const room = map[roomId]

  if (!room) throw new Error('Room not found')
  if (room.status !== 'open') throw new Error('Room not open')

  if (room.host.userId === SYSTEM_USER_ID && !room.guest) {
    const users = await loadUsers()
    const firstUser = getOrCreateUser(users, userId)
    if (firstUser.bankPoints < room.entryCost) throw new Error('Insufficient points')

    debitBank(firstUser, room.entryCost, `duel-entry-${room.id}`, room.baseDay)
    room.host = { userId, entryPaid: true, locked: false, picks: [] }

    map[roomId] = room
    await saveUsers(users)
    await saveDuels(map)
    return { room, users }
  }

  if (room.host.userId === userId) throw new Error('Host cannot join own room')

  const users = await loadUsers()
  const guestUser = getOrCreateUser(users, userId)

  if (guestUser.bankPoints < room.entryCost) throw new Error('Insufficient points')

  debitBank(guestUser, room.entryCost, `duel-entry-${room.id}`, room.baseDay)

  room.guest = { userId, entryPaid: true, locked: false, picks: [] }
  room.status = 'ready'

  map[roomId] = room
  await saveUsers(users)
  await saveDuels(map)

  return { room, users }
}

export async function setPicks(roomId: string, userId: string, picks: DuelPickInput[]) {
  if (!Array.isArray(picks) || picks.length !== 5) throw new Error('Must select 5 picks')

  const map = await loadDuels()
  const room = map[roomId]

  if (!room) throw new Error('Room not found')

  const side =
    room.host.userId === userId
      ? room.host
      : room.guest && room.guest.userId === userId
      ? room.guest
      : null

  if (!side) throw new Error('Not a participant')
  if (!side.entryPaid) throw new Error('Entry not paid')

  const lockedMap = new Map<string, DuelPick>()
  for (const pk of side.picks) {
    if (pk.locked) lockedMap.set(pk.tokenId, pk)
  }

  for (const tokenId of lockedMap.keys()) {
    if (!picks.some(p => p.tokenId === tokenId))
      throw new Error('Cannot remove a locked pick')
  }

  const next: DuelPick[] = picks.map(p => {
    const l = lockedMap.get(p.tokenId)
    if (l) return { ...l, direction: p.direction }
    return { tokenId: p.tokenId, direction: p.direction, locked: false }
  })

  side.picks = next
  map[roomId] = room
  await saveDuels(map)

  return room
}

export async function lockPicks(
  roomId: string,
  userId: string,
  picks: DuelPickInput[],
  now: Date = new Date()
) {
  if (!Array.isArray(picks) || picks.length < 1 || picks.length > 5)
    throw new Error('Provide 1 to 5 picks')

  const map = await loadDuels()
  const room = map[roomId]
  if (!room) throw new Error('Room not found')

  const side =
    room.host.userId === userId
      ? room.host
      : room.guest && room.guest.userId === userId
      ? room.guest
      : null

  if (!side) throw new Error('Not a participant')
  if (!side.entryPaid) throw new Error('Entry not paid')
  if (!side.picks || side.picks.length === 0) throw new Error('Set picks first')

  const nowIso = now.toISOString()
  const reqById = new Map(picks.map(p => [p.tokenId, p]))

  const updated: DuelPick[] = []

  for (const pk of side.picks) {
    if (reqById.has(pk.tokenId)) {
      const req = reqById.get(pk.tokenId)!
      const token = TOKEN_MAP[req.tokenId]
      if (!token) throw new Error(`Unknown token ${req.tokenId}`)

      const r = await currentSignedPctFor(token, req.direction)
      if (!r) throw new Error(`Cannot resolve price for token ${req.tokenId}`)

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

  for (const req of reqById.values()) {
    if (!updated.some(u => u.tokenId === req.tokenId))
      throw new Error(`Token ${req.tokenId} not in saved picks`)
  }

  side.picks = updated

  if (side.picks.length === 5 && side.picks.every(p => p.locked)) {
    side.locked = true
    side.lockedAt = nowIso
  }

  if (
    room.host.picks.length === 5 &&
    room.host.picks.every(p => p.locked) &&
    room.guest &&
    room.guest.picks.length === 5 &&
    room.guest.picks.every(p => p.locked)
  ) {
    room.status = 'locked'
  }

  map[roomId] = room
  await saveDuels(map)

  return room
}

export async function settleRoom(roomId: string) {
  const map = await loadDuels()
  const room = map[roomId]

  if (!room) throw new Error('Room not found')
  if (room.status === 'settled') return { room, users: await loadUsers() }

  const now = new Date()
  const evalAt = new Date(room.evalAt)

  if (now.getTime() < evalAt.getTime()) throw new Error('Eval time not reached')

  async function computeScore(side?: DuelSide): Promise<number> {
    if (!side) return 0
    let sum = 0

    for (const pk of side.picks) {
      if (pk.locked && typeof pk.lockedPct === 'number') {
        sum += pk.lockedPct
        continue
      }

      const token = TOKEN_MAP[pk.tokenId]
      if (!token) continue

      const r = await currentSignedPctFor(token, pk.direction)
      if (!r) continue

      sum += r.pct
    }

    return sum
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
  const guestUser = room.guest ? getOrCreateUser(users, room.guest.userId) : undefined

  let payoutPerWinner = 0

  if (winner === 'host' || winner === 'guest') {
    payoutPerWinner = room.entryCost * 2
    const target = winner === 'host' ? hostUser : guestUser!
    creditGamePoints(target, payoutPerWinner, `duel-win-${room.id}`, room.baseDay)
  } else {
    creditBank(hostUser, room.entryCost, `duel-refund-${room.id}`, room.baseDay)
    if (guestUser) {
      creditBank(guestUser, room.entryCost, `duel-refund-${room.id}`, room.baseDay)
    }
  }

  room.status = 'settled'
  room.result = {
    settledAt: now.toISOString(),
    winner,
    hostScore,
    guestScore,
    payoutPerWinner
  }

  map[roomId] = room
  await saveDuels(map)
  await saveUsers(users)

  return { room, users }
}

export async function cancelRoom(roomId: string, userId: string) {
  const map = await loadDuels()
  const room = map[roomId]

  if (!room) throw new Error('Room not found')
  if (room.status !== 'open') throw new Error('Room not open')
  if (room.host.userId !== userId) throw new Error('Only host can cancel')
  if (!room.host.entryPaid) throw new Error('Entry not paid')
  if (room.guest) throw new Error('Cannot cancel after join')

  const users = await loadUsers()
  const hostUser = getOrCreateUser(users, userId)

  creditBank(hostUser, room.entryCost, `duel-cancel-refund-${room.id}`, room.baseDay)

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

export async function seedDailyRooms(count = 25, entryCost = 2500) {
  const map = await loadDuels()
  const date = todayIsoDate()

  const keptRooms: Record<string, DuelRoom> = {}
  const todayRooms: Record<string, DuelRoom> = {}

  for (const [id, room] of Object.entries(map)) {
    if (room.baseDay === date) {
      todayRooms[id] = room
    } else {
      if (room.status === 'settled' || room.status === 'cancelled') {
        keptRooms[id] = room
      }
    }
  }

  const existingToday = Object.keys(todayRooms).length
  const toCreate = Math.max(0, count - existingToday)

  const now = new Date()

  for (let i = 0; i < toCreate; i++) {
    const seq = existingToday + i + 1
    const id = `duel_${date.replace(/-/g, '')}_${seq}`

    const room: DuelRoom = {
      id,
      createdAt: now.toISOString(),
      baseDay: date,
      evalAt: nextMidnightIso(now),
      entryCost,
      status: 'open',
      host: { userId: SYSTEM_USER_ID, entryPaid: false, locked: false, picks: [] },
      seq
    }

    todayRooms[id] = room
  }

  const sorted = Object.values(todayRooms).sort((a, b) => {
    if (a.seq !== undefined && b.seq !== undefined) return a.seq - b.seq
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  const finalTodayRooms: Record<string, DuelRoom> = {}
  sorted.forEach((room, i) => {
    const seq = i + 1
    finalTodayRooms[room.id] = { ...room, seq }
  })

  await saveDuels({ ...finalTodayRooms, ...keptRooms })
}
