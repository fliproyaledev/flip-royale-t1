let started = false

function msUntilNextUtcMidnight(): number {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0))
  return next.getTime() - now.getTime()
}

export function ensureDailyCron(start: () => void) {
  if (started) return
  started = true
  const wait = msUntilNextUtcMidnight()
  setTimeout(() => {
    start()
    setInterval(start, 24 * 60 * 60 * 1000)
  }, wait)
}


