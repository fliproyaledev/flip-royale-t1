import fs from 'fs'
import path from 'path'
import { loadRoundsKV, saveRoundsKV } from './kv'

export type RoundPriceItem = {
  tokenId: string
  p0: number
  pClose: number
  ts: string
  source?: string
  network?: string
  pair?: string
}

export type RoundSnapshot = {
  id: string
  items: RoundPriceItem[]
}

const DATA_DIR = path.join(process.cwd(), 'data')
const ROUNDS_FILE = path.join(DATA_DIR, 'rounds.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

export async function loadRounds(): Promise<RoundSnapshot[]> {
  try {
    const kvData = await loadRoundsKV()
    if (kvData.length > 0) {
      return kvData as RoundSnapshot[]
    }
  } catch (err) {
    console.warn('KV load failed, trying JSON fallback:', err)
  }

  try {
    ensureDir()
    if (!fs.existsSync(ROUNDS_FILE)) return []
    const raw = fs.readFileSync(ROUNDS_FILE, 'utf8')
    const json = JSON.parse(raw)
    if (Array.isArray(json)) {
      try {
        await saveRoundsKV(json)
      } catch {}
      return json as RoundSnapshot[]
    }
    return []
  } catch {
    return []
  }
}

export async function saveRounds(rounds: RoundSnapshot[]): Promise<void> {
  try {
    await saveRoundsKV(rounds)
  } catch (err) {
    console.warn('KV save failed, trying JSON fallback:', err)
  }

  try {
    ensureDir()
    fs.writeFileSync(ROUNDS_FILE, JSON.stringify(rounds, null, 2), 'utf8')
  } catch (err) {
    console.warn('JSON save failed:', err)
  }
}

export async function addRoundSnapshot(snapshot: RoundSnapshot): Promise<void> {
  const rounds = await loadRounds()
  rounds.push(snapshot)
  await saveRounds(rounds)
}

export async function getLatestRound(): Promise<RoundSnapshot | null> {
  const rounds = await loadRounds()
  if (!rounds.length) return null
  return rounds[rounds.length - 1]
}


