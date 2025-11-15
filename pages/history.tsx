import { useEffect, useState } from 'react'

type DayResult = {
  dayKey: string
  total: number
  items: {
    tokenId: string
    symbol: string
    dir: 'UP' | 'DOWN'
    duplicateIndex: number
    points: number
  }[]
}

const DEFAULT_AVATAR = '/avatars/default-avatar.png'

export default function History() {
  const [history, setHistory] = useState<DayResult[]>([])
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const savedUser = localStorage.getItem('flipflop-user')
    if (savedUser) {
      const parsed = JSON.parse(savedUser)
      if (!parsed.avatar) {
        parsed.avatar = DEFAULT_AVATAR
        try { localStorage.setItem('flipflop-user', JSON.stringify(parsed)) } catch {}
      }
      setUser(parsed)
    }

    const savedHistory = localStorage.getItem('flipflop-history')
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory)
        if (Array.isArray(parsed)) {
          setHistory(parsed)
        }
      } catch {
        setHistory([])
      }
    }
  }, [])

  const hasHistory = history.length > 0

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/logo.png" alt="FLIP ROYALE" className="logo" onError={(e) => {
            const target = e.currentTarget as HTMLImageElement
            target.src = '/logo.svg'
            target.onerror = () => {
              target.style.display = 'none'
              const parent = target.parentElement
              if (parent) parent.innerHTML = '<span class="dot"></span> FLIP ROYALE'
            }
          }} />
        </div>
        <nav className="tabs">
          <a className="tab" href="/">PLAY</a>
          <a className="tab" href="/prices">PRICES</a>
          <a className="tab" href="/arena">ARENA</a>
          <a className="tab" href="/guide">GUIDE</a>
          <a className="tab" href="/inventory">INVENTORY</a>
          <a className="tab" href="/leaderboard">LEADERBOARD</a>
          <a className="tab active" href="/history">HISTORY</a>
          {user && <a className="tab" href="/profile">PROFILE</a>}
        </nav>
        <div className="muted">All Rounds</div>
      </header>

      <div className="panel">
        <div className="row">
          <h2>Round History</h2>
          {hasHistory && (
            <span className="muted">{history.length} rounds</span>
          )}
        </div>
        <div className="sep"></div>

        {hasHistory ? (
          <div style={{display:'flex', flexDirection:'column', gap:16}}>
            {history.slice().reverse().map((day, index) => {
              const totalPositive = day.total >= 0
              return (
                <div key={`${day.dayKey}-${index}`} style={{
                  background:'rgba(255,255,255,0.05)',
                  borderRadius:12,
                  border:'1px solid rgba(255,255,255,0.1)',
                  padding:20
                }}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
                    <div style={{display:'flex', alignItems:'center', gap:12}}>
                      <div style={{fontWeight:900, fontSize:16}}>{day.dayKey}</div>
                      <span className="badge" style={{
                        background: totalPositive ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.2)',
                        borderColor: totalPositive ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)',
                        color: totalPositive ? '#86efac' : '#fca5a5'
                      }}>
                        {totalPositive ? '+' : ''}{day.total} pts
                      </span>
                    </div>
                    <div style={{fontSize:12, color:'var(--muted-inv)'}}>
                      {day.items.length} picks
                    </div>
                  </div>

                  <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
                    {day.items.map((item, idx) => {
                      const itemPositive = item.points >= 0
                      return (
                        <div key={idx} style={{
                          display:'flex',
                          alignItems:'center',
                          gap:6,
                          padding:'6px 10px',
                          borderRadius:6,
                          background: itemPositive ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)',
                          border:'1px solid',
                          borderColor: itemPositive ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.2)',
                          fontSize:12
                        }}>
                          <span style={{fontWeight:700, color:itemPositive ? '#86efac' : '#fca5a5'}}>
                            {item.symbol}
                          </span>
                          <span style={{color:itemPositive ? '#16a34a' : '#dc2626', fontWeight:600}}>
                            {itemPositive ? '+' : ''}{item.points}
                          </span>
                          <span style={{
                            fontSize:10,
                            padding:'1px 4px',
                            borderRadius:3,
                            background:'rgba(0,0,0,.2)',
                            color:'var(--muted-inv)'
                          }}>
                            dup x{item.duplicateIndex}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{textAlign:'center', padding:40, color:'var(--muted-inv)'}}>
            No rounds recorded yet. Play a round to start building history!
          </div>
        )}
      </div>
    </div>
  )
}


