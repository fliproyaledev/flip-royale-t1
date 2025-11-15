import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import { TOKENS, getTokenById } from '../lib/tokens'
import ThemeToggle from '../components/ThemeToggle'

type DuelRoom = {
  id: string
  createdAt: string
  baseDay: string
  evalAt: string
  entryCost: number
  status: 'open'|'ready'|'locked'|'settled'|'cancelled'
  host: { userId: string; entryPaid: boolean; locked: boolean }
  guest?: { userId: string; entryPaid: boolean; locked: boolean }
  seq?: number
  result?: { settledAt: string; winner: 'host'|'guest'|'draw'; hostScore: number; guestScore: number; payoutPerWinner: number }
}

type ApiList = { ok: boolean; rooms: DuelRoom[] }

type PickSel = { tokenId: string; dir: 'UP'|'DOWN' }

type ApiRoom = { ok: boolean; room: DuelRoom }

function getGradientColor(index: number): string {
  const colors = ['#8b5cf6','#ec4899','#3b82f6','#10b981','#f59e0b','#06b6d4','#f97316','#ef4444','#8b5cf6','#ec4899','#3b82f6']
  return colors[index % colors.length]
}

function handleImageFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const target = e.currentTarget
  if (target.dataset.fallbackApplied === '1') return
  target.dataset.fallbackApplied = '1'
  target.onerror = null
  target.src = '/token-logos/placeholder.png'
}

