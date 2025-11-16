import { useEffect, useState } from 'react'
import { TOKENS, getTokenById } from '../lib/tokens'
import ThemeToggle from '../components/ThemeToggle'

type DayResult = {
  dayKey: string
  total: number
  userId?: string // User who participated
  userName?: string // User name
  walletAddress?: string // Wallet address
  items: {
    tokenId: string
    symbol: string
    dir: 'UP' | 'DOWN'
    duplicateIndex: number
    points: number
  }[]
}

type ArenaResult = {
  roomId: string
  roomSeq?: number
  baseDay: string
  settledAt: string
  entryCost: number
  myScore: number
  opponentScore: number
  winner: 'host' | 'guest' | 'draw'
  payoutPerWinner: number
  myPicks: Array<{ tokenId: string; direction: 'up' | 'down'; locked: boolean; lockedPct?: number }>
  opponentPicks: Array<{ tokenId: string; direction: 'up' | 'down'; locked: boolean; lockedPct?: number }>
  isHost: boolean
  opponentUserId: string | null
}

const DEFAULT_AVATAR = '/avatars/default-avatar.png'

function handleImageFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const target = e.currentTarget
  if (target.dataset.fallbackApplied === '1') return
  target.dataset.fallbackApplied = '1'
  target.onerror = null
  target.src = '/token-logos/placeholder.png'
}

export default function History() {
  const [history, setHistory] = useState<DayResult[]>([])
  const [arenaHistory, setArenaHistory] = useState<ArenaResult[]>([])
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  async function loadArenaHistory(userId: string) {
    try {
      const r = await fetch(`/api/duel/my-history?userId=${encodeURIComponent(userId)}`)
      const j = await r.json()
      if (j?.ok && Array.isArray(j.rooms)) {
        setArenaHistory(j.rooms)
      }
    } catch (err) {
      console.error('Failed to load arena history:', err)
    }
  }

  useEffect(() => {
    const savedUser = localStorage.getItem('flipflop-user')
    if (savedUser) {
      const parsed = JSON.parse(savedUser)
      if (!parsed.avatar) {
        parsed.avatar = DEFAULT_AVATAR
        try { localStorage.setItem('flipflop-user', JSON.stringify(parsed)) } catch {}
      }
      setUser(parsed)
      
      // Load arena history
      if (parsed.id) {
        loadArenaHistory(parsed.id)
      }
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
    setLoading(false)
  }, [])

  const hasHistory = history.length > 0
  const hasArenaHistory = arenaHistory.length > 0

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
        <div style={{display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto'}}>
          <ThemeToggle />
          <a 
            href="https://x.com/fliproyale" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'white',
              textDecoration: 'none',
              transition: 'all 0.3s',
              cursor: 'pointer',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
              e.currentTarget.style.transform = 'scale(1.05)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
            }}
            title="Follow us on X"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{display: 'block'}}>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
        </div>
      </header>

      {/* Arena History */}
      {hasArenaHistory && (
        <div className="panel" style={{marginBottom: 24}}>
          <div className="row">
            <h2>Arena Royale History</h2>
            <span className="muted">{arenaHistory.length} duels</span>
          </div>
          <div className="sep"></div>

          <div style={{display:'flex', flexDirection:'column', gap:16}}>
            {arenaHistory.map((arena, index) => {
              const isWinner = (arena.isHost && arena.winner === 'host') || (!arena.isHost && arena.winner === 'guest')
              const isDraw = arena.winner === 'draw'
              const netPoints = isWinner ? arena.payoutPerWinner - arena.entryCost : (isDraw ? 0 : -arena.entryCost)
              const netPositive = netPoints >= 0
              
              return (
                <div key={`arena-${arena.roomId}-${index}`} style={{
                  background:'rgba(255,255,255,0.05)',
                  borderRadius:12,
                  border:'1px solid rgba(255,255,255,0.1)',
                  padding:20
                }}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
                    <div style={{display:'flex', alignItems:'center', gap:12}}>
                      <div style={{fontWeight:900, fontSize:16}}>
                        Arena Room {arena.roomSeq || '?'} · {arena.baseDay}
                      </div>
                      <span className="badge" style={{
                        background: isWinner ? 'rgba(16,185,129,.2)' : isDraw ? 'rgba(156,163,175,.2)' : 'rgba(239,68,68,.2)',
                        borderColor: isWinner ? 'rgba(16,185,129,.3)' : isDraw ? 'rgba(156,163,175,.3)' : 'rgba(239,68,68,.3)',
                        color: isWinner ? '#86efac' : isDraw ? '#d1d5db' : '#fca5a5'
                      }}>
                        {isWinner ? 'Won' : isDraw ? 'Draw' : 'Lost'}
                      </span>
                      <span className="badge" style={{
                        background: netPositive ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.2)',
                        borderColor: netPositive ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)',
                        color: netPositive ? '#86efac' : '#fca5a5'
                      }}>
                        {netPositive ? '+' : ''}{netPoints} pts
                      </span>
                    </div>
                    <div style={{fontSize:12, color:'var(--muted-inv)'}}>
                      {new Date(arena.settledAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:16, alignItems:'center', marginBottom:12}}>
                    {/* My Score */}
                    <div>
                      <div style={{fontSize:12, color:'var(--muted-inv)', marginBottom:4}}>Your Score</div>
                      <div style={{fontSize:20, fontWeight:900, color:'white'}}>{arena.myScore.toFixed(2)}</div>
                      <div style={{display:'flex', flexWrap:'wrap', gap:4, marginTop:8}}>
                        {arena.myPicks.slice(0, 5).map((pick, idx) => {
                          const tok = getTokenById(pick.tokenId) || TOKENS[0]
                          return (
                            <div key={idx} style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              overflow: 'hidden',
                              border: '2px solid rgba(255,255,255,0.2)',
                              background: 'rgba(255,255,255,0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <img
                                src={tok.logo}
                                alt={tok.symbol}
                                style={{width: '100%', height: '100%', objectFit: 'cover'}}
                                onError={handleImageFallback}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* VS */}
                    <div style={{fontSize:14, fontWeight:700, color:'var(--muted-inv)'}}>VS</div>

                    {/* Opponent Score */}
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:12, color:'var(--muted-inv)', marginBottom:4}}>Opponent Score</div>
                      <div style={{fontSize:20, fontWeight:900, color:'white'}}>{arena.opponentScore.toFixed(2)}</div>
                      <div style={{display:'flex', flexWrap:'wrap', gap:4, marginTop:8, justifyContent:'flex-end'}}>
                        {arena.opponentPicks.slice(0, 5).map((pick, idx) => {
                          const tok = getTokenById(pick.tokenId) || TOKENS[0]
                          return (
                            <div key={idx} style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              overflow: 'hidden',
                              border: '2px solid rgba(255,255,255,0.2)',
                              background: 'rgba(255,255,255,0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <img
                                src={tok.logo}
                                alt={tok.symbol}
                                style={{width: '100%', height: '100%', objectFit: 'cover'}}
                                onError={handleImageFallback}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {isWinner && (
                    <div style={{
                      fontSize:12,
                      color:'#86efac',
                      textAlign:'center',
                      padding:'8px',
                      background:'rgba(16,185,129,.1)',
                      borderRadius:6
                    }}>
                      Won {arena.payoutPerWinner} points (Entry: {arena.entryCost} pts)
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Play Mode History */}
      <div className="panel">
        <div className="row">
          <h2>Flip Royale History</h2>
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
            {!hasArenaHistory ? (
              <>No rounds recorded yet. Play a round to start building history!</>
            ) : (
              <>No Flip Royale rounds recorded yet.</>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


