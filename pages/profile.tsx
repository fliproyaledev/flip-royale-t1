import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

const DEFAULT_AVATAR = '/avatars/default-avatar.png'

type User = {
  id: string
  username: string
  walletAddress?: string
  createdAt: string | number
  lastLogin: string | number
  avatar?: string
}

type RoundHistory = {
  dayKey: string
  picks: Array<{
    symbol: string
    direction: 'UP' | 'DOWN'
    points: number
    duplicateIndex: number
  }>
  totalPoints: number
  boostLevel: number
  boostActive: boolean
}

export default function Profile(){
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [history, setHistory] = useState<RoundHistory[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    // Check if user is logged in
    const savedUser = localStorage.getItem('flipflop-user')
    if (savedUser) {
      const parsed = JSON.parse(savedUser)
      if (!parsed.avatar) {
        parsed.avatar = DEFAULT_AVATAR
      }
      parsed.lastLogin = Date.now()
      try { localStorage.setItem('flipflop-user', JSON.stringify(parsed)) } catch {}
      setUser(parsed)
    } else {
      // Redirect to auth if not logged in
      window.location.href = '/auth'
      return
    }

    // Load history
    const savedHistory = localStorage.getItem('flipflop-history')
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory)
        if (Array.isArray(parsed)) {
          const normalized: RoundHistory[] = parsed.map((round: any) => {
            const items = Array.isArray(round?.items) ? round.items : Array.isArray(round?.picks) ? round.picks : []
            return {
              dayKey: String(round?.dayKey || round?.date || new Date().toISOString()),
              picks: items.map((item: any) => ({
                symbol: String(item?.symbol || item?.tokenId || '').toUpperCase(),
                direction: item?.direction === 'DOWN' || item?.dir === 'DOWN' ? 'DOWN' : 'UP',
                points: Number(item?.points || 0),
                duplicateIndex: Number.isFinite(item?.duplicateIndex) ? Number(item.duplicateIndex) : 1
              })),
              totalPoints: Number(round?.totalPoints ?? round?.total ?? 0),
              boostLevel: Number(round?.boostLevel || 0),
              boostActive: Boolean(round?.boostActive)
            }
          })
          setHistory(normalized)
        }
      } catch {
        setHistory([])
      }
    }
  }, [])

  if (!mounted || !user) {
    return <div>Loading...</div>
  }

  const totalPoints = history.reduce((sum, round) => sum + (round.totalPoints || 0), 0)
  const totalRounds = history.length
  const averagePoints = totalRounds > 0 ? Math.round(totalPoints / totalRounds) : 0

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
          <a className="tab" href="/history">HISTORY</a>
          <a className="tab active" href="/profile">PROFILE</a>
        </nav>
        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.25)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
              background: 'rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <img
                src={user.avatar || DEFAULT_AVATAR}
                alt={user.username}
                style={{width: '100%', height: '100%', objectFit: 'cover'}}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR
                }}
              />
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('flipflop-user')
                window.location.href = '/auth'
              }}
              style={{
                background: 'rgba(239,68,68,0.2)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#fca5a5',
                padding: '8px 16px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.2)'
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="panel">
        <h2>Profile</h2>
        
        {/* User Info */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 20,
          marginBottom: 30
        }}>
          {/* Basic Info */}
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            padding: 24,
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <h3 style={{marginBottom: 16, fontSize: 18, fontWeight: 700}}>Account Information</h3>
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
              <div style={{display:'flex', alignItems:'center', gap:16}}>
                <div style={{width:72, height:72, borderRadius:'50%', overflow:'hidden', border:'3px solid rgba(255,255,255,0.25)', boxShadow:'0 6px 16px rgba(0,0,0,0.35)'}}>
                  <img
                    src={user.avatar || DEFAULT_AVATAR}
                    alt="Avatar"
                    style={{width:'100%', height:'100%', objectFit:'cover'}}
                    onError={(e)=>{ (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR }}
                  />
                </div>
                <div>
                  <label
                    htmlFor="avatar-upload"
                    className="btn primary"
                    style={{display:'inline-block', cursor:'pointer', fontSize:13, padding:'8px 16px'}}
                  >
                    Change Photo
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    style={{display:'none'}}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = () => {
                        const avatarUrl = reader.result as string
                        const updatedUser = { ...user, avatar: avatarUrl, lastLogin: user.lastLogin }
                        setUser(updatedUser)
                        try { localStorage.setItem('flipflop-user', JSON.stringify(updatedUser)) } catch {}
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                </div>
              </div>
              <div>
                <div style={{fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 4}}>Username</div>
                <div style={{fontSize: 16, fontWeight: 600, color: 'white'}}>{user.username}</div>
              </div>
              <div>
                <div style={{fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 4}}>Member Since</div>
                <div style={{fontSize: 16, fontWeight: 600, color: 'white'}}>
                  {isFinite(Number(user.createdAt)) ? new Date(Number(user.createdAt)).toLocaleDateString() : '-'}
                </div>
              </div>
              <div>
                <div style={{fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 4}}>Last Login</div>
                <div style={{fontSize: 16, fontWeight: 600, color: 'white'}}>
                  {isFinite(Number(user.lastLogin)) ? new Date(Number(user.lastLogin)).toLocaleDateString() : '-'}
                </div>
              </div>
              {user.walletAddress && (
                <div>
                  <div style={{fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 4}}>Wallet Address</div>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'white',
                    fontFamily: 'monospace',
                    background: 'rgba(0,0,0,0.2)',
                    padding: '8px 12px',
                    borderRadius: 8,
                    wordBreak: 'break-all'
                  }}>
                    {user.walletAddress}
                  </div>
                </div>
              )}
            </div>
          </div>

                     {/* Stats */}
           <div style={{
             background: 'rgba(255,255,255,0.05)',
             padding: 24,
             borderRadius: 16,
             border: '1px solid rgba(255,255,255,0.1)'
           }}>
             <h3 style={{marginBottom: 16, fontSize: 18, fontWeight: 700}}>Game Statistics</h3>
             <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
               <div style={{
                 display: 'flex',
                 justifyContent: 'space-between',
                 alignItems: 'center',
                 padding: '12px 16px',
                 background: 'rgba(255,255,255,0.05)',
                 borderRadius: 12
               }}>
                 <div style={{fontSize: 14, color: 'rgba(255,255,255,0.7)'}}>Total Points</div>
                 <div style={{
                   fontSize: 20,
                   fontWeight: 700,
                   color: totalPoints >= 0 ? '#86efac' : '#fca5a5'
                 }}>
                   {totalPoints.toLocaleString()}
                 </div>
               </div>
               <div style={{
                 display: 'flex',
                 justifyContent: 'space-between',
                 alignItems: 'center',
                 padding: '12px 16px',
                 background: 'rgba(255,255,255,0.05)',
                 borderRadius: 12
               }}>
                 <div style={{fontSize: 14, color: 'rgba(255,255,255,0.7)'}}>Rounds Played</div>
                 <div style={{fontSize: 20, fontWeight: 700, color: 'white'}}>
                   {totalRounds}
                 </div>
               </div>
               <div style={{
                 display: 'flex',
                 justifyContent: 'space-between',
                 alignItems: 'center',
                 padding: '12px 16px',
                 background: 'rgba(255,255,255,0.05)',
                 borderRadius: 12
               }}>
                 <div style={{fontSize: 14, color: 'rgba(255,255,255,0.7)'}}>Average Points</div>
                 <div style={{
                   fontSize: 20,
                   fontWeight: 700,
                   color: averagePoints >= 0 ? '#86efac' : '#fca5a5'
                 }}>
                   {averagePoints.toLocaleString()}
                 </div>
               </div>
               <div style={{
                 display: 'flex',
                 justifyContent: 'space-between',
                 alignItems: 'center',
                 padding: '12px 16px',
                 background: 'rgba(255,255,255,0.05)',
                 borderRadius: 12
               }}>
                 <div style={{fontSize: 14, color: 'rgba(255,255,255,0.7)'}}>Packs Opened</div>
                 <div style={{fontSize: 20, fontWeight: 700, color: 'white'}}>
                   {Math.floor(totalRounds * 1.2)}
                 </div>
               </div>
               <div style={{
                 display: 'flex',
                 justifyContent: 'space-between',
                 alignItems: 'center',
                 padding: '12px 16px',
                 background: 'rgba(255,255,255,0.05)',
                 borderRadius: 12
               }}>
                 <div style={{fontSize: 14, color: 'rgba(255,255,255,0.7)'}}>Cards Collected</div>
                 <div style={{fontSize: 20, fontWeight: 700, color: 'white'}}>
                   {Math.floor(totalRounds * 2.5)} / 30
                 </div>
               </div>
             </div>
           </div>
        </div>

        {/* Round History */}
        <div>
          <h3 style={{marginBottom: 20, fontSize: 18, fontWeight: 700}}>Round History</h3>
          {history.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: 40,
              color: 'rgba(255,255,255,0.7)',
              fontSize: 16
            }}>
              No rounds played yet. Start playing to see your history!
            </div>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
              {history.slice().reverse().map((round, index) => {
                const roundTotal = round.totalPoints || 0
                const picks = Array.isArray(round.picks) ? round.picks : []
                const roundNumber = history.length - index
                return (
                <div key={round.dayKey} style={{
                  background: 'rgba(255,255,255,0.05)',
                  padding: 20,
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.1)'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12
                    }}>
                      <div style={{
                        background: 'rgba(255,255,255,0.1)',
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'white'
                      }}>
                        Round #{roundNumber}
                      </div>
                      <div style={{fontSize: 16, fontWeight: 600, color: 'white'}}>
                        {new Date(round.dayKey).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: roundTotal >= 0 ? '#86efac' : '#fca5a5'
                    }}>
                      {roundTotal > 0 ? '+' : ''}{roundTotal.toLocaleString()} pts
                    </div>
                  </div>
                  
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
                    {picks.map((pick, pickIndex) => (
                      <div key={pickIndex} style={{
                        background: 'rgba(255,255,255,0.1)',
                        padding: '8px 12px',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <span style={{
                          color: pick.direction === 'UP' ? '#86efac' : '#fca5a5',
                          fontSize: 12
                        }}>
                          {pick.direction === 'UP' ? '▲' : '▼'}
                        </span>
                        <span>${pick.symbol}</span>
                        {pick.duplicateIndex > 1 && (
                          <span style={{
                            background: 'rgba(0,0,0,0.3)',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: 11
                          }}>
                            dup x{pick.duplicateIndex}
                          </span>
                        )}
                        <span style={{
                          color: pick.points >= 0 ? '#86efac' : '#fca5a5',
                          fontSize: 12
                        }}>
                          {pick.points > 0 ? '+' : ''}{pick.points}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  {round.boostActive && round.boostLevel > 0 && (
                    <div style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.7)'
                    }}>
                      Boost: +{round.boostLevel}%
                    </div>
                  )}
                </div>
              )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
