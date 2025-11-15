import { useEffect, useMemo, useState } from 'react'
import ThemeToggle from '../components/ThemeToggle'

const DEFAULT_AVATAR = '/avatars/default-avatar.png'

type LeaderboardEntry = {
  rank: number
  id: string
  name: string
  totalPoints: number
  roundsPlayed: number
  bestRound: number
  isCurrentUser: boolean
  avatar?: string
}

export default function Leaderboard(){
  const [timeUntilReset, setTimeUntilReset] = useState('')
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setMounted(true)
    
    // Check if user is logged in
    const savedUser = localStorage.getItem('flipflop-user')
    if (savedUser) {
      const parsed = JSON.parse(savedUser)
      if (!parsed.avatar) {
        parsed.avatar = DEFAULT_AVATAR
        try { localStorage.setItem('flipflop-user', JSON.stringify(parsed)) } catch {}
      }
      setUser(parsed)
    }

    // Load leaderboard data from API
    loadLeaderboard()
  }, [])

  async function loadLeaderboard() {
    try {
      setLoading(true)
      const r = await fetch('/api/leaderboard')
      const j = await r.json()
      if (j?.ok && Array.isArray(j.users)) {
        const entries: LeaderboardEntry[] = j.users.map((u: any, idx: number) => ({
          rank: idx + 1,
          id: u.id,
          name: u.name || u.id,
          totalPoints: u.totalPoints || 0,
          roundsPlayed: u.roundsPlayed || 0,
          bestRound: u.bestRound || 0,
          isCurrentUser: user && u.id === user.id,
          avatar: u.avatar || DEFAULT_AVATAR
        }))
        setLeaderboardData(entries)
      }
    } catch (err) {
      console.error('Failed to load leaderboard:', err)
    } finally {
      setLoading(false)
    }
  }

  // Reload when user changes
  useEffect(() => {
    if (mounted && user) {
      loadLeaderboard()
    }
  }, [user, mounted])

  const leaderboard = useMemo(() => {
    return leaderboardData.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
      isCurrentUser: user && entry.id === user.id
    }))
  }, [leaderboardData, user])

  useEffect(()=>{
    function updateTimer(){
      // Calculate time until next Monday 00:00 UTC
      const now = new Date()
      const daysUntilMonday = (8 - now.getUTCDay()) % 7
      const nextMonday = new Date(now)
      nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday)
      nextMonday.setUTCHours(0, 0, 0, 0)
      
      const diff = nextMonday.getTime() - now.getTime()
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      
      setTimeUntilReset(`${days}d ${hours}h ${minutes}m`)
    }
    
    updateTimer()
    const interval = setInterval(updateTimer, 60000) // Update every minute
    return () => clearInterval(interval)
  },[])

  function getRankIcon(rank: number): string {
    switch(rank) {
      case 1: return '🥇'
      case 2: return '🥈'
      case 3: return '🥉'
      default: return `#${rank}`
    }
  }

  function getRowStyle(entry: LeaderboardEntry) {
    const baseStyle = {
      padding: '16px 20px',
      borderBottom: '1px solid rgba(255,255,255,.08)',
      display: 'grid',
      gridTemplateColumns: '80px 1fr 120px 120px 120px 80px',
      alignItems: 'center',
      gap: 16,
      transition: 'background-color 0.2s'
    }

    if (entry.rank <= 3) {
      return {
        ...baseStyle,
        background: entry.rank === 1 ? 'linear-gradient(90deg, rgba(255,215,0,.1), rgba(255,215,0,.05))' :
                   entry.rank === 2 ? 'linear-gradient(90deg, rgba(192,192,192,.1), rgba(192,192,192,.05))' :
                   'linear-gradient(90deg, rgba(205,127,50,.1), rgba(205,127,50,.05))',
        borderLeft: `4px solid ${
          entry.rank === 1 ? '#ffd700' : 
          entry.rank === 2 ? '#c0c0c0' : 
          '#cd7f32'
        }`
      }
    }

    if (entry.isCurrentUser) {
      return {
        ...baseStyle,
        background: 'rgba(0,207,163,.1)',
        borderLeft: '4px solid #00cfa3'
      }
    }

    return baseStyle
  }

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
          <a className="tab active" href="/leaderboard">LEADERBOARD</a>
          <a className="tab" href="/history">HISTORY</a>
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

      <div className="panel">
        <div className="row">
          <h2>Weekly Leaderboard</h2>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span className="badge" style={{
              background:'rgba(0,207,163,.2)',
              borderColor:'rgba(0,207,163,.3)',
              color:'#86efac',
              fontSize:12
            }}>
              Weekly reset in: {mounted ? timeUntilReset : '...'}
            </span>
          </div>
        </div>
        <div className="sep"></div>
        
        <div style={{
          overflowX: 'auto',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'rgba(0,0,0,.1)'
        }}>
          {/* Table Header */}
          <div className="leaderboard-header" style={{
            padding: '16px 20px',
            background: 'rgba(0,0,0,.2)',
            borderBottom: '1px solid var(--border)',
            display: 'grid',
            gridTemplateColumns: '80px 1fr 120px 120px 120px 80px',
            alignItems: 'center',
            gap: 16,
            fontWeight: 700,
            fontSize: 14,
            color: 'var(--muted-inv)'
          }}>
            <div>Rank</div>
            <div>Player</div>
            <div>Total Points</div>
            <div>Rounds</div>
            <div>Best Round</div>
            <div></div>
          </div>
          
          {/* Table Rows */}
          {loading ? (
            <div style={{padding: 40, textAlign: 'center', color: 'var(--muted-inv)'}}>
              Loading leaderboard...
            </div>
          ) : leaderboard.length === 0 ? (
            <div style={{padding: 40, textAlign: 'center', color: 'var(--muted-inv)'}}>
              No players yet. Be the first to earn points!
            </div>
          ) : (
          leaderboard.map((entry) => (
            <div key={entry.id} className="leaderboard-row" style={getRowStyle(entry)}>
              <div style={{
                fontSize: entry.rank <= 3 ? 20 : 16,
                fontWeight: 900,
                color: entry.rank <= 3 ? '#ffd700' : 'var(--text-inv)',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                {getRankIcon(entry.rank)}
              </div>
              
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 600
              }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: '2px solid rgba(255,255,255,0.15)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)'
                }}>
                  <img
                    src={entry.avatar || DEFAULT_AVATAR}
                    alt={`${entry.name} avatar`}
                    style={{width:'100%', height:'100%', objectFit:'cover'}}
                    onError={(e)=>{ (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR }}
                  />
                </div>
                <span style={{color: 'var(--text-inv)'}}>{entry.name}</span>
                {entry.isCurrentUser && (
                  <span className="badge" style={{
                    background: 'rgba(0,207,163,.2)',
                    borderColor: 'rgba(0,207,163,.3)',
                    color: '#86efac',
                    fontSize: 10,
                    padding: '2px 6px'
                  }}>
                    you
                  </span>
                )}
              </div>
              
              <div style={{
                fontWeight: 700,
                color: entry.totalPoints >= 0 ? '#86efac' : '#fca5a5'
              }}>
                {entry.totalPoints >= 0 ? '+' : ''}{entry.totalPoints.toLocaleString()}
              </div>
              
              <div style={{color: 'var(--muted-inv)', fontSize: 14}}>
                {entry.roundsPlayed}
              </div>
              
              <div style={{
                fontWeight: 600,
                color: entry.bestRound >= 0 ? '#86efac' : '#fca5a5',
                fontSize: 14
              }}>
                {entry.bestRound >= 0 ? '+' : ''}{entry.bestRound}
              </div>
              
              <div style={{textAlign: 'right'}}>
                {entry.rank <= 3 && (
                  <span style={{
                    fontSize: 12,
                    color: entry.rank === 1 ? '#ffd700' : 
                           entry.rank === 2 ? '#c0c0c0' : '#cd7f32',
                    fontWeight: 700
                  }}>
                    {entry.rank === 1 ? 'GOLD' : 
                     entry.rank === 2 ? 'SILVER' : 'BRONZE'}
                  </span>
                )}
              </div>
            </div>
          )))}
        </div>
        
        <div style={{
          marginTop: 20,
          padding: '16px',
          background: 'rgba(0,0,0,.1)',
          borderRadius: 8,
          border: '1px solid var(--border)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 8
          }}>
            <div style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#00cfa3'
            }}></div>
            <span style={{fontSize: 14, color: 'var(--muted-inv)'}}>
              Your current position: #{leaderboard.find(e => e.isCurrentUser)?.rank ?? '—'}
            </span>
          </div>
          <div style={{fontSize: 12, color: 'var(--muted-inv)'}}>
            Leaderboard resets every Monday at 00:00 UTC. Keep playing to climb the ranks!
          </div>
        </div>
      </div>
    </div>
  )
}
