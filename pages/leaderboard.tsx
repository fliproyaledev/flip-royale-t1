import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../lib/theme'

// TYPES
type LeaderboardEntry = {
  rank: number
  userId: string
  username: string
  avatar: string
  totalPoints: number
  bankPoints: number
  activeCards: number
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
  
  // TABS: 'current' | 'history'
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current')
  
  // DATA STATES
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [historyData, setHistoryData] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<LeaderboardEntry | null>(null)
  const [timeframe, setTimeframe] = useState<'all' | 'daily'>('all')

  // --- FETCH CURRENT LEADERBOARD ---
  useEffect(() => {
    if (activeTab !== 'current') return
    
    async function fetchLeaderboard() {
      setLoading(true)
      try {
        // MOCK DATA (Test için - Gerçek API'niz varsa açın)
        // const res = await fetch(`/api/leaderboard?timeframe=${timeframe}`)
        // ...
        
        const mockData: LeaderboardEntry[] = Array.from({ length: 50 }, (_, i) => ({
          rank: i + 1,
          userId: `user-${i}`,
          username: `Player ${i + 1}`,
          avatar: `/avatars/avatar-${(i % 8) + 1}.png`,
          totalPoints: Math.round(100000 - i * 1500 + Math.random() * 500),
          bankPoints: Math.round(50000 - i * 500),
          activeCards: Math.floor(Math.random() * 5)
        }))
        
        // Current User
        let myId = ''
        try {
            const saved = localStorage.getItem('flipflop-user')
            if(saved) myId = JSON.parse(saved).id
        } catch {}

        const myEntry = mockData.find(u => u.userId === myId)
        if (myEntry) {
            myEntry.isCurrentUser = true
            setCurrentUser(myEntry)
        }

        setLeaderboard(mockData)
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
    if (rank === 2) return { color: theme === 'light' ? '#94a3b8' : '#e2e8f0', emoji: '🥈', className: 'rank-2' }
    if (rank === 3) return { color: theme === 'light' ? '#b45309' : '#d97706', emoji: '🥉', className: 'rank-3' }
    return { color: 'inherit', emoji: `#${rank}`, className: '' }
  }

  return (
    <div className="app">
      <header className="topbar">
          <div className="brand">
            <span style={{fontWeight: 900, fontSize: 24}}>LEADERBOARD</span>
          </div>
          <a href="/" className="btn ghost">← Back to Arena</a>
      </header>

      <div className="panel" style={{ maxWidth: 1000, margin: '0 auto' }}>
        
        {/* HEADER & TABS */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ marginBottom: 8 }}>Rankings & History</h2>
            <p className="muted">Compete for the top spot or check past winners.</p>
          </div>
          
          {/* MAIN TABS: Current vs History */}
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
                {/* Timeframe Filter */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
                    <div style={{ display: 'flex', background: theme === 'light' ? '#f1f5f9' : 'rgba(255,255,255,0.1)', padding: 4, borderRadius: 12 }}>
                        <button onClick={() => setTimeframe('all')} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: timeframe === 'all' ? (theme === 'light' ? 'white' : 'rgba(255,255,255,0.2)') : 'transparent', color: theme === 'light' ? (timeframe === 'all' ? '#0f172a' : '#64748b') : 'white', fontWeight: 700, cursor: 'pointer', boxShadow: timeframe === 'all' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none' }}>All Time</button>
                        <button onClick={() => setTimeframe('daily')} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: timeframe === 'daily' ? (theme === 'light' ? 'white' : 'rgba(255,255,255,0.2)') : 'transparent', color: theme === 'light' ? (timeframe === 'daily' ? '#0f172a' : '#64748b') : 'white', fontWeight: 700, cursor: 'pointer', boxShadow: timeframe === 'daily' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none' }}>Today</button>
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

                {/* Table */}
                <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div className="leaderboard-header">
                    <div>RANK</div><div>PLAYER</div><div style={{textAlign: 'right'}}>POINTS</div><div style={{textAlign: 'right'}}>BANK</div><div style={{textAlign: 'center'}}>CARDS</div>
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
                            <div style={{ textAlign: 'right', fontSize: 13 }} className="muted">{entry.bankPoints.toLocaleString()}</div>
                            <div style={{ textAlign: 'center' }}><span className="badge">{entry.activeCards}</span></div>
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
                                        {day.topPlayer?.avatar && <img src={day.topPlayer.avatar} style={{ width: 28, height: 28, borderRadius: '50%' }} />}
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
