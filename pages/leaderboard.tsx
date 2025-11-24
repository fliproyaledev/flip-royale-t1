import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../lib/theme'

// TYPES
type LeaderboardEntry = {
  rank: number
  userId: string
  username: string
  avatar: string
  totalPoints: number
  // Bank ve ActiveCards verilerini sildik (gerekirse API'den gelmeye devam edebilir ama burada kullanmayacağız)
  isCurrentUser?: boolean
}

type HistoryEntry = {
  date: string
  totalPlayers: number
  totalPointsDistributed: number
  topPlayer: {
    username: string
    avatar: string
    points: number
  } | null
  bestToken: {
    symbol: string
  } | null
}

const DEFAULT_AVATAR = '/avatars/default-avatar.png'

export default function LeaderboardPage() {
  const { theme } = useTheme()
  
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current')
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [historyData, setHistoryData] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<LeaderboardEntry | null>(null)
  const [timeframe, setTimeframe] = useState<'all' | 'daily'>('all')
  const [timeUntilReset, setTimeUntilReset] = useState('')
  const [mounted, setMounted] = useState(false)

  // Mount Check & Timer
  useEffect(() => {
    setMounted(true)
    
    function updateTimer(){
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
    const interval = setInterval(updateTimer, 60000)
    return () => clearInterval(interval)
  }, [])

  // --- FETCH CURRENT LEADERBOARD ---
  useEffect(() => {
    if (activeTab !== 'current') return
    
    async function fetchLeaderboard() {
      setLoading(true)
      try {
        const res = await fetch(`/api/leaderboard?timeframe=${timeframe}`)
        const data = await res.json()
        
        if (data.ok && Array.isArray(data.users)) {
             const realData: LeaderboardEntry[] = data.users.map((u: any, i: number) => ({
                rank: i + 1,
                userId: u.id,
                username: u.name,
                avatar: u.avatar || DEFAULT_AVATAR,
                totalPoints: u.totalPoints
            }))

            // Mevcut kullanıcıyı bul
            let myId = ''
            try {
                const saved = localStorage.getItem('flipflop-user')
                if(saved) myId = JSON.parse(saved).id
            } catch {}

            const myEntry = realData.find(u => u.userId === myId)
            if (myEntry) {
                myEntry.isCurrentUser = true
                setCurrentUser(myEntry)
            }

            setLeaderboard(realData)
        }
      } catch (error) {
        console.error('Failed to fetch leaderboard:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchLeaderboard()
  }, [timeframe, activeTab])

  // --- FETCH HISTORY ---
  useEffect(() => {
    if (activeTab !== 'history') return

    async function fetchHistory() {
      setLoading(true)
      try {
        const res = await fetch('/api/leaderboard/history')
        const data = await res.json()
        if (data.ok && Array.isArray(data.history)) {
            setHistoryData(data.history)
        }
      } catch (error) {
        console.error('Failed to fetch history:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [activeTab])

  const topThree = useMemo(() => leaderboard.slice(0, 3), [leaderboard])
  const restOfLeaderboard = useMemo(() => leaderboard.slice(3), [leaderboard])

  // Rank Styles Helper
  const getRankStyle = (rank: number) => {
    if (rank === 1) return { color: theme === 'light' ? '#d97706' : '#fbbf24', emoji: '🥇', className: 'rank-1' }
    if (rank === 2) return { color: theme === 'light' ? '#64748b' : '#e2e8f0', emoji: '🥈', className: 'rank-2' }
    if (rank === 3) return { color: theme === 'light' ? '#b45309' : '#d97706', emoji: '🥉', className: 'rank-3' }
    return { color: 'inherit', emoji: `#${rank}`, className: '' }
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
            <a className="tab" href="/profile">PROFILE</a>
          </nav>

          <div style={{ width: 48 }}></div>
      </header>

      <div className="panel" style={{ maxWidth: 1000, margin: '0 auto' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ marginBottom: 8 }}>Rankings & History</h2>
            <p className="muted">Compete for the top spot or check past winners.</p>
          </div>
          
          <div style={{ display: 'flex', gap: 10 }}>
             <button 
               onClick={() => setActiveTab('current')}
               className={`btn ${activeTab === 'current' ? 'primary' : 'ghost'}`}
             >
               Current Standings
             </button>
             <button 
               onClick={() => setActiveTab('history')}
               className={`btn ${activeTab === 'history' ? 'primary' : 'ghost'}`}
             >
               Past Rounds
             </button>
          </div>
        </div>

        {/* === TAB: CURRENT === */}
        {activeTab === 'current' && (
            <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap:10 }}>
                     <div className="badge" style={{
                        background: theme === 'light' ? 'rgba(0,207,163,0.1)' : 'rgba(0,207,163,0.2)',
                        borderColor: theme === 'light' ? 'rgba(0,207,163,0.2)' : 'rgba(0,207,163,0.3)',
                        color: theme === 'light' ? '#059669' : '#86efac'
                      }}>
                        Weekly reset in: {mounted ? timeUntilReset : '...'}
                      </div>

                    <div style={{ display: 'flex', background: theme === 'light' ? '#f1f5f9' : 'rgba(255,255,255,0.1)', padding: 4, borderRadius: 12 }}>
                        <button onClick={() => setTimeframe('all')} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: timeframe === 'all' ? (theme === 'light' ? 'white' : 'rgba(255,255,255,0.2)') : 'transparent', color: theme === 'light' ? (timeframe === 'all' ? '#0f172a' : '#ffffff') : 'white', fontWeight: 700, cursor: 'pointer', boxShadow: timeframe === 'all' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none' }}>All Time</button>
                        <button onClick={() => setTimeframe('daily')} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: timeframe === 'daily' ? (theme === 'light' ? 'white' : 'rgba(255,255,255,0.2)') : 'transparent', color: theme === 'light' ? (timeframe === 'daily' ? '#0f172a' : '#ffffff') : 'white', fontWeight: 700, cursor: 'pointer', boxShadow: timeframe === 'daily' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none' }}>Today</button>
                    </div>
                </div>

                {/* Podium */}
                {!loading && leaderboard.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 16, marginBottom: 40, flexWrap: 'wrap' }}>
                    {topThree[1] && <PodiumCard entry={topThree[1]} theme={theme} getRankStyle={getRankStyle} style={{ order: 1, transform: 'scale(0.9)' }} />}
                    {topThree[0] && <PodiumCard entry={topThree[0]} theme={theme} getRankStyle={getRankStyle} style={{ order: 2, zIndex: 2 }} isFirst />}
                    {topThree[2] && <PodiumCard entry={topThree[2]} theme={theme} getRankStyle={getRankStyle} style={{ order: 3, transform: 'scale(0.9)' }} />}
                </div>
                )}

                {/* Current User Rank */}
                {currentUser && !loading && (
                <div style={{ background: theme === 'light' ? 'linear-gradient(135deg, #f0f9ff, #e0f2fe)' : 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(37, 99, 235, 0.1))', border: `1px solid ${theme === 'light' ? '#bae6fd' : 'rgba(59, 130, 246, 0.3)'}`, borderRadius: 16, padding: '12px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ fontWeight: 900, fontSize: 18, color: theme === 'light' ? '#0284c7' : '#60a5fa' }}>#{currentUser.rank}</div>
                        <img src={currentUser.avatar} alt="Me" style={{ width: 40, height: 40, borderRadius: '50%' }} onError={(e) => (e.currentTarget.src = DEFAULT_AVATAR)} />
                        <div style={{ fontWeight: 700 }}>You ({currentUser.username})</div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: theme === 'light' ? '#0284c7' : '#60a5fa' }}>{currentUser.totalPoints.toLocaleString()} pts</div>
                </div>
                )}

                {/* Table - BANK VE CARDS SİLİNDİ */}
                <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div className="leaderboard-header">
                    <div>RANK</div>
                    <div>PLAYER</div>
                    <div style={{textAlign: 'right'}}>TOTAL POINTS</div>
                </div>
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center' }} className="muted">Loading rankings...</div>
                ) : (
                    <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                    {restOfLeaderboard.map((entry) => {
                        const rs = getRankStyle(entry.rank)
                        return (
                        <div key={entry.userId} className="leaderboard-row" style={{ background: entry.isCurrentUser ? (theme === 'light' ? '#f0f9ff' : 'rgba(59,130,246,0.1)') : undefined }}>
                            <div style={{ fontWeight: 800, fontSize: 16 }} className={rs.className}>{entry.rank}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <img src={entry.avatar} alt={entry.username} style={{ width: 36, height: 36, borderRadius: '50%' }} onError={(e) => (e.currentTarget.src = DEFAULT_AVATAR)} />
                                <span style={{ fontWeight: entry.isCurrentUser ? 700 : 600 }}>{entry.username}</span>
                            </div>
                            <div style={{ textAlign: 'right', fontWeight: 700 }}>{entry.totalPoints.toLocaleString()}</div>
                        </div>
                        )
                    })}
                    </div>
                )}
                </div>
            </>
        )}

        {/* === TAB: HISTORY === */}
        {activeTab === 'history' && (
             <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {loading && <div style={{ padding: 40, textAlign: 'center' }} className="muted">Loading history...</div>}
                {!loading && historyData.length === 0 && (
                    <div style={{ padding: 40, textAlign: 'center', background: 'var(--card-2)', borderRadius: 12 }} className="muted">
                        No round history available yet. Wait for the next settlement!
                    </div>
                )}
                
                {historyData.map((day) => (
                    <div key={day.date} className="panel" style={{ padding: 0, overflow: 'hidden', marginBottom: 0 }}>
                        <div style={{ padding: '16px 24px', background: theme === 'light' ? '#f8fafc' : 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontWeight: 800, fontSize: 18 }}>{day.date}</div>
                            <div className="badge">{day.totalPlayers} Players</div>
                        </div>
                        <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                            {/* Winner Section */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ fontSize: 32 }}>🏆</div>
                                <div>
                                    <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>TOP PLAYER</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {day.topPlayer?.avatar && <img src={day.topPlayer.avatar} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />}
                                        <div style={{ fontWeight: 700, fontSize: 16 }}>{day.topPlayer?.username || 'None'}</div>
                                    </div>
                                    <div style={{ fontSize: 13, color: 'var(--accent-green)', fontWeight: 600 }}>
                                        +{day.topPlayer?.points.toLocaleString()} pts
                                    </div>
                                </div>
                            </div>

                            {/* Best Token Section */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderLeft: '1px solid var(--border)', paddingLeft: 24 }}>
                                <div style={{ fontSize: 32 }}>🚀</div>
                                <div>
                                    <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>BEST TOKEN</div>
                                    <div style={{ fontWeight: 800, fontSize: 18 }}>{day.bestToken?.symbol || '-'}</div>
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: '12px 24px', background: theme === 'light' ? '#f1f5f9' : 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--border)', fontSize: 12, textAlign: 'right', color: 'var(--muted)' }}>
                            Total Distributed: <b>{day.totalPointsDistributed.toLocaleString()} pts</b>
                        </div>
                    </div>
                ))}
             </div>
        )}

      </div>
    </div>
  )
}

// Sub-component
function PodiumCard({ entry, theme, getRankStyle, style, isFirst }: any) {
    const rs = getRankStyle(entry.rank)
    return (
        <div className="panel" style={{ 
            display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20, 
            flex: isFirst ? '0 0 180px' : '0 0 150px',
            border: isFirst ? `2px solid ${rs.color}` : undefined,
            ...style 
        }}>
            <div style={{ fontSize: isFirst ? 32 : 24, marginBottom: 8 }}>{rs.emoji}</div>
            <div style={{ width: isFirst ? 72 : 56, height: isFirst ? 72 : 56, borderRadius: '50%', overflow: 'hidden', marginBottom: 12, boxShadow: `0 4px 12px ${rs.color}40`, border: `2px solid ${rs.color}` }}>
                <img src={entry.avatar} alt={entry.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => (e.currentTarget.src = DEFAULT_AVATAR)} />
            </div>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, textAlign: 'center' }}>{entry.username}</div>
            <div style={{ fontWeight: 900, fontSize: 18, color: rs.color }}>{entry.totalPoints.toLocaleString()} pts</div>
        </div>
    )
}
