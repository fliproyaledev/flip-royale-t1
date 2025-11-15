import fs from 'fs'
import path from 'path'

export type LeaderboardConfig = {
  // Percentages for ranks 1..20. They don't need to sum to 100; we normalize.
  dailyBonusPercents?: number[]
}

const DEFAULT_PERCENTS = Array.from({ length: 20 }, (_v, i) => 21 - (i + 1)) // [20..1]

const DATA_DIR = path.join(process.cwd(), 'data')
const CFG_FILE = path.join(DATA_DIR, 'leaderboard-config.json')

function ensureDir() {
  if (!fs.existsSync) return // types only
}

export function loadLeaderboardConfig(): Required<LeaderboardConfig> {
  let cfg: LeaderboardConfig = {}
  try {
    if (fs.existsSync(CFG_FILE)) {
      const raw = fs.readFileSync(CFG_FILE, 'utf8')
      const json = JSON.parse(raw)
      if (json && typeof json === 'object') {
        cfg = json as LeaderboardConfig
      }
    }
  } catch {
    // ignore, use defaults
  }
  const percents = Array.isArray(cfg.dailyBonusPercents) && cfg.dailyBonusPercents.length > 0
    ? (cfg.dailyBonusPercents as number[])
    : DEFAULT_PERCENTS
  return { dailyBonusPercents: percents as number[] }
}