export default function Arena(){
  const router = useRouter()
  const roomId = typeof router.query.room === 'string' ? router.query.room : ''

  const [user, setUser] = useState<any>(null)
  const [rooms, setRooms] = useState<DuelRoom[]>([])
  const [room, setRoom] = useState<DuelRoom|null>(null)
  const [points, setPoints] = useState<number>(0)
  const [inventory, setInventory] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<PickSel[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [search, setSearch] = useState('')
  
  const DEFAULT_AVATAR = '/avatars/default-avatar.png'

  async function loadRooms(){
    setLoading(true)
    try{
      const r = await fetch('/api/duel/get')
      const j: ApiList = await r.json()
      if (j?.ok && Array.isArray(j.rooms)) {
        setRooms(j.rooms)
        setError(null) // Clear any previous errors
      }
    }catch(e:any){ 
      setError(e?.message||'Load failed')
      setRooms([]) // Set empty array on error
    }
    finally{ setLoading(false) }
  }

  async function loadRoom(id: string){
    try{
      const r = await fetch(`/api/duel/get?id=${encodeURIComponent(id)}`)
      const j: ApiRoom = await r.json()
      if (j?.ok) {
        setRoom(j.room)
        setError(null) // Clear any previous errors
        // Sync selected from server if empty or lengths differ
        const side = mySide(j.room as any)
        if (side && Array.isArray(side.picks) && side.picks.length > 0) {
          setSelected(prev => {
            if (prev.length === side.picks.length && prev.every(p => side.picks.some((sp:any)=> sp.tokenId===p.tokenId && (sp.direction||'').toUpperCase()===p.dir))) return prev
            return side.picks.map((p:any)=>({ tokenId: p.tokenId, dir: (p.direction||'up').toUpperCase()==='DOWN'?'DOWN':'UP' }))
          })
        }
      }
    }catch(e:any){ 
      setError(e?.message||'Load room failed')
      setRoom(null) // Clear room on error
    }
  }

  const loadUserPointsRef = useRef(false) // Prevent concurrent calls
  
  const loadUserPoints = useCallback(async (u:any) => {
    if(!u || loadUserPointsRef.current) return
    loadUserPointsRef.current = true
    try{
      const r = await fetch(`/api/users/me?userId=${encodeURIComponent(u.id)}`)
      const j = await r.json()
      if (j?.ok) {
        const newPoints = j.user?.bankPoints||0
        setPoints(prev => {
          // Only update if points actually changed
          if (prev !== newPoints) {
            try {
              localStorage.setItem('flipflop-points', String(newPoints))
            } catch {}
            return newPoints
          }
          return prev
        })
      }
    }catch{}
    finally {
      loadUserPointsRef.current = false
    }
  }, [])

  useEffect(()=>{
    let mounted = true
    try{
      const s = localStorage.getItem('flipflop-user')
      if (s){ 
        const u = JSON.parse(s)
        if (mounted) {
          setUser(u)
          loadUserPoints(u)
        }
      }
      const inv = localStorage.getItem('flipflop-inventory')
      if (inv && mounted) setInventory(JSON.parse(inv))
      // Also try to load from localStorage as fallback
      const savedPts = localStorage.getItem('flipflop-points')
      if (savedPts && mounted) setPoints(parseInt(savedPts) || 0)
    }catch{}
    
    let roomInterval: NodeJS.Timeout | null = null
    if (roomId){
      loadRoom(roomId)
      roomInterval = setInterval(()=>{
        if (mounted) loadRoom(roomId)
      }, 8000)
    } else {
      loadRooms()
      roomInterval = setInterval(()=>{
        if (mounted) loadRooms()
      }, 10000)
    }
    
    return ()=>{
      mounted = false
      if (roomInterval) clearInterval(roomInterval)
    }
  },[roomId])
  
  // Refresh points periodically - use user.id instead of user object to avoid re-renders
  useEffect(() => {
    if (!user?.id) return
    const userId = user.id // Capture user.id to avoid dependency on user object
    const interval = setInterval(() => {
      loadUserPoints({ id: userId } as any)
    }, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [user?.id]) // Only depend on user.id, not the whole user object

  async function createRoom(){
    if (!user) { alert('Please register/login on PLAY page first.'); return }
    if (creating) return
    setCreating(true)
    try{
      const r = await fetch('/api/duel/create',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: user.id, entryCost: 2500 })})
      const j = await r.json()
      if (!j.ok) throw new Error(j.error||'Create failed')
      await loadUserPoints(user)
      router.push(`/arena?room=${encodeURIComponent(j.room.id)}`)
    }catch(e:any){ alert(e?.message||'Create failed') }
    finally{ setCreating(false) }
  }

  async function cancelRoom(id:string){
    if (!user) { alert('Login required'); return }
    if (!confirm('Cancel this room and refund your entry?')) return
    try{
      const r=await fetch('/api/duel/cancel', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ roomId: id, userId: user.id }) })
      const j=await r.json()
      if (!j.ok) throw new Error(j.error||'Cancel failed')
      await loadUserPoints(user)
      if (roomId) await loadRoom(id); else await loadRooms()
    }catch(e:any){ alert(e?.message||'Cancel failed') }
  }

  async function joinRoom(id:string, entry:number){
    if (!user) { alert('Login required'); return }
    if (!confirm(`Join this room for ${entry} pts?`)) return
    try{
      const r=await fetch('/api/duel/join', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ roomId: id, userId: user.id }) })
      const j=await r.json()
      if (!j.ok) throw new Error(j.error||'Join failed')
      await loadUserPoints(user)
      router.push(`/arena?room=${encodeURIComponent(id)}`)
    }catch(e:any){ alert(e?.message||'Join failed') }
  }

  async function grantTest(){
    if(!user) { alert('Login required'); return }
    try{
      const r = await fetch('/api/users/grant', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: user.id, amount: 100000 }) })
      const j = await r.json()
      if(!j.ok) throw new Error(j.error||'Grant failed')
      setPoints(j.bankPoints||0)
      try {
        localStorage.setItem('flipflop-points', String(j.bankPoints||0))
      } catch {}
      alert('100,000 test points added to your balance.')
    }catch(e:any){ alert(e?.message||'Grant failed') }
  }

  function formatTime(ts:string){ try{ return new Date(ts).toUTCString() } catch { return ts } }
  function minutesToEval(r: DuelRoom){ try { const ms = new Date(r.evalAt).getTime() - Date.now(); return Math.max(0, Math.floor(ms/60000)) } catch { return 0 } }
  function occupancy(r: DuelRoom){ 
    const SYSTEM_USER_ID = 'system'
    const hasRealHost = r.host?.userId && r.host.userId !== SYSTEM_USER_ID
    const hasGuest = !!r.guest
    const count = (hasRealHost ? 1 : 0) + (hasGuest ? 1 : 0)
    return count + '/2'
  }

  function isParticipant(r: DuelRoom | null){ 
    if(!r||!user) return false
    const SYSTEM_USER_ID = 'system'
    const hasRealHost = r.host?.userId && r.host.userId !== SYSTEM_USER_ID
    return (hasRealHost && r.host.userId===user.id) || r.guest?.userId===user.id 
  }
  function mySide(r: DuelRoom | null){ 
    if(!r||!user) return undefined as any
    const SYSTEM_USER_ID = 'system'
    const hasRealHost = r.host?.userId && r.host.userId !== SYSTEM_USER_ID
    if (hasRealHost && r.host.userId===user.id) return r.host
    if (r.guest?.userId===user.id) return r.guest
    return undefined
  }
  function canLock(r: DuelRoom | null){ const s=mySide(r); return !!(s && s.entryPaid && !s.locked && (r?.status==='open' || r?.status==='ready' || r?.status==='locked')) }
  function canSettle(r: DuelRoom | null){ if(!r) return false; const both = r.host?.locked && r.guest?.locked; const due = new Date(r.evalAt).getTime() <= Date.now(); return both && due && r.status!=='settled' }

  function addPick(tokenId: string, dir: 'UP'|'DOWN' = 'UP'){
    if (selected.length >= 5) return
    const have = inventory[tokenId] || 0
    const used = selected.filter(p=>p.tokenId===tokenId).length
    if (used >= have) { alert('Not enough copies in inventory'); return }
    setSelected(prev=>[...prev, { tokenId, dir }])
  }
  function removePick(idx: number){ setSelected(prev=>prev.filter((_,i)=>i!==idx)) }
  function toggleDir(idx:number){ setSelected(prev=> prev.map((p,i)=> i===idx ? { ...p, dir: p.dir==='UP'?'DOWN':'UP' } : p )) }

  async function lockNow(){
    if (!room || !user) return
    if (selected.length !== 5) { alert('Please select exactly 5 cards'); return }
    const payload = { roomId: room.id, userId: user.id, picks: selected.map(p=>({ tokenId: p.tokenId, direction: p.dir.toLowerCase() })) }
    try{
      const r = await fetch('/api/duel/lock', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      const j = await r.json()
      if(!j.ok){ throw new Error(j.error||'Lock failed') }
      await loadRoom(room.id)
      alert('Locked!')
    }catch(e:any){ alert(e?.message||'Lock failed') }
  }

  async function settleNow(){
    if (!room) return
    try{
      const r = await fetch('/api/duel/settle', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ roomId: room.id }) })
      const j = await r.json()
      if(!j.ok) throw new Error(j.error||'Settle failed')
      await loadRoom(room.id)
      await loadUserPoints(user)
    }catch(e:any){ alert(e?.message||'Settle failed') }
  }

  async function savePicks(){
    if (!room || !user) return
    if (selected.length !== 5) { alert('Please select exactly 5 cards'); return }
    try{
      const r = await fetch('/api/duel/picks', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ roomId: room.id, userId: user.id, picks: selected.map(p=>({ tokenId:p.tokenId, direction: p.dir.toLowerCase() })) }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error||'Save failed')
      await loadRoom(room.id)
      alert('Picks saved')
    }catch(e:any){ alert(e?.message||'Save failed') }
  }

  async function lockSingle(tokenId: string, dir: 'UP'|'DOWN'){
    if (!room || !user) return
    try{
      const r = await fetch('/api/duel/lock', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ roomId: room.id, userId: user.id, picks: [{ tokenId, direction: dir.toLowerCase() }] }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error||'Lock failed')
      await loadRoom(room.id)
    }catch(e:any){ alert(e?.message||'Lock failed') }
  }

  function isLockedToken(id: string): boolean {
    const side = mySide(room as any)
    if (!side || !Array.isArray(side.picks)) return false
    return !!side.picks.find((p:any)=> p.tokenId===id && p.locked)
  }
  function picksSavedOnServer(): boolean {
    const side = mySide(room as any)
    return !!(side && Array.isArray(side.picks) && side.picks.length === 5)
  }

  const ownedTokens = TOKENS
    .map(tok => ({ tok, have: inventory[tok.id] || 0, used: selected.filter(s => s.tokenId===tok.id).length }))
    .filter(({ tok }) => tok.symbol.toLowerCase().includes(search.toLowerCase()) || tok.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=> (b.have - b.used) - (a.have - a.used))

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
          <a className="tab active" href="/arena">ARENA</a>
          <a className="tab" href="/guide">GUIDE</a>
          <a className="tab" href="/inventory">INVENTORY</a>
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
          
          {user && (
            <>
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
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR
                  }}
                />
              </div>
              
              <div style={{
                background: 'rgba(0,207,163,0.15)',
                border: '1px solid rgba(0,207,163,0.25)',
                borderRadius: 10,
                padding: '8px 14px',
                fontSize: 15,
                fontWeight: 700,
                color: '#86efac',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                whiteSpace: 'nowrap'
              }}>
                {points.toLocaleString()} pts
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
                  transition: 'all 0.3s',
                  whiteSpace: 'nowrap'
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
            </>
          )}
        </div>
      </header>

      <div className="panel">
        {!roomId && (
          <>
            <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
              <h2>Arena</h2>
              <div style={{display:'flex', gap:12, alignItems:'center'}}>
                {points < 2500 && (
                  <button className="btn" onClick={grantTest}>Get 100k Test Points</button>
                )}
              </div>
            </div>
            {error && <div style={{color:'#fca5a5'}}>{error}</div>}
            <div className="sep"></div>
            {loading ? (
              <div style={{padding:24,color:'var(--muted-inv)'}}>Loading rooms...</div>
            ) : (
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:16}}>
                {rooms.length===0 && <div style={{padding:24,color:'var(--muted-inv)'}}>No rooms yet. Please check back soon.</div>}
                {rooms.map((r, idx)=>{
                  const SYSTEM_USER_ID = 'system'
                  const hasRealHost = r.host?.userId && r.host.userId !== SYSTEM_USER_ID
                  const youHost = user && r.host?.userId===user.id && hasRealHost
                  const canCancel = youHost && r.status==='open' && !r.guest
                  const canJoin = user && r.status==='open' && !r.guest && (!hasRealHost || !youHost)
                  const mins = minutesToEval(r)
                  const occ = occupancy(r)
                  return (
                    <div key={r.id} style={{
                      background:'rgba(255,255,255,0.06)',
                      border:'1px solid rgba(255,255,255,0.1)',
                      borderRadius:16,
                      padding:16,
                      display:'flex', flexDirection:'column', gap:12,
                      boxShadow:'0 8px 24px rgba(0,0,0,0.18)'
                    }}>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <div style={{fontWeight:900, color:'#fff'}}>Room {r.seq ?? idx + 1}</div>
                        <span className="badge" style={{background:'rgba(59,130,246,.2)',borderColor:'rgba(59,130,246,.3)',color:'#bfdbfe', fontSize:11}}>{r.status}</span>
                      </div>
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
                        <div style={{fontSize:12, color:'var(--muted-inv)'}}>Entry</div>
                        <div style={{textAlign:'right', fontWeight:700}}>{r.entryCost.toLocaleString()} pts</div>
                        <div style={{fontSize:12, color:'var(--muted-inv)'}}>Players</div>
                        <div style={{textAlign:'right', fontWeight:700}}>{occ}</div>
                        <div style={{fontSize:12, color:'var(--muted-inv)'}}>Eval</div>
                        <div style={{textAlign:'right'}}>{mins}m</div>
                      </div>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4}}>
                        <div style={{fontSize:11, color:'var(--muted-inv)'}}>
                          {hasRealHost ? `Host ${r.host.userId.slice(0,6)}…${r.host.userId.slice(-4)}` : 'Empty'}
                        </div>
                        <div style={{display:'flex', gap:8}}>
                          <button className="btn" onClick={()=>router.push(`/arena?room=${encodeURIComponent(r.id)}`)}>{canJoin?'Details':'Open'}</button>
                          {canJoin && (
                            <button className="btn" onClick={()=>joinRoom(r.id, r.entryCost)}>Enter {r.entryCost}</button>
                          )}
                          {canCancel && (
                            <button className="btn" onClick={()=>cancelRoom(r.id)} style={{background:'rgba(239,68,68,.2)',borderColor:'rgba(239,68,68,.3)',color:'#fca5a5'}}>Cancel & Refund</button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {roomId && (
          <>
            <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
              <div>
                <h2>Room {roomId}</h2>
                <div className="muted" style={{fontSize:12}}>Eval: {room ? new Date(room.evalAt).toUTCString() : '...'}</div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button className="btn" onClick={()=>router.push('/arena')}>Back</button>
                {canSettle(room) && <button className="btn" onClick={settleNow}>Settle</button>}
              </div>
            </div>
            <div className="sep"></div>
            {!room && <div style={{padding:24,color:'var(--muted-inv)'}}>Loading room...</div>}
            {room && (
              <div style={{display:'flex', flexDirection:'column', gap:16}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:16}}>
                  <div>
                    <div className="muted" style={{fontSize:12}}>Status</div>
                    <div><span className="badge" style={{background:'rgba(59,130,246,.2)',borderColor:'rgba(59,130,246,.3)',color:'#bfdbfe'}}>{room.status}</span></div>
                  </div>
                  <div>
                    <div className="muted" style={{fontSize:12}}>Host</div>
                    <div style={{color:'#fff'}}>
                      {room.host.userId === 'system' ? 'Empty' : `${room.host.userId.slice(0,6)}…${room.host.userId.slice(-4)} ${room.host.locked ? '(locked)':''}`}
                    </div>
                  </div>
                  <div>
                    <div className="muted" style={{fontSize:12}}>Guest</div>
                    <div style={{color: room.guest? '#fff':'#94a3b8'}}>{room.guest? `${room.guest.userId.slice(0,6)}…${room.guest.userId.slice(-4)} ${room.guest.locked?'(locked)':''}`: '—'}</div>
                  </div>
                </div>

                {/* Show saved picks if participant has picks */}
                {isParticipant(room) && picksSavedOnServer() && (
                  <div style={{border:'1px solid rgba(255,255,255,.1)', borderRadius:16, padding:16, background:'rgba(0,0,0,0.2)', marginBottom:16}}>
                    <h3 style={{margin:0, marginBottom:12}}>Your Selected Cards</h3>
                    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:12}}>
                      {(() => {
                        const side = mySide(room as any)
                        if (!side || !Array.isArray(side.picks) || side.picks.length === 0) return <div className="muted">No picks saved yet</div>
                        return side.picks.map((pick: any, idx: number) => {
                          const tok = getTokenById(pick.tokenId)
                          const locked = pick.locked
                          return (
                            <div key={idx} style={{
                              background:`linear-gradient(135deg, ${getGradientColor(idx)}, ${getGradientColor(idx+1)})`,
                              borderRadius:14,
                              padding:12,
                              position:'relative',
                              minHeight:180,
                              display:'flex',
                              flexDirection:'column',
                              justifyContent:'space-between',
                              border:'1px solid rgba(255,255,255,0.2)',
                              boxShadow:'0 6px 20px rgba(0,0,0,0.15)'
                            }}>
                              {locked && (
                                <div style={{
                                  position:'absolute', top:8, right:8,
                                  background:'#fbbf24', color:'#000', width:20, height:20, borderRadius:'50%',
                                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700,
                                  boxShadow:'0 2px 6px rgba(0,0,0,0.25)'
                                }}>🔒</div>
                              )}
                              <div style={{
                                width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.15)',
                                display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px',
                                border:'2px solid rgba(255,255,255,0.22)', boxShadow:'0 8px 20px rgba(0,0,0,0.25)', position:'relative', overflow:'hidden'
                              }}>
                                <img src={tok?.logo || '/token-logos/placeholder.png'} alt={tok?.symbol} style={{width:74,height:74,borderRadius:'50%',objectFit:'cover',position:'relative',zIndex:2,border:'2px solid rgba(255,255,255,0.2)'}} onError={handleImageFallback} />
                              </div>
                              <div style={{textAlign:'center'}}>
                                <div style={{fontSize:11, fontWeight:900, color:'#fff', textShadow:'0 2px 4px rgba(0,0,0,0.35)', marginBottom:4}}>{tok?.symbol || pick.tokenId}</div>
                                <div style={{fontSize:9, color:'rgba(255,255,255,0.82)', marginBottom:8, fontWeight:600, textTransform:'uppercase'}}>
                                  {(pick.direction || 'up').toUpperCase()}
                                </div>
                                {pick.lockedPct != null && (
                                  <div style={{fontSize:10, color:'rgba(255,255,255,0.9)', fontWeight:600}}>
                                    {pick.lockedPct > 0 ? '+' : ''}{pick.lockedPct.toFixed(2)}%
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                )}

                {isParticipant(room) && canLock(room) && (
                  <div style={{border:'1px solid rgba(255,255,255,.1)', borderRadius:16, padding:16, background:'linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.28))'}}>
                    <div className="row" style={{gap:12, alignItems:'center'}}>
                      <h3 style={{margin:0}}>Select 5 Cards & Directions</h3>
                      <div className="muted">Selected: {selected.length}/5</div>
                      <button className="btn" onClick={savePicks} disabled={selected.length!==5}>Save Picks</button>
                      <button className="btn" onClick={lockNow} disabled={selected.length!==5}>Lock All</button>
                      <div style={{marginLeft:'auto'}}>
                        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." style={{minWidth:220}} />
                      </div>
                    </div>
                    <div className="sep"></div>
                    <div className="arena-inventory-grid" style={{display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:16}}>
                      <div>
                        <div style={{fontWeight:900, marginBottom:8}}>Your Inventory</div>
                        <div style={{maxHeight:360, overflowY:'auto'}}>
                          <div className="arena-tokens-grid" style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(210px, 1fr))', gap:12}}>
                            {ownedTokens.filter(o=>o.have>0).map(({tok, have, used}, idx)=>{
                              const left = have - used
                              const canAdd = left>0 && selected.length<5
                              return (
                                <div key={tok.id} style={{
                                  background:'rgba(255,255,255,0.05)',
                                  border:'1px solid rgba(255,255,255,0.1)',
                                  borderRadius:14,
                                  padding:10,
                                  display:'flex',
                                  alignItems:'center',
                                  gap:12
                                }}>
                                  <div style={{width:44,height:44,borderRadius:'50%',overflow:'hidden',border:'2px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.12)',display:'grid',placeItems:'center'}}>
                                    <img src={tok.logo} alt={tok.symbol} style={{width:40,height:40,borderRadius:'50%',objectFit:'cover'}} onError={handleImageFallback} />
                                  </div>
                                  <div style={{flex:1}}>
                                    <div style={{fontWeight:900,color:'#fff',fontSize:12}}>{tok.symbol}</div>
                                    <div className="muted" style={{fontSize:10}}>{tok.name}</div>
                                  </div>
                                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}}>
                                    <span className="badge" style={{background:'rgba(0,0,0,.25)',borderColor:'rgba(255,255,255,.2)',color:'#fff'}}>{used}/{have}</span>
                                    <button className="btn" disabled={!canAdd} onClick={()=>addPick(tok.id,'UP')}>Add</button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div style={{fontWeight:900, marginBottom:8}}>Your Picks</div>
                        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12}}>
                          {selected.length===0 && <div className="muted">Select up to 5 cards</div>}
                          {selected.map((p,idx)=>{
                            const tok = getTokenById(p.tokenId)
                            const locked = isLockedToken(p.tokenId)
                            return (
                              <div key={idx} style={{
                                background:`linear-gradient(135deg, ${getGradientColor(idx)}, ${getGradientColor(idx+1)})`,
                                borderRadius:16,
                                padding:12,
                                position:'relative',
                                minHeight:200,
                                display:'flex',
                                flexDirection:'column',
                                justifyContent:'space-between',
                                border:'1px solid rgba(255,255,255,0.2)',
                                boxShadow:'0 8px 26px rgba(0,0,0,0.18), 0 3px 16px rgba(0,0,0,0.12)'
                              }}>
                                {locked && (
                                  <div style={{
                                    position:'absolute', top:10, right:10,
                                    background:'#fbbf24', color:'#000', width:22, height:22, borderRadius:'50%',
                                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700,
                                    boxShadow:'0 2px 6px rgba(0,0,0,0.25)'
                                  }}>🔒</div>
                                )}

                                <div style={{
                                  width:90, height:90, borderRadius:'50%', background:'rgba(255,255,255,0.15)',
                                  display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px',
                                  border:'2px solid rgba(255,255,255,0.22)', boxShadow:'0 10px 24px rgba(0,0,0,0.28)', position:'relative', overflow:'hidden'
                                }}>
                                  <img src={tok?.logo} alt={tok?.symbol} style={{width:84,height:84,borderRadius:'50%',objectFit:'cover',position:'relative',zIndex:2,border:'2px solid rgba(255,255,255,0.2)'}} onError={handleImageFallback} />
                                </div>

                                <div style={{textAlign:'center'}}>
                                  <div style={{fontSize:12, fontWeight:900, color:'#fff', textShadow:'0 2px 4px rgba(0,0,0,0.35)', marginBottom:4, letterSpacing:.4}}>{tok?.symbol}</div>
                                  <div style={{fontSize:10, color:'rgba(255,255,255,0.82)', marginBottom:6, fontWeight:600, letterSpacing:.6, textTransform:'uppercase'}}>{tok?.about || tok?.name}</div>
                                  <div style={{display:'flex', gap:6, marginBottom:8, justifyContent:'center'}}>
                                    <button className={`btn ${p.dir==='UP'?'btn-up active':''}`} style={{fontSize:9, padding:'4px 7px', fontWeight:600}} onClick={()=>!locked && setSelected(prev=> prev.map((pp,i)=> i===idx ? { ...pp, dir:'UP' } : pp ))} disabled={locked}>▲ UP</button>
                                    <button className={`btn ${p.dir==='DOWN'?'btn-down active':''}`} style={{fontSize:9, padding:'4px 7px', fontWeight:600}} onClick={()=>!locked && setSelected(prev=> prev.map((pp,i)=> i===idx ? { ...pp, dir:'DOWN' } : pp ))} disabled={locked}>▼ DOWN</button>
                                    {!locked && <button className="btn" onClick={()=>lockSingle(p.tokenId, p.dir)} disabled={!picksSavedOnServer()} style={{fontSize:9, padding:'4px 7px', fontWeight:600, background:'rgba(16,185,129,.2)',borderColor:'rgba(16,185,129,.3)',color:'#86efac'}}>Lock</button>}
                                  </div>
                                  <button className="btn" onClick={()=>removePick(idx)} style={{fontSize:9, padding:'4px 7px', fontWeight:600, background:'rgba(239,68,68,.2)',borderColor:'rgba(239,68,68,.3)',color:'#fca5a5'}} disabled={locked}>Remove</button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {room.status==='settled' && room.result && (
                  <div style={{border:'1px solid rgba(255,255,255,.1)', borderRadius:10, padding:16}}>
                    <h3 style={{marginTop:0}}>Result</h3>
                    <div className="row" style={{gap:16}}>
                      <div className="badge" style={{background:'rgba(0,0,0,.2)',borderColor:'rgba(255,255,255,.2)',color:'#fff'}}>Winner: {room.result.winner}</div>
                      <div className="badge" style={{background:'rgba(0,0,0,.2)',borderColor:'rgba(255,255,255,.2)',color:'#fff'}}>Host: {room.result.hostScore}</div>
                      <div className="badge" style={{background:'rgba(0,0,0,.2)',borderColor:'rgba(255,255,255,.2)',color:'#fff'}}>Guest: {room.result.guestScore}</div>
                      <div className="badge" style={{background:'rgba(0,0,0,.2)',borderColor:'rgba(255,255,255,.2)',color:'#fff'}}>Payout: {room.result.payoutPerWinner}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

