import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import ThemeToggle from '../components/ThemeToggle'

const DEFAULT_AVATAR = '/avatars/default-avatar.png'

// Tipleri güncelledik ki API'den gelen verilerle eşleşsin
type User = {
  id: string
  username: string
  walletAddress?: string
  createdAt: string | number
  lastLogin: string | number
  avatar?: string
  totalPoints: number     // <-- Eklendi
  bankPoints: number      // <-- Eklendi
  currentRound: number    // <-- Eklendi
  inventory?: Record<string, number> // <-- Eklendi
}

type RoundHistory = {
  dayKey: string
  items: Array<{         // 'picks' yerine 'items' (API yapısına uygun)
    symbol: string
    dir: 'UP' | 'DOWN'
    points: number
    duplicateIndex: number
  }>
  totalPoints: number
}

export default function Profile(){
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [history, setHistory] = useState<RoundHistory[]>([])
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setMounted(true)
    
    async function load() {
        const savedUser = localStorage.getItem('flipflop-user')
        let userId = ''
        if (savedUser) {
            try { userId = JSON.parse(savedUser).id } catch {}
        }
        if (!userId) {
             window.location.href = '/auth'
             return
        }
        
        try {
            const r = await fetch(`/api/users/me?userId=${encodeURIComponent(userId)}`)
            const j = await r.json()
            if (j.ok && j.user) {
                setUser(j.user)
                
                // History Dönüştürme (API -> Frontend)
                if (Array.isArray(j.user.roundHistory)) {
                    const mappedHistory = j.user.roundHistory.map((h: any) => ({
                        dayKey: h.date,
                        totalPoints: h.totalPoints,
                        items: h.items || [] // Picks yerine items kullanıyoruz
                    }))
                    setHistory(mappedHistory)
                }
            }
        } catch(e) { console.error(e) } finally {
            setLoading(false)
        }
    }
    load()
  }, [])

  if (!mounted || loading) {
    return (
        <div className="app" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
            <div className="muted">Loading profile...</div>
        </div>
    )
  }

  if (!user) return null

  // --- İSTATİSTİK HESAPLAMALARI (DÜZELTİLDİ) ---
  // Artık direkt sunucudan gelen doğru verileri kullanıyoruz.
  const totalPoints = user.totalPoints || 0
  const totalRounds = user.currentRound ? user.currentRound - 1 : 0
  const averagePoints = totalRounds > 0 ? Math.round(totalPoints / totalRounds) : 0
  
  // Kart Sayısı: Inventory'deki tüm kartların toplamı
  const cardsCollected = user.inventory 
    ? Object.values(user.inventory).reduce((sum: number, count: any) => sum + Number(count), 0)
    : 0

  // Paket Sayısı Tahmini: Her pakette 5 kart varsa
  const packsOpened = Math.ceil(cardsCollected / 5)

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
        <div style={{display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto'}}>
          <ThemeToggle />
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
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <img
              src={user.avatar || DEFAULT_AVATAR}
              alt={user.username}
              style={{width: '100%', height: '100%', objectFit: 'cover'}}
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR }}
            />
          </div>
          
          <button
            onClick={() => {
              localStorage.removeItem('flipflop-user')
              window.location.href = '/auth'
            }}
            className="btn"
            style={{
              background: 'rgba(239,68,68,0.2)',
              borderColor: 'rgba(239,68,68,0.3)',
              color: '#fca5a5'
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <div className="panel">
        <h2>Profile</h2>
        
        {/* User Info & Stats Grid */}
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
                  <label className="btn primary" style={{display:'inline-block', cursor:'pointer', fontSize:13, padding:'8px 16px'}}>
                    Change Photo
                    <input
                        type="file"
                        accept="image/*"
                        style={{display:'none'}}
                        onChange={(e) => {
                            // Avatar upload logic here
                        }}
                    />
                  </label>
                </div>
              </div>
              <div>
                <div className="muted" style={{marginBottom: 4}}>Username</div>
                <div style={{fontSize: 16, fontWeight: 600}}>{user.username}</div>
              </div>
              <div>
                <div className="muted" style={{marginBottom: 4}}>Member Since</div>
                <div style={{fontSize: 16, fontWeight: 600}}>
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                </div>
              </div>
            </div>
          </div>

           {/* Game Statistics */}
           <div style={{
             background: 'rgba(255,255,255,0.05)',
             padding: 24,
             borderRadius: 16,
             border: '1px solid rgba(255,255,255,0.1)'
           }}>
             <h3 style={{marginBottom: 16, fontSize: 18, fontWeight: 700}}>Game Statistics</h3>
             <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
               
               <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>
                 <div className="muted">Total Points</div>
                 <div className="points good" style={{ fontSize: 20 }}>{totalPoints.toLocaleString()}</div>
               </div>

               <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>
                 <div className="muted">Rounds Played</div>
                 <div style={{ fontSize: 20, fontWeight: 700 }}>{totalRounds}</div>
               </div>

               <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>
                 <div className="muted">Average Points</div>
                 <div style={{ fontSize: 20, fontWeight: 700 }}>{averagePoints.toLocaleString()}</div>
               </div>

               <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>
                 <div className="muted">Packs Opened</div>
                 <div style={{ fontSize: 20, fontWeight: 700 }}>{packsOpened}</div>
               </div>

               <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>
                 <div className="muted">Cards Collected</div>
                 <div style={{ fontSize: 20, fontWeight: 700 }}>{cardsCollected}</div>
               </div>

             </div>
           </div>
        </div>

        {/* Round History */}
        <div>
          <h3 style={{marginBottom: 20, fontSize: 18, fontWeight: 700}}>Round History</h3>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, borderRadius: 12, border: '2px dashed var(--border)', color: 'var(--muted-inv)' }}>
              No rounds played yet. Start playing to see your history!
            </div>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
              {history.slice().reverse().map((round, index) => {
                const roundTotal = round.totalPoints || 0
                // API'den 'items' geliyor, 'picks' değil. Onu düzeltiyoruz:
                const picks = Array.isArray(round.items) ? round.items : [] 
                const roundNumber = history.length - index // Basit sayaç
                
                return (
                <div key={round.dayKey} style={{
                  background: 'rgba(255,255,255,0.05)',
                  padding: 20,
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.1)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="badge">Round #{roundNumber}</div>
                      <div style={{fontSize: 16, fontWeight: 600}}>{new Date(round.dayKey).toLocaleDateString()}</div>
                    </div>
                    <div className={`points ${roundTotal >= 0 ? 'good' : 'bad'}`} style={{fontSize: 18}}>
                      {roundTotal > 0 ? '+' : ''}{roundTotal.toLocaleString()} pts
                    </div>
                  </div>
                  
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
                    {picks.map((pick: any, pickIndex: number) => (
                      <div key={pickIndex} style={{
                        background: 'rgba(255,255,255,0.1)',
                        padding: '8px 12px',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <span className={pick.dir === 'UP' ? 'dir-up' : 'dir-down'} style={{fontSize: 10, padding: '2px 6px', borderRadius: 4}}>
                          {pick.dir === 'UP' ? '▲' : '▼'}
                        </span>
                        <span>${pick.symbol}</span>
                        {pick.duplicateIndex > 1 && (
                          <span style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4, fontSize: 10 }}>
                            x{pick.duplicateIndex}
                          </span>
                        )}
                        <span className={pick.points >= 0 ? 'points good' : 'points bad'} style={{fontSize: 12, marginTop:0}}>
                          {pick.points > 0 ? '+' : ''}{pick.points}
                        </span>
                      </div>
                    ))}
                  </div>
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
