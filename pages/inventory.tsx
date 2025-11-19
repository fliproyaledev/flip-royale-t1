import { useEffect, useState } from 'react'
import type { SyntheticEvent } from 'react'
import ThemeToggle from '../components/ThemeToggle'
import { TOKENS } from '../lib/tokens'

function handleImageFallback(event: SyntheticEvent<HTMLImageElement>) {
  const target = event.currentTarget
  if (target.dataset.fallbackApplied === '1') return
  target.dataset.fallbackApplied = '1'
  target.onerror = null
  target.src = '/token-logos/placeholder.png'
}

export default function Inventory(){
  const [inventory, setInventory] = useState<Record<string,number>>({})
  const [user, setUser] = useState<any>(null)

  useEffect(()=>{
    async function load() {
        const savedUser = localStorage.getItem('flipflop-user')
        let userId = ''
        if (savedUser) {
            try {
                const u = JSON.parse(savedUser)
                setUser(u)
                userId = u.id
            } catch {}
        }
        
        if (userId) {
            try {
                const r = await fetch(`/api/users/me?userId=${encodeURIComponent(userId)}`)
                const j = await r.json()
                if (j.ok && j.user) {
                    setUser(j.user)
                    if (j.user.inventory) setInventory(j.user.inventory)
                }
            } catch(e) { console.error(e) }
        }
    }
    load()
  },[])

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
          <a className="tab active" href="/inventory">INVENTORY</a>
          <a className="tab" href="/leaderboard">LEADERBOARD</a>
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
        <h2>Token Collection</h2>
        <div className="sep"></div>
        
        <div style={{
          display:'grid',
          gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',
          gap:16,
          marginTop:20
        }}>
          {TOKENS.filter(t => (inventory[t.id] || 0) > 0).map((tok, index)=>{
            const count = inventory[tok.id] || 0
            
            // Color palette inspired by trading card gradients
            const colors = [
              'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // Purple to indigo
              'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', // Pink to coral
              'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', // Blue to cyan
              'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', // Green to aqua
              'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', // Pink to yellow
              'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', // Mint to blush
              'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', // Soft pink tones
              'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', // Peach to apricot
              'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)', // Pink to soft orange
              'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', // Lavender to pink
              'linear-gradient(135deg, #fad0c4 0%, #ffd1ff 100%)', // Apricot to lilac
            ]
            
            const rarity = index < 3 ? 'C' : index < 7 ? 'U' : 'R' // Common, Uncommon, Rare
            const rarityColor = rarity === 'C' ? '#6b7280' : rarity === 'U' ? '#3b82f6' : '#f59e0b'
            
            return (
                             <div key={tok.id} style={{
                 background: colors[index % colors.length],
                 borderRadius: 20,
                 padding: 24,
                 position: 'relative',
                                   minHeight: 280,
                 display: 'flex',
                 flexDirection: 'column',
                 justifyContent: 'space-between',
                 border: '2px solid rgba(255,255,255,0.15)',
                 boxShadow: '0 12px 40px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.1)',
                 transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                 transform: 'translateY(0)',
                 cursor: 'pointer'
               }}
               onMouseEnter={(e) => {
                 e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
                 e.currentTarget.style.boxShadow = '0 20px 60px rgba(0,0,0,0.25), 0 8px 30px rgba(0,0,0,0.15)';
                 e.currentTarget.style.border = '2px solid rgba(255,255,255,0.3)';
               }}
               onMouseLeave={(e) => {
                 e.currentTarget.style.transform = 'translateY(0)';
                 e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.1)';
                 e.currentTarget.style.border = '2px solid rgba(255,255,255,0.15)';
               }}>
                                                   
                
                {/* Rarity badge */}
                <div style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  background: rarityColor,
                  color: 'white',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700
                }}>
                  {rarity}
                </div>
                
                {/* Token logo */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  flex: 1,
                  marginTop: 16
                }}>
                                                       <div style={{
                    width: 120,
                    height: 120,
                    background: 'rgba(255,255,255,0.12)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '3px solid rgba(255,255,255,0.25)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(15px)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    {/* Glow effect */}
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '120%',
                      height: '120%',
                      background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
                      borderRadius: '50%',
                      filter: 'blur(20px)'
                    }} />
                    
                    <img 
                      src={tok.logo} 
                      alt={tok.symbol} 
                      style={{
                        width: 100,
                        height: 100,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
                        position: 'relative',
                        zIndex: 2,
                        border: '2px solid rgba(255,255,255,0.2)'
                      }}
                      onError={handleImageFallback}
                    />
                  </div>
                </div>
                
                {/* Token info */}
                <div style={{textAlign: 'center', marginTop: 16}}>
                  <div style={{
                    fontSize: 18,
                    fontWeight: 900,
                    color: 'white',
                    textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    marginBottom: 4
                  }}>
                    {tok.symbol}
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.8)',
                    marginBottom: 8
                  }}>
                    {tok.about}
                  </div>
                  <div style={{
                    background: 'rgba(0,0,0,0.2)',
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    Owned: {count}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
