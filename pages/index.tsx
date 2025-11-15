import { useEffect, useState, useMemo } from 'react'
import type { SyntheticEvent } from 'react'
import { TOKENS, Token, getTokenById } from '../lib/tokens'

type RoundPick = { tokenId:string; dir:'UP'|'DOWN'; duplicateIndex:number; locked:boolean; pLock?:number; pointsLocked?:number }

type RoundResult = {
  tokenId: string
  symbol: string
  dir: 'UP' | 'DOWN'
  points: number
  percentage: number
  duplicateIndex: number
}
type DayResult = { dayKey:string; total:number; items:{ tokenId:string; symbol:string; dir:'UP'|'DOWN'; duplicateIndex:number; points:number }[] }

// TOKENS imported from ../lib/tokens

type HighlightEntry = { tokenId:string; symbol:string; points:number; dir:'UP'|'DOWN'; changePct:number }
type HighlightState = { topGainers: HighlightEntry[]; topLosers: HighlightEntry[] }

function utcDayKey(d=new Date()){ const y=d.getUTCFullYear(), m=d.getUTCMonth(), day=d.getUTCDate(); return `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}` }

function randInt(n:number){ return Math.floor(Math.random()*n) }
function makeRandom5(tokens:Token[]){ return Array.from({length:5},()=>tokens[randInt(tokens.length)].id) }
async function getPrice(tokenId: string) { const r = await fetch(`/api/price?token=${encodeURIComponent(tokenId)}`); return r.json() as Promise<{p0:number; pLive:number; pClose:number; ts:string; changePct?:number; source?:'dexscreener'|'fallback'}> }

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Expired'
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${minutes}m`
}

function nerfFactor(dup:number){ 
  if(dup<=1) return 1; 
  if(dup===2) return 0.75; 
  if(dup===3) return 0.5; 
  if(dup===4) return 0.25; 
  if(dup===5) return 0; 
  return 0; 
}

function clamp(v:number, lo:number, hi:number){ return Math.max(lo, Math.min(hi, v)) }

function getGradientColor(index: number): string {
  const colors = [
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // orange
    '#06b6d4', // cyan
    '#f97316', // orange-red
    '#ef4444', // red
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#3b82f6'  // blue
  ]
  return colors[index % colors.length]
}

function handleImageFallback(event: SyntheticEvent<HTMLImageElement>) {
  const target = event.currentTarget
  if (target.dataset.fallbackApplied === '1') return
  target.dataset.fallbackApplied = '1'
  target.onerror = null
  target.src = '/token-logos/placeholder.png'
}

function calcPoints(p0:number, pNow:number, dir:'UP'|'DOWN', dup:number, boostLevel:0|50|100, boostActive:boolean){
  const pct = ((pNow - p0)/p0)*100; 
  const signed = dir==='UP'?pct:-pct; 
  let pts = signed*100; // Each 1% change equals 100 points
  
  const nerf = nerfFactor(dup);
  const loss = 2 - nerf; 
  
  if(pts >= 0) {
    pts = pts * nerf;
  } else {
    pts = pts * loss;
  }
  
  pts = clamp(pts,-2500,2500);
  
  if(boostActive && boostLevel && pts > 0){ 
    pts *= (boostLevel===100?2:boostLevel===50?1.5:1) 
  }
  
  return Math.round(pts);
}

export default function Home(){
  const [now, setNow] = useState(Date.now())
  const [inventory, setInventory] = useState<Record<string,number>>({})
  const [active, setActive] = useState<RoundPick[]>([])
  const [nextRound, setNextRound] = useState<RoundPick[]>(Array(5).fill(null))
  const [currentPack, setCurrentPack] = useState<{ dayKey:string; cards:string[]; opened:boolean } | null>(null)
  const [prices, setPrices] = useState<Record<string,{p0:number;pLive:number;pClose:number;changePct?:number;source?:'dexscreener'|'fallback'}>>({})
  const [reveals, setReveals] = useState([false,false,false,false,false])
  const [boost, setBoost] = useState<{ level:0|50|100; endAt?:number }>({ level:0 })
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [boostNext, setBoostNext] = useState<0|50|100>(0)
  const [history, setHistory] = useState<DayResult[]>([])
  const [showSummary, setShowSummary] = useState<{open:boolean; items:DayResult|null}>({open:false, items:null})
  const [showPackResults, setShowPackResults] = useState(false)
  const [modalOpen, setModalOpen] = useState<{open:boolean; type:'select'|'summary'|'pack'}>({open:false, type:'select'})
  const [modalSearch, setModalSearch] = useState('')
  const [showRoundResults, setShowRoundResults] = useState<{open: boolean; results: RoundResult[]}>({open: false, results: []})
  const [currentRound, setCurrentRound] = useState(1)
  const [stateLoaded, setStateLoaded] = useState(false)
  const [inventoryLoaded, setInventoryLoaded] = useState(false)
  const [points, setPoints] = useState<number>(0)
  const [buyQty, setBuyQty] = useState<number>(1)
  const [showMysteryResults, setShowMysteryResults] = useState<{open:boolean; cards:string[]}>({open:false, cards:[]})
  const [starterAvailable, setStarterAvailable] = useState(false)
  const [globalHighlights, setGlobalHighlights] = useState<HighlightState>({ topGainers: [], topLosers: [] })

const DEFAULT_AVATAR = '/avatars/default-avatar.png'

  const boostActive = !!(boost.endAt && boost.endAt > Date.now())

  function resetPersistentState() {
    setInventory({})
    setHistory([])
    setActive([])
    setNextRound(Array(5).fill(null))
    setPrices({})
    setCurrentPack(null)
    setShowPackResults(false)
    setShowRoundResults({ open: false, results: [] })
    setShowMysteryResults({ open: false, cards: [] })
    setGlobalHighlights({ topGainers: [], topLosers: [] })
    setShowSummary({ open: false, items: null })
    setModalOpen({ open: false, type: 'select' })
    setModalSearch('')
    setStarterAvailable(false)
    setPoints(0)
    setCurrentRound(1)
    setBoost({ level: 0 })
    setBoostNext(0)
    setReveals([false, false, false, false, false])
    setBuyQty(1)
    try {
      [
        'flipflop-inventory',
        'flipflop-history',
        'flipflop-active',
        'flipflop-next',
        'flipflop_state',
        'flipflop-current-round',
        'flipflop-current-pack',
        'flipflop-starter-available',
        'flipflop-points',
        'flipflop-global-highlights',
        'flipflop-has-started'
      ].forEach(key => localStorage.removeItem(key))
    } catch {}
  }

  useEffect(() => {
    setMounted(true)
    
    const savedUser = localStorage.getItem('flipflop-user')
    if (savedUser) {
      const parsed = JSON.parse(savedUser)
      if (!parsed.avatar) {
        parsed.avatar = DEFAULT_AVATAR
        try { localStorage.setItem('flipflop-user', JSON.stringify(parsed)) } catch {}
      }
      setUser(parsed)
      // Load user points from server
      async function loadUserPoints() {
        try {
          const r = await fetch(`/api/users/me?userId=${encodeURIComponent(parsed.id)}`)
          const j = await r.json()
          if (j?.ok && j?.user?.bankPoints !== undefined) {
            setPoints(j.user.bankPoints)
            try {
              localStorage.setItem('flipflop-points', String(j.user.bankPoints))
            } catch {}
          }
        } catch {}
      }
      loadUserPoints()
      
      // Refresh points periodically
      const pointsInterval = setInterval(() => {
        loadUserPoints()
      }, 30000) // Refresh every 30 seconds
      
      // Cleanup interval on unmount
      return () => clearInterval(pointsInterval)
    } else {
      // Redirect to auth page if no user
      window.location.href = '/auth'
      return
    }
    const savedStarter = localStorage.getItem('flipflop-starter-available')
    if (savedStarter) setStarterAvailable(savedStarter === '1')
    const savedPts = localStorage.getItem('flipflop-points')
    if (savedPts) setPoints(parseInt(savedPts))
    
    // Check if this is a fresh start (first time or reset)
    const isFreshStart = !localStorage.getItem('flipflop-has-started')
    if (isFreshStart) {
      // Mark as started
      try {
        localStorage.setItem('flipflop-has-started', '1')
        // Reset to Beta Round 1 - Fresh Start
        setCurrentRound(1)
        localStorage.setItem('flipflop-current-round', '1')
        // Clear previous rounds history for fresh start
        localStorage.removeItem('flipflop-history')
        localStorage.removeItem('flipflop-active')
        localStorage.removeItem('flipflop-next')
        localStorage.removeItem('flipflop_state')
        localStorage.removeItem('flipflop-global-highlights')
        localStorage.removeItem('flipflop-last-settled-day')
        setActive([])
        setNextRound(Array(5).fill(null))
      } catch {}
    } else {
      // Normal load - restore from localStorage
      const savedRound = localStorage.getItem('flipflop-current-round')
      if (savedRound) {
        setCurrentRound(parseInt(savedRound) || 1)
      } else {
        setCurrentRound(1)
      }
    }

    // Load saved active and nextRound to prevent round reset on navigation
    try {
      // Load active round from localStorage (if not fresh start)
      if (!isFreshStart) {
        const savedActive = localStorage.getItem('flipflop-active')
        if (savedActive) {
          try {
            const parsed = JSON.parse(savedActive)
            if (Array.isArray(parsed) && parsed.length > 0) {
              setActive(parsed)
            } else {
              setActive([])
            }
          } catch {
            setActive([])
          }
        } else {
          setActive([])
        }
      } else {
        setActive([])
      }

      // Load next round from localStorage (if not fresh start)
      if (!isFreshStart) {
        const savedNext = localStorage.getItem('flipflop-next')
        if (savedNext) {
          try {
            const parsed = JSON.parse(savedNext)
            if (Array.isArray(parsed) && parsed.length === 5) {
              setNextRound(parsed)
            } else {
              setNextRound(Array(5).fill(null))
            }
          } catch {
            setNextRound(Array(5).fill(null))
          }
        } else {
          setNextRound(Array(5).fill(null))
        }
      } else {
        setNextRound(Array(5).fill(null))
      }
      setStateLoaded(true)
    } catch {
      if (!isFreshStart) {
        // Only set defaults if not fresh start (in case of error)
        setActive([])
        setNextRound(Array(5).fill(null))
      }
      setStateLoaded(true)
    }
  }, [])

  useEffect(()=>{ const id=setInterval(()=>setNow(Date.now()), 4000); return ()=>clearInterval(id) },[])

  // Update Global Movers periodically
  useEffect(() => {
    snapshotGlobalHighlights()
    const interval = setInterval(() => {
      snapshotGlobalHighlights()
    }, 30000) // Update every 30 seconds
    return () => clearInterval(interval)
  }, [])

  // Check for UTC 00:00 and automatically settle round
  useEffect(() => {
    function checkUTCMidnight() {
      const now = new Date()
      const utcHours = now.getUTCHours()
      const utcMinutes = now.getUTCMinutes()
      const utcSeconds = now.getUTCSeconds()
      
      // Check if we just passed UTC 00:00 (within last 10 seconds)
      if (utcHours === 0 && utcMinutes === 0 && utcSeconds < 10) {
        // Check if we haven't already settled today
        const todayKey = utcDayKey(now)
        const lastSettled = localStorage.getItem('flipflop-last-settled-day')
        if (lastSettled !== todayKey && active.length > 0) {
          localStorage.setItem('flipflop-last-settled-day', todayKey)
          // Use setTimeout to avoid calling simulateNewDay during render
          setTimeout(() => {
            simulateNewDay()
          }, 100)
        }
      }
    }
    
    checkUTCMidnight()
    const interval = setInterval(checkUTCMidnight, 5000) // Check every 5 seconds
    return () => clearInterval(interval)
  }, [active, prices])

  // Boost countdown timer
  // Persist points
  useEffect(()=>{ try { localStorage.setItem('flipflop-points', String(points)) } catch {} },[points])

  async function buyMysteryPacks(){
    if (!user) { alert('Please log in first.'); return }
    
    // First, get current points from server to ensure accuracy
    let currentPoints = points
    try {
      const checkR = await fetch(`/api/users/me?userId=${encodeURIComponent(user.id)}`)
      const checkJ = await checkR.json()
      if (checkJ?.ok && checkJ?.user?.bankPoints !== undefined) {
        currentPoints = checkJ.user.bankPoints
        setPoints(currentPoints)
        try {
          localStorage.setItem('flipflop-points', String(currentPoints))
        } catch {}
      }
    } catch (e) {
      console.warn('Failed to refresh points before purchase:', e)
    }
    
    const qty = Math.max(1, Math.min(10, buyQty))
    const cost = 5000 * qty
    
    // Check with current server points
    if (currentPoints < cost) { 
      alert(`Not enough points. You have ${currentPoints.toLocaleString()} pts, need ${cost.toLocaleString()} pts.`)
      return 
    }
    
    try {
      const r = await fetch('/api/users/purchase-pack', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ userId: user.id, cost, packType: 'mystery' })
      })
      
      if (!r.ok) {
        let errorMsg = `Purchase failed: ${r.status} ${r.statusText}`
        try {
          const errorText = await r.text()
          if (errorText) {
            try {
              const errorJson = JSON.parse(errorText)
              errorMsg = errorJson.error || errorMsg
            } catch {
              errorMsg = errorText || errorMsg
            }
          }
        } catch {}
        alert(errorMsg)
        return
      }
      
      const j = await r.json()
      if (!j.ok) {
        alert(j.error || 'Purchase failed')
        return
      }
      
      // Update points from server response
      setPoints(j.bankPoints || 0)
      try {
        localStorage.setItem('flipflop-points', String(j.bankPoints || 0))
      } catch {}
      
      // Generate cards: random 5 per pack
      const totalCards = qty * 5
      const cards: string[] = Array.from({length: totalCards}, ()=> TOKENS[randInt(TOKENS.length)].id)
      setShowMysteryResults({open:true, cards})
    } catch (e: any) {
      console.error('Purchase error:', e)
      alert(e?.message || 'Purchase failed. Please try again.')
    }
  }

  function addMysteryToInventory(){
    if (!showMysteryResults.open) return
    const newInv = { ...inventory }
    showMysteryResults.cards.forEach(id => { newInv[id] = (newInv[id]||0)+1 })
    setInventory(newInv)
    setShowMysteryResults({open:false, cards:[]})
  }


  function claimStarterReward(force = false) {
    if (!starterAvailable && !force) return
    setStarterAvailable(false)
    try { localStorage.setItem('flipflop-starter-available','0') } catch {}
    // Points are granted at registration; only open the pack here
    const cards: string[] = makeRandom5(TOKENS)
    setShowMysteryResults({open:true, cards})
  }

  async function snapshotGlobalHighlights() {
    // Fetch prices for all tokens to populate Global Movers
    const allTokenIds = TOKENS.map(t => t.id)
    try {
      const results = await Promise.all(allTokenIds.map(async (id) => {
        try {
          const data = await getPrice(id)
          return [id, data] as const
        } catch {
          return null
        }
      }))

      const entries = results
        .filter((entry) => !!entry)
        .map(([id, data]) => {
          if (!data) return null
          const baseline = data.p0
          const close = data.pClose ?? data.pLive
          if (!isFinite(baseline) || !isFinite(close) || baseline <= 0) return null
          const changePct = ((close - baseline) / baseline) * 100
          const points = calcPoints(baseline, close, 'UP', 1, 0, false)
          const token = getTokenById(id) || TOKENS.find(t => t.id === id)
          const symbol = token?.symbol || id.toUpperCase()
          return { id, symbol, changePct, points }
        })
        .filter((entry): entry is { id: string; symbol: string; changePct: number; points: number } => !!entry)

      if (!entries.length) {
        setGlobalHighlights({ topGainers: [], topLosers: [] })
        return
      }

      const gainers = entries
        .filter(entry => entry.changePct > 0)
        .sort((a, b) => b.changePct - a.changePct)
        .slice(0, 5)
        .map(entry => ({
          tokenId: entry.id,
          symbol: entry.symbol,
          points: Math.round(entry.points),
          dir: 'UP' as const,
          changePct: entry.changePct
        }))

      const losers = entries
        .filter(entry => entry.changePct < 0)
        .sort((a, b) => a.changePct - b.changePct)
        .slice(0, 5)
        .map(entry => ({
          tokenId: entry.id,
          symbol: entry.symbol,
          points: Math.round(entry.points),
          dir: 'DOWN' as const,
          changePct: entry.changePct
        }))

      setGlobalHighlights({
        topGainers: gainers,
        topLosers: losers
      })
    } catch (err) {
      console.error('Failed to snapshot global highlights:', err)
    }
  }

  function handleLogout() {
    resetPersistentState()
    try { localStorage.removeItem('flipflop-user') } catch {}
    setUser(null)
    window.location.href = '/auth'
  }
  useEffect(() => {
    if (boostActive) {
      const interval = setInterval(() => setNow(Date.now()), 30000)
      return () => clearInterval(interval)
    }
  }, [boostActive])

  // Live price polling: fetch prices for tokens used in Active and Next Round
  useEffect(() => {
    const preloadIds = TOKENS.slice(0, 25).map(t => t.id)
    let cancelled = false

    async function preload() {
      try {
        const results = await Promise.all(preloadIds.map(async (id) => {
          try {
            const data = await getPrice(id)
            return [id, data] as const
          } catch {
            return null
          }
        }))
        if (cancelled) return
        setPrices(prev => {
          const next: Record<string,{p0:number;pLive:number;pClose:number;changePct?:number;source?:'dexscreener'|'fallback'}> = { ...prev }
          for (const entry of results) {
            if (!entry) continue
            const [id, data] = entry
            const prevEntry = next[id]
            const baseline = prevEntry?.p0 ?? data.p0 ?? data.pLive
            next[id] = {
              p0: baseline || data.pLive,
              pLive: data.pLive,
              pClose: data.pClose,
              changePct: data.changePct,
              source: data.source
            }
          }
          return next
        })
      } catch {}
    }

    preload()
    return () => { cancelled = true }
  }, [TOKENS])

  useEffect(() => {
    const ids = [
      ...active.map(p => p.tokenId),
      ...nextRound.filter(Boolean).map(p => (p as RoundPick).tokenId)
    ]
    const unique = Array.from(new Set(ids))
    if (unique.length === 0) return

    let cancelled = false

    async function refresh() {
      try {
        const entries = await Promise.all(unique.map(async (id) => {
          const r = await getPrice(id)
          return [id, r] as const
        }))
        if (!cancelled) {
          setPrices(prev => {
            const next: Record<string,{p0:number;pLive:number;pClose:number;changePct?:number;source?:'dexscreener'|'fallback'}> = { ...prev }
            for (const [id, data] of entries) {
              const prevEntry = next[id]
              const p0 = prevEntry?.p0 ?? data.p0 ?? data.pLive
              next[id] = {
                p0,
                pLive: data.pLive,
                pClose: data.pClose,
                changePct: data.changePct ?? prevEntry?.changePct,
                source: data.source ?? prevEntry?.source
              }
            }
            return next
          })
        }
      } catch {}
    }

    refresh()
    const handle = setInterval(refresh, 10000)
    return () => { cancelled = true; clearInterval(handle) }
  }, [active, nextRound])

  useEffect(()=>{
    const savedInventory = localStorage.getItem('flipflop-inventory')
    
    if (savedInventory) {
      setInventory(JSON.parse(savedInventory))
    }
    // Clear history for fresh start - Beta Round 1
    setHistory([])
    const savedHighlights = localStorage.getItem('flipflop-global-highlights')
    if (savedHighlights) {
      try {
        const parsed = JSON.parse(savedHighlights)
        if (parsed?.topGainers && parsed?.topLosers) {
          setGlobalHighlights({
            topGainers: Array.isArray(parsed.topGainers) ? parsed.topGainers : [],
            topLosers: Array.isArray(parsed.topLosers) ? parsed.topLosers : []
          })
        }
      } catch {}
    }
    setInventoryLoaded(true)
  },[])

  useEffect(()=>{
    if (!inventoryLoaded) return
    localStorage.setItem('flipflop-inventory', JSON.stringify(inventory))
  },[inventory, inventoryLoaded])

  useEffect(()=>{
    if (!inventoryLoaded) return
    localStorage.setItem('flipflop-history', JSON.stringify(history))
  },[history, inventoryLoaded])

  useEffect(() => {
    if (!stateLoaded) return
    try { localStorage.setItem('flipflop-global-highlights', JSON.stringify(globalHighlights)) } catch {}
  }, [globalHighlights, stateLoaded])

  useEffect(()=>{
    if (!stateLoaded) return
    localStorage.setItem('flipflop-current-round', currentRound.toString())
  },[currentRound, stateLoaded])

  // Persist active and nextRound to avoid losing state between page navigations
  useEffect(() => { if (!stateLoaded) return; try { localStorage.setItem('flipflop-active', JSON.stringify(active)) } catch {} }, [active, stateLoaded])
  useEffect(() => { if (!stateLoaded) return; try { localStorage.setItem('flipflop-next', JSON.stringify(nextRound)) } catch {} }, [nextRound, stateLoaded])
  useEffect(() => { // Combined state for compatibility
    if (!stateLoaded || !inventoryLoaded) return
    try {
      const combined = { active, nextRound, inventory }
      localStorage.setItem('flipflop_state', JSON.stringify(combined))
    } catch {}
  }, [active, nextRound, inventory, stateLoaded, inventoryLoaded])

  useEffect(()=>{
    // Only load existing pack; do not auto-create daily gifts
    const savedPack = localStorage.getItem('flipflop-current-pack')
    if (savedPack) {
      try { setCurrentPack(JSON.parse(savedPack)) } catch {}
    }
  }, [])

  function nextCount(tokenId: string) {
    return nextRound.filter(p => p && p.tokenId === tokenId).length
  }

  function openModal(slotIndex: number) {
    setModalOpen({open: true, type: 'select'})
  }

  function closeModal() {
    setModalOpen({open: false, type: 'select'})
    setModalSearch('')
  }

  function addToNextRound(tokenId: string) {
    // Find first empty slot
    const slotIndex = nextRound.findIndex(p => !p)
    if (slotIndex !== -1) {
      const newNextRound = [...nextRound]
      const currentCount = nextCount(tokenId)
      newNextRound[slotIndex] = {
        tokenId,
        dir: 'UP',
        duplicateIndex: currentCount + 1,
        locked: false
      }
      setNextRound(newNextRound)
      try { localStorage.setItem('flipflop-next', JSON.stringify(newNextRound)) } catch {}
      closeModal()
    } else {
      alert('All slots are filled! Remove a card first.')
  }
  }

  function removeFromNextRound(index: number) {
    const newNextRound = [...nextRound]
    newNextRound[index] = null
    setNextRound(newNextRound)
    try { localStorage.setItem('flipflop-next', JSON.stringify(newNextRound)) } catch {}
  }

  function toggleLock(index: number) {
    const newActive = [...active]
    const pick = newActive[index]
    if (pick && !pick.locked) {
      // Only allow locking, not unlocking
      pick.locked = true
      // Lock the current live price and current points
      const currentPrice = prices[pick.tokenId]?.pLive || 1.0
      const currentPoints = calculateLivePoints(pick)
      pick.pLock = currentPrice
      pick.pointsLocked = currentPoints // Lock the current points
      setActive(newActive)
      try { localStorage.setItem('flipflop-active', JSON.stringify(newActive)) } catch {}
    }
  }

  function calculateLivePoints(pick: RoundPick): number {
    const priceData = prices[pick.tokenId]
    if (!priceData) return 0
    
    // If the card is locked, always display the locked points
    if (pick.locked && pick.pointsLocked !== undefined) {
      return pick.pointsLocked
    }
    
    // Use the locked price if available; otherwise fall back to the round baseline price
    const p0 = pick.locked && pick.pLock ? pick.pLock : priceData.p0
    const pNow = priceData.pLive
    
    return calcPoints(p0, pNow, pick.dir, pick.duplicateIndex, boost.level, boostActive)
  }

  function openPack() {
    if (currentPack && !currentPack.opened) {
      const updatedPack = {...currentPack, opened: true}
      setCurrentPack(updatedPack)
      localStorage.setItem('flipflop-current-pack', JSON.stringify(updatedPack))
      setShowPackResults(true)
    }
  }

  function addPackToInventory() {
    if (currentPack && currentPack.opened) {
      const newInventory = {...inventory}
      currentPack.cards.forEach(cardId => {
        newInventory[cardId] = (newInventory[cardId] || 0) + 1
      })
      setInventory(newInventory)
      setShowPackResults(false)
    }
  }

  function calculateRoundResults(): RoundResult[] {
    return active
      .map(pick => {
        const priceData = prices[pick.tokenId]
        const token = getTokenById(pick.tokenId) || TOKENS[0]
        if (!token) return null // Skip if token not found
        
        if (!priceData) {
          return {
            tokenId: pick.tokenId,
            symbol: token.symbol,
            dir: pick.dir,
            points: 0,
            percentage: 0,
            duplicateIndex: pick.duplicateIndex
          }
        }
      
      let points: number
      let percentage: number
      
      if (pick.locked && pick.pointsLocked !== undefined) {
        // For locked cards, use the locked points and price baseline
        points = pick.pointsLocked
        const p0 = pick.pLock || priceData.p0
        const pClose = priceData.pClose
        percentage = ((pClose - p0) / p0) * 100
      } else {
        // For unlocked cards, calculate using the current UTC 00:00 price baseline
        const p0 = priceData.p0
        const pClose = priceData.pClose
        percentage = ((pClose - p0) / p0) * 100
        points = calcPoints(p0, pClose, pick.dir, pick.duplicateIndex, boost.level, boostActive)
      }
      
        return {
          tokenId: pick.tokenId,
          symbol: token.symbol,
          dir: pick.dir,
          points,
          percentage,
          duplicateIndex: pick.duplicateIndex
        }
      })
      .filter((result): result is RoundResult => result !== null)
  }

  async function simulateNewDay() {
    // For locked cards, use locked points. For unlocked cards, calculate using UTC 00:00 snapshot
    // First, update pClose to current price for unlocked cards (this is the UTC 00:00 snapshot)
    setPrices(prev => {
      const next: Record<string,{p0:number;pLive:number;pClose:number;changePct?:number;source?:'dexscreener'|'fallback'}> = { ...prev }
      // Update pClose for all active tokens to current live price (UTC 00:00 snapshot)
      for (const pick of active) {
        if (pick && !pick.locked && next[pick.tokenId]) {
          // For unlocked cards, pClose should be the current price at UTC 00:00
          next[pick.tokenId] = {
            ...next[pick.tokenId],
            pClose: next[pick.tokenId].pLive // Use current live price as close price for unlocked cards
          }
        }
      }
      return next
    })
    
    // Wait a bit for state to update, then calculate results
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Calculate round results before moving to next round
    const roundResults = calculateRoundResults()
    const totalPoints = roundResults.reduce((sum, result) => sum + result.points, 0)
    
    // Show round results popup
    setShowRoundResults({open: true, results: roundResults})
    
    // Increment round number
    setCurrentRound(prev => prev + 1)
    
    // Credit points balance - update server first, then update local state
    if (user && totalPoints !== 0) {
      try {
        const r = await fetch('/api/users/grant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, amount: totalPoints })
        })
        const j = await r.json()
        if (j?.ok && j?.bankPoints !== undefined) {
          setPoints(j.bankPoints)
          try {
            localStorage.setItem('flipflop-points', String(j.bankPoints))
          } catch {}
        } else {
          // Fallback: update local state if server update fails
          setPoints(p => p + totalPoints)
        }
      } catch (e) {
        console.error('Failed to credit points to server:', e)
        // Fallback: update local state if server update fails
        setPoints(p => p + totalPoints)
      }
    } else {
      // No user or no points to credit, just update local state
      setPoints(p => p + totalPoints)
    }

    snapshotGlobalHighlights()
    if (roundResults.length > 0) {
      const dayKey = utcDayKey(new Date())
      const entry: DayResult = {
        dayKey,
        total: totalPoints,
        items: roundResults.map(result => ({
          tokenId: result.tokenId,
          symbol: result.symbol,
          dir: result.dir,
          duplicateIndex: result.duplicateIndex,
          points: result.points
        }))
      }
      setHistory(prev => {
        const updated = [entry, ...prev]
        return updated.slice(0, 30)
      })
    }
    // Reset price baselines to current live for the new day
    setPrices(prev => {
      const next: Record<string,{p0:number;pLive:number;pClose:number;changePct?:number;source?:'dexscreener'|'fallback'}> = {}
      for (const [id, d] of Object.entries(prev)) {
        const val = d?.pLive ?? d?.p0 ?? 0
        next[id] = { p0: val, pLive: val, pClose: val, changePct: d?.changePct, source: d?.source }
      }
      return next
    })
    
    // Move next round to active round
    const validNextRound = nextRound.filter(p => p !== null) as RoundPick[]
    if (validNextRound.length > 0) {
      setActive(validNextRound)
    } else {
      setActive([])
      alert('You must set your next round picks to participate in the next round.')
    }
    
    // Clear next round
    setNextRound(Array(5).fill(null))
  }

  const filteredTokens = useMemo(() => {
    const q = modalSearch.toLowerCase();
    return TOKENS
      .map(tok => ({ tok, available: (inventory[tok.id] || 0) - nextCount(tok.id) }))
      .filter(({ tok }) => tok.symbol.toLowerCase().includes(q) || tok.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aOwn = a.available > 0 ? 1 : 0;
        const bOwn = b.available > 0 ? 1 : 0;
        if (bOwn !== aOwn) return bOwn - aOwn; // owned first
        if (b.available !== a.available) return b.available - a.available;
        return a.tok.symbol.localeCompare(b.tok.symbol);
      });
  }, [TOKENS, modalSearch, inventory, nextRound]);

  const highlightGainers = useMemo(() => globalHighlights.topGainers.slice(0, 5), [globalHighlights.topGainers])
  const highlightLosers = useMemo(() => globalHighlights.topLosers.slice(0, 5), [globalHighlights.topLosers])
  const formatHighlightPoints = (pts: number) => (pts > 0 ? `+${pts}` : pts.toString())
  const gainersDisplay = useMemo(() => {
    const items: (HighlightEntry | null)[] = [...highlightGainers]
    while (items.length < 5) items.push(null)
    return items
  }, [highlightGainers])
  const losersDisplay = useMemo(() => {
    const items: (HighlightEntry | null)[] = [...highlightLosers]
    while (items.length < 5) items.push(null)
    return items
  }, [highlightLosers])
  // Recent Rounds - Fresh start, no previous rounds
  const recentRounds = useMemo(() => {
    return [] // Empty for fresh start
  }, [])

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
          {user && <a className="tab" href="/profile">PROFILE</a>}
        </nav>
        <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
          <a 
            href="https://x.com/fliproyale" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'white',
              textDecoration: 'none',
              transition: 'all 0.3s',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
              e.currentTarget.style.transform = 'scale(1.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.transform = 'scale(1)'
            }}
            title="Follow us on X"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{display: 'block'}}>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
           {/* Daily free/opened pack removed in beta */}
           
                       {user ? (
             <div style={{display: 'flex', alignItems: 'center', gap: 12, flexDirection: 'column'}}>
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
                 
                 <div style={{
                   background: 'rgba(0,207,163,0.15)',
                   border: '1px solid rgba(0,207,163,0.25)',
                   borderRadius: 10,
                   padding: '6px 12px',
                   fontSize: 15,
                   fontWeight: 700,
                   color: '#86efac',
                   textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                   minWidth: 100,
                   textAlign: 'center'
                 }}>
                   {points.toLocaleString()} pts
                 </div>
               </div>
              
              <button
                onClick={handleLogout}
                 style={{
                   background: 'rgba(239,68,68,0.2)',
                   border: '1px solid rgba(239,68,68,0.3)',
                   color: '#fca5a5',
                   padding: '6px 12px',
                   borderRadius: 8,
                   fontSize: 13,
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
           ) : (
             <button
               onClick={() => window.location.href = '/auth'}
               style={{
                 background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                 border: 'none',
                 color: 'white',
                 padding: '10px 20px',
                 borderRadius: 10,
                 fontSize: 16,
                 fontWeight: 700,
                 cursor: 'pointer',
                 transition: 'all 0.3s',
                 boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
               }}
               onMouseEnter={(e) => {
                 e.currentTarget.style.transform = 'translateY(-2px)'
                 e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)'
               }}
               onMouseLeave={(e) => {
                 e.currentTarget.style.transform = 'translateY(0)'
                 e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)'
               }}
             >
               Login / Sign Up
             </button>
           )}
         </div>
      </header>

      <div style={{display:'grid', gridTemplateColumns:'250px 1fr 280px', gap:16, alignItems:'start'}}>
        {/* Left Sidebar: Common Pack */}
        <div className="panel" style={{padding:12, position:'sticky', top:16, alignSelf:'start', background:'linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.28))'}}>
          <div style={{textAlign:'center', marginBottom:6}}>
            <div style={{fontWeight:1000, letterSpacing:1, fontSize:18}}>COMMON PACK</div>
          </div>
          <div style={{
            padding:12,
            borderRadius:16,
            background:'linear-gradient(180deg,#0f172a,#0b1324)',
            boxShadow:'0 12px 26px rgba(0,0,0,.32), inset 0 0 0 1px rgba(255,255,255,.05)'
          }}>
            <div style={{
              position:'relative',
              width:'100%',
              paddingTop:'130%',
              borderRadius:16,
              background:'linear-gradient(180deg,#1e293b,#0f172a)',
              border:'2px solid rgba(255,255,255,0.08)',
              boxShadow:'0 16px 38px rgba(15,23,42,0.5)',
              overflow:'hidden'
            }}>
              <div style={{
                position:'absolute', inset:10,
                borderRadius:12,
                background:'linear-gradient(185deg,rgba(15,23,42,0.95),rgba(30,41,59,0.72))',
                border:'1px solid rgba(148,163,184,0.22)',
                boxShadow:'inset 0 3px 10px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.05)',
                display:'flex',
                alignItems:'center',
                justifyContent:'center'
              }}>
                <img src="/common-pack.jpg" alt="Common Pack" style={{width:'78%', height:'78%', objectFit:'cover', borderRadius:12, boxShadow:'0 8px 20px rgba(0,0,0,0.4)'}} />
              </div>
            </div>
            <div style={{textAlign:'center', marginTop:8, color:'#cbd5e1', fontWeight:800, fontSize:16}}>5000 POINTS</div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:6}}>
              <button className="btn" onClick={()=>setBuyQty(q=>Math.max(1, q-1))} style={{padding:'8px 12px', fontSize:14}}>-</button>
              <div style={{width:40, textAlign:'center', fontWeight:900, fontSize:16}}>{buyQty}</div>
              <button className="btn" onClick={()=>setBuyQty(q=>Math.min(10, q+1))} style={{padding:'8px 12px', fontSize:14}}>+</button>
            </div>
            <button className="btn" onClick={buyMysteryPacks} style={{
              marginTop:8,
              width:'100%',
              background:'linear-gradient(180deg,#ff2ea1,#e21b8d)',
              borderColor:'transparent',
              color:'#fff',
              fontWeight:900,
              fontSize:15,
              padding:'12px 0'
            }}>Buy</button>
          </div>
          <div style={{marginTop:10, fontSize:13, color:'var(--muted-inv)', textAlign:'center'}}>1 pack = 5 cards. Costs points.</div>
        </div>

        <div style={{display:'flex', flexDirection:'column', gap:16}}>
      {/* Active Round */}
      <div className="panel">
        <div className="row">
          <h2 style={{fontWeight:900, letterSpacing:1.2, textTransform:'uppercase', color:'#f8fafc', textShadow:'0 3px 10px rgba(0,0,0,0.35)'}}>Active Round - Beta #1</h2>
          {mounted && boostActive && (
            <span className="badge" style={{
              background: 'rgba(0,207,163,.2)',
              borderColor: 'rgba(0,207,163,.3)',
              color: '#86efac',
              fontSize: 14
            }}>
              Boost ends in: {formatRemaining(boost.endAt! - now)}
            </span>
          )}
        </div>
        <div className="sep"></div>

        {/* Starter Reward Banner */}
        {starterAvailable && (
          <div className="panel" style={{marginBottom: 12, background:'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(132,204,22,0.15))', border:'1px solid rgba(34,197,94,0.3)'}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
              <div style={{fontWeight:900, color:'#bbf7d0'}}>🎁 Starter Reward available: 50,000 points + 1 Common Pack</div>
              <button className="btn primary" onClick={() => claimStarterReward()}>Claim</button>
            </div>
          </div>
        )}

        <div className="picks" style={{display:'grid', gridTemplateColumns:'repeat(5, minmax(160px, 1fr))', gap:14}}>
              {active.map((p, index) => {
                const tok = getTokenById(p.tokenId) || TOKENS[0]
                if (!tok) return null // Safety check for filtered tokens
                const price = prices[p.tokenId]
                const points = price ? calcPoints(price.p0, price.pLive, p.dir, p.duplicateIndex, boost.level, boostActive) : 0
                
              return (
                  <div key={index} style={{
                    background: `linear-gradient(135deg, ${getGradientColor(index)}, ${getGradientColor(index + 1)})`,
                    borderRadius: 18,
                    padding: 14,
                    position: 'relative',
                    minHeight: 220,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    border: '1px solid rgba(255,255,255,0.2)',
                    boxShadow: '0 8px 26px rgba(0,0,0,0.18), 0 3px 16px rgba(0,0,0,0.12)',
                    transition: 'all 0.3s ease',
                    transform: 'translateY(0)',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)'
                    e.currentTarget.style.boxShadow = '0 16px 40px rgba(0,0,0,0.25), 0 6px 20px rgba(0,0,0,0.15)'
                    e.currentTarget.style.border = '1px solid rgba(255,255,255,0.32)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 8px 26px rgba(0,0,0,0.18), 0 3px 16px rgba(0,0,0,0.12)'
                    e.currentTarget.style.border = '1px solid rgba(255,255,255,0.2)'
                  }}>
                    
                    {p.locked && (
                      <div style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        background: '#fbbf24',
                        color: '#000',
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 700,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.25)'
                      }}>
                        🔒
                      </div>
                    )}
                    
                    {p.duplicateIndex > 1 && (
                      <div style={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        background: 'rgba(0,0,0,0.7)',
                        color: 'white',
                        padding: '3px 7px',
                        borderRadius: 6,
                        fontSize: 12,
                        border: '1px solid rgba(255,255,255,0.3)',
                        fontWeight: 600
                      }}>
                        dup x{p.duplicateIndex}
                      </div>
                    )}
                    
                    <div style={{
                      width: 100,
                      height: 100,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 14px',
                      border: '2px solid rgba(255,255,255,0.22)',
                      boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      <img
                        src={tok.logo}
                        alt={tok.symbol}
                        style={{
                          width: 92,
                          height: 92,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          position: 'relative',
                          zIndex: 2,
                          border: '2px solid rgba(255,255,255,0.2)'
                        }}
                        onError={handleImageFallback}
                      />
                    </div>
                    
                    <div style={{textAlign: 'center'}}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: 900,
                        color: 'white',
                        textShadow: '0 2px 4px rgba(0,0,0,0.35)',
                        marginBottom: 4,
                        letterSpacing: 0.4
                      }}>
                        {tok.symbol}
                      </div>
                      <div style={{
                        fontSize: 13,
                        color: 'rgba(255,255,255,0.82)',
                        marginBottom: 6,
                        fontWeight: 600,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase'
                      }}>
                        {tok.about}
                      </div>
                      
                      <div style={{display: 'flex', gap: 6, marginBottom: 8, justifyContent: 'center'}}>
                        <button className={`btn ${p.dir==='UP'?'btn-up active':''}`} style={{fontSize: 13, padding: '6px 10px', fontWeight: 600}}>
                          ▲ UP
                        </button>
                        <button className={`btn ${p.dir==='DOWN'?'btn-down active':''}`} style={{fontSize: 13, padding: '6px 10px', fontWeight: 600}}>
                          ▼ DOWN
                        </button>
                      </div>
                      
                      {!p.locked ? (
                        <button 
                          className="btn" 
                          style={{fontSize: 13, padding: '6px 10px', marginBottom: 8, fontWeight: 600}}
                          onClick={() => toggleLock(index)}
                        >
                          Lock
                        </button>
                      ) : (
                        <div style={{
                          fontSize: 12, 
                          padding: '5px 9px', 
                          marginBottom: 8, 
                          fontWeight: 600,
                          color: '#fbbf24',
                          textAlign: 'center'
                        }}>
                          🔒 Locked
                        </div>
                      )}
                      
                      <div style={{
                        background: 'rgba(0,0,0,0.25)',
                        color: 'white',
                        padding: '6px 10px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 4
                      }}>
                        {p.locked ? '🔒 Locked Points: ' : 'Live Points: '}
                        {(() => {
                          try {
                            const live = calculateLivePoints(p)
                            return live > 0 ? `+${live}` : live
                          } catch {
                            return 0
                          }
                        })()}
                      </div>
                      
                      {p.duplicateIndex > 1 && (
                        <div style={{
                          background: 'rgba(0,0,0,0.2)',
                          color: 'white',
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600
                        }}>
                          Applied: Boost x{boostActive && boost.level ? (boost.level === 100 ? 2 : 1.5) : 1}
                        </div>
                      )}
                  </div>
                </div>
              )
            })}
          </div>
      </div>

        {/* Next Round */}
      <div className="panel">
        <h2 style={{fontWeight:900, letterSpacing:1.2, textTransform:'uppercase', color:'#f8fafc', textShadow:'0 3px 10px rgba(0,0,0,0.35)'}}>Next Round - Beta #1</h2>
        <div className="sep"></div>
        
        <div className="picks" style={{display:'grid', gridTemplateColumns:'repeat(5, minmax(160px, 1fr))', gap:14}}>
           {Array.from({ length: 5 }, (_, index) => {
             const p = nextRound[index]
             
             if (p) {
               const tok = getTokenById(p.tokenId) || TOKENS[0]
               if (!tok) return null // Safety check
               
            return (
                <div key={index} style={{
                   background: `linear-gradient(135deg, ${getGradientColor(index)}, ${getGradientColor(index + 1)})`,
                   borderRadius: 18,
                  padding: 14,
                   position: 'relative',
                  minHeight: 220,
                   display: 'flex',
                   flexDirection: 'column',
                   justifyContent: 'space-between',
                   border: '1px solid rgba(255,255,255,0.2)',
                   boxShadow: '0 8px 26px rgba(0,0,0,0.18), 0 3px 16px rgba(0,0,0,0.12)',
                   cursor: 'pointer'
                 }}>
                   
                   {/* Duplicate badge */}
                   {p.duplicateIndex > 1 && (
                    <div style={{
                       position: 'absolute',
                       top: 12,
                       left: 12,
                       background: 'rgba(0,0,0,0.7)',
                       color: 'white',
                       padding: '4px 8px',
                       borderRadius: 6,
                      fontSize: 12,
                       border: '1px solid rgba(255,255,255,0.3)',
                       fontWeight: 600
                     }}>
                       dup x{p.duplicateIndex}
          </div>
        )}

                  <div style={{
                    width: 100,
                    height: 100,
                     borderRadius: '50%',
                     background: 'rgba(255,255,255,0.15)',
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                     margin: '0 auto 14px',
                    border: '2px solid rgba(255,255,255,0.22)',
                     boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
                     position: 'relative',
                     overflow: 'hidden'
                   }}>
                     <img
                       src={tok.logo}
                       alt={tok.symbol}
                       style={{
                       width: 92,
                       height: 92,
                         borderRadius: '50%',
                         objectFit: 'cover',
                         position: 'relative',
                         zIndex: 2,
                         border: '2px solid rgba(255,255,255,0.2)'
                      }}
                      onError={handleImageFallback}
                     />
      </div>

                  <div style={{textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
                    <div>
                      <div style={{fontSize: 16, fontWeight: 900, color: 'white', marginBottom: 4, textShadow: '0 2px 4px rgba(0,0,0,0.5)', letterSpacing: 0.5}}>
                         {tok.symbol}
                       </div>
                      <div style={{fontSize: 11, color: 'rgba(255,255,255,0.82)', marginBottom: 8, lineHeight: 1.4, fontWeight: 600, letterSpacing: 0.4}}>
                         {tok.about}
                       </div>
                     </div>
                     
                    <div style={{marginBottom: 12}}>
                      <div style={{display: 'flex', gap: 8, marginBottom: 10, justifyContent: 'center'}}>
                         <button 
                           className={`btn ${p.dir==='UP'?'btn-up active':''}`} 
                          style={{fontSize: 13, padding: '8px 14px', fontWeight: 600}}
                           onClick={() => {
                             const newNextRound = [...nextRound]
                             newNextRound[index].dir = 'UP'
                             setNextRound(newNextRound)
                           }}
                         >
                           ▲ UP
                         </button>
                         <button 
                           className={`btn ${p.dir==='DOWN'?'btn-down active':''}`} 
                          style={{fontSize: 13, padding: '8px 14px', fontWeight: 600}}
                           onClick={() => {
                             const newNextRound = [...nextRound]
                             newNextRound[index].dir = 'DOWN'
                             setNextRound(newNextRound)
                           }}
                         >
                           ▼ DOWN
                         </button>
                       </div>
                       
                       <button 
                         className="btn" 
                        style={{fontSize: 10, padding: '6px 12px', fontWeight: 600}}
                         onClick={() => removeFromNextRound(index)}
                       >
                         Remove
                       </button>
                     </div>
                   </div>
              </div>
            )
             } else {
               // Empty slot
               return (
                 <div key={index} style={{
                   border: '2px dashed rgba(255,255,255,0.3)',
                   background: 'rgba(255,255,255,0.05)',
                   borderRadius: 20,
                   padding: 24,
                   cursor: 'pointer',
                   display: 'flex',
                   flexDirection: 'column',
                   alignItems: 'center',
                   justifyContent: 'center',
                   gap: 12,
                  minHeight: 240,
                   transition: 'all 0.3s ease'
                 }}
                 onClick={() => setModalOpen({open: true, type: 'select'})}
                 onMouseEnter={(e) => {
                   e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                   e.currentTarget.style.border = '2px dashed rgba(255,255,255,0.5)';
                 }}
                 onMouseLeave={(e) => {
                   e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                   e.currentTarget.style.border = '2px dashed rgba(255,255,255,0.3)';
                 }}>
                   <div style={{
                    width: 56,
                    height: 56,
                     borderRadius: '50%',
                     background: 'rgba(255,255,255,0.1)',
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                    fontSize: 22,
                     color: 'white',
                     border: '2px solid rgba(255,255,255,0.2)'
                   }}>
                     +
                   </div>
                   <div style={{
                    fontSize: 14,
                     fontWeight: 700,
                     color: 'white',
                     textAlign: 'center'
                   }}>
                     Add Card
                   </div>
                   <div style={{
                    fontSize: 11,
                     color: 'rgba(255,255,255,0.7)',
                     textAlign: 'center'
                   }}>
                     Select from inventory
                   </div>
                 </div>
               )
             }
          })}
        </div>
      </div>

      {/* Recent Rounds */}
      <div className="panel">
        <div className="row">
          <h2>Recent Rounds</h2>
          <a href="/history" className="tab" style={{padding:'6px 12px', borderRadius:8, background:'rgba(255,255,255,0.08)', fontSize:12}}>
            View All
          </a>
        </div>
        <div className="sep"></div>

        {recentRounds.length === 0 ? (
          <div style={{textAlign:'center', padding:32, color:'var(--muted-inv)'}}>
            Complete a round to see your recent performance.
          </div>
        ) : (
          <div style={{display:'flex', flexDirection:'column', gap:16}}>
            {recentRounds.map((round, idx) => {
              const totalPositive = round.total >= 0
              return (
                <div key={`${round.dayKey}-${idx}`} style={{
                  background:'rgba(255,255,255,0.05)',
                  borderRadius:12,
                  border:'1px solid rgba(255,255,255,0.1)',
                  padding:20
                }}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
                    <div style={{display:'flex', alignItems:'center', gap:12}}>
                      <div style={{fontWeight:900, fontSize:16}}>Round #{idx + 1}</div>
                      <span className="badge" style={{
                        background: totalPositive ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.2)',
                        borderColor: totalPositive ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)',
                        color: totalPositive ? '#86efac' : '#fca5a5'
                      }}>
                        {totalPositive ? '+' : ''}{round.total} pts
                      </span>
                    </div>
                    <div style={{fontSize:12, color:'var(--muted-inv)'}}>
                      {round.dayKey}
                    </div>
                  </div>

                  <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
                    {round.items.map((item, cardIdx) => {
                      const itemPositive = item.points >= 0
                      return (
                        <div key={cardIdx} style={{
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
        )}
      </div>

      {/* Previous Rounds */}
      <div className="panel">
         <h2>Previous Rounds</h2>
         <div className="sep"></div>
         
         {recentRounds.length === 0 ? (
           <div style={{
             textAlign: 'center',
             padding: '40px 20px',
             color: 'rgba(255,255,255,0.6)',
             fontSize: 14
           }}>
             Complete a round to see your recent performance.
           </div>
         ) : (
           recentRounds.map((round, idx) => (
             <div key={idx} style={{
               background: 'rgba(255,255,255,0.05)',
               borderRadius: 16,
               padding: 20,
               marginBottom: 16,
               border: '1px solid rgba(255,255,255,0.1)'
             }}>
               <div style={{
                 display: 'flex',
                 justifyContent: 'space-between',
                 alignItems: 'center',
                 marginBottom: 16
               }}>
                 <div style={{
                   fontSize: 18,
                   fontWeight: 700,
                   color: 'white'
                 }}>
                   Beta round {round.roundNumber}
                 </div>
                 <div style={{
                   fontSize: 14,
                   color: 'rgba(255,255,255,0.7)'
                 }}>
                   {round.date}
                 </div>
               </div>
               {/* Round content here */}
             </div>
           ))
         )}
       </div>

       </div>

       <aside style={{position:'sticky', top:16}}>
         <div style={{
           background: 'rgba(15,23,42,0.55)',
           border: '1px solid rgba(255,255,255,0.08)',
           borderRadius: 16,
           padding: 16,
           display: 'flex',
           flexDirection: 'column',
           gap: 14,
           boxShadow: '0 10px 30px rgba(0,0,0,0.25)'
         }}>
           <div style={{fontSize: 13, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', color: '#e0f2fe'}}>
             Global Movers · Beta #1
           </div>
           
           <div>
             <div style={{fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#bbf7d0', marginBottom: 8}}>
               Top Gainers
             </div>
             {gainersDisplay.map((entry, idx) => {
               const tok = entry ? (getTokenById(entry.tokenId) || TOKENS[0]) : null
            return (
                 <div key={`gainer-${entry ? entry.tokenId : idx}`} style={{
                   display: 'flex',
                   alignItems: 'center',
                   gap: 8,
                   padding: '6px 10px',
                   borderRadius: 10,
                   background: 'rgba(34,197,94,0.12)',
                   border: '1px solid rgba(34,197,94,0.25)',
                   marginBottom: 6,
                   opacity: entry ? 1 : 0.45
                 }}>
                   <span style={{width: 16, fontSize: 11, fontWeight: 700, color: '#bbf7d0'}}>{idx + 1}</span>
                   <div style={{
                     width: 30,
                     height: 30,
                     borderRadius: '50%',
                     overflow: 'hidden',
                     border: '1px solid rgba(255,255,255,0.2)',
                     background: 'rgba(255,255,255,0.06)',
                     display: 'grid',
                     placeItems: 'center'
                   }}>
                     {tok && <img src={tok.logo} alt={tok.symbol} style={{width: '100%', height: '100%', objectFit: 'cover'}} onError={handleImageFallback} />}
                </div>
                   <div style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
                     <span style={{fontWeight: 700, color: '#ecfccb', fontSize: 13}}>{tok ? tok.symbol : '—'}</span>
                     <span style={{fontSize: 10, color: 'rgba(255,255,255,0.7)'}}>
                       {entry ? `${entry.changePct >= 0 ? '▲' : '▼'} ${entry.changePct.toFixed(2)}%` : 'Awaiting data'}
                     </span>
                   </div>
                   <span style={{fontWeight: 700, color: '#bbf7d0', fontSize: 12}}>
                     {entry ? `${formatHighlightPoints(entry.points)} pts` : '—'}
                   </span>
              </div>
            )
          })}
        </div>
           
           <div>
             <div style={{fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#fecaca', marginBottom: 8}}>
               Top Losers
      </div>
             {losersDisplay.map((entry, idx) => {
               const tok = entry ? (getTokenById(entry.tokenId) || TOKENS[0]) : null
               return (
                 <div key={`loser-${entry ? entry.tokenId : idx}`} style={{
                   display: 'flex',
                   alignItems: 'center',
                   gap: 8,
                   padding: '6px 10px',
                   borderRadius: 10,
                   background: 'rgba(248,113,113,0.12)',
                   border: '1px solid rgba(248,113,113,0.25)',
                   marginBottom: 6,
                   opacity: entry ? 1 : 0.45
                 }}>
                   <span style={{width: 16, fontSize: 11, fontWeight: 700, color: '#fecaca'}}>{idx + 1}</span>
                   <div style={{
                     width: 30,
                     height: 30,
                     borderRadius: '50%',
                     overflow: 'hidden',
                     border: '1px solid rgba(255,255,255,0.2)',
                     background: 'rgba(255,255,255,0.06)',
                     display: 'grid',
                     placeItems: 'center'
                   }}>
                     {tok && <img src={tok.logo} alt={tok.symbol} style={{width: '100%', height: '100%', objectFit: 'cover'}} onError={handleImageFallback} />}
                   </div>
                   <div style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
                     <span style={{fontWeight: 700, color: '#fee2e2', fontSize: 13}}>{tok ? tok.symbol : '—'}</span>
                     <span style={{fontSize: 10, color: 'rgba(255,255,255,0.7)'}}>
                       {entry ? `${entry.changePct >= 0 ? '▲' : '▼'} ${entry.changePct.toFixed(2)}%` : 'Awaiting data'}
                     </span>
                   </div>
                   <span style={{fontWeight: 700, color: '#fecaca', fontSize: 12}}>
                     {entry ? `${formatHighlightPoints(entry.points)} pts` : '—'}
                   </span>
                 </div>
               )
             })}
           </div>
         </div>
       </aside>

      </div>

       {/* Select Card Modal */}
      {modalOpen.open && modalOpen.type === 'select' && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth: 1100, width: '96%'}}>
            <div className="modal-header">
              <h3 style={{color: 'white', fontSize: 20, fontWeight: 700}}>Select a Card</h3>
              <button onClick={closeModal} style={{background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer'}}>×</button>
            </div>
            
            <input
              type="text"
              placeholder="Search tokens..."
              value={modalSearch}
              onChange={(e) => setModalSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)',
                color: 'white',
                fontSize: 16,
                marginBottom: 16
              }}
            />
            
            <div className="modal-grid" style={{maxHeight: '520px', overflowY: 'auto'}}>
              {filteredTokens.map(({ tok, available }) => {
                
                return (
                  <div 
                    key={tok.id} 
                    className="modal-card"
                    style={{
                      cursor: available > 0 ? 'pointer' : 'not-allowed',
                      opacity: available > 0 ? 1 : 0.5
                    }}
                    onClick={() => available > 0 && addToNextRound(tok.id)}
                    title={available <= 0 ? 'No copies left today' : ''}
                  >
                    <div style={{
                      width: 104,
                      height: 104,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.1)',
                      border: '3px solid rgba(255,255,255,0.25)',
                      boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
                      marginBottom: 14,
                      position: 'relative',
                      overflow: 'hidden',
                      display: 'grid',
                      placeItems: 'center'
                    }}>
                      <img
                        src={tok.logo}
                        alt={tok.symbol}
                        style={{
                          width: 100,
                          height: 100,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          display: 'block'
                        }}
                        onError={handleImageFallback}
                      />
                      <div style={{
                        width: 88,
                        height: 88,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 32,
                        fontWeight: 900,
                        color: 'white',
                        textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 1
                      }}></div>
                    </div>
                    
                    <div style={{fontSize: 16, fontWeight: 800, color: 'white', marginBottom: 6}}>
                      {tok.symbol}
                    </div>
                    
                    <div style={{
                      fontSize: 12,
                      color: available > 0 ? '#86efac' : '#fca5a5',
                      fontWeight: 700
                    }}>
                      Left for next: {available}
                    </div>
                    
                    <button 
                      className="btn" 
                      style={{fontSize: 15, padding: '10px 18px', marginTop: 10}}
                      disabled={available <= 0}
                    >
                      Use
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Pack Results Modal */}
      {showPackResults && currentPack && (
        <div className="modal-backdrop" onClick={() => setShowPackResults(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{maxWidth: 1100, width: '96%'}}>
            <div className="modal-header">
              <h3 style={{color: 'white', fontSize: 20, fontWeight: 700}}>Pack Results</h3>
              <button onClick={() => setShowPackResults(false)} style={{background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer'}}>×</button>
            </div>
            
            {/* Tear strip animation */}
            <div style={{
              height: 8,
              width: '100%',
              background: 'linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 100%)',
              borderRadius: 4,
              marginBottom: 12,
              position: 'relative',
              overflow: 'hidden',
              animation: 'tear-move 450ms ease-out'
            }} />

            <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 20, marginBottom: 24}}>
              {currentPack.cards.map((cardId, index) => {
                const tok = getTokenById(cardId) || TOKENS[0]
                
                return (
                  <div key={index} style={{
                    background: `linear-gradient(135deg, ${getGradientColor(index)}, ${getGradientColor(index + 1)})`,
                    borderRadius: 24,
                    padding: 28,
                    position: 'relative',
                    minHeight: 320,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    border: '2px solid rgba(255,255,255,0.18)',
                    boxShadow: '0 16px 48px rgba(0,0,0,0.22), 0 6px 24px rgba(0,0,0,0.12)',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: 'translateY(0)',
                    animation: `card-fly-in 400ms ease-out ${(index)*120}ms both`,
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-8px) scale(1.03)';
                    e.currentTarget.style.boxShadow = '0 22px 66px rgba(0,0,0,0.28), 0 10px 34px rgba(0,0,0,0.16)';
                    e.currentTarget.style.border = '2px solid rgba(255,255,255,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 16px 48px rgba(0,0,0,0.22), 0 6px 24px rgba(0,0,0,0.12)';
                    e.currentTarget.style.border = '2px solid rgba(255,255,255,0.15)';
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      background: '#fbbf24',
                      color: '#000',
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                    }}>
                      New Card!
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
                      width: 140,
                      height: 140,
                        background: 'rgba(255,255,255,0.12)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      border: '4px solid rgba(255,255,255,0.25)',
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
                        width: 120,
                        height: 120,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
                            position: 'relative',
                            zIndex: 2,
                        border: '3px solid rgba(255,255,255,0.25)'
                          }}
                        onError={handleImageFallback}
                        />
                      </div>
                    </div>
                    
                    {/* Token info */}
                    <div style={{textAlign: 'center', marginTop: 16}}>
                      <div style={{
                        fontSize: 24,
                        fontWeight: 900,
                        color: 'white',
                        textShadow: '0 3px 8px rgba(0,0,0,0.45)',
                        marginBottom: 6,
                        letterSpacing: 1.2,
                        textTransform: 'uppercase'
                      }}>
                        {tok.symbol}
                      </div>
                      <div style={{
                        fontSize: 15,
                        color: 'rgba(255,255,255,0.9)',
                        marginBottom: 6,
                        fontWeight: 600
                      }}>
                        {tok.name}
                      </div>
                      {tok.about && (
                        <div style={{
                          fontSize: 11,
                          color: 'rgba(255,255,255,0.75)',
                          letterSpacing: 2,
                          textTransform: 'uppercase'
                        }}>
                          {tok.about}
                        </div>
                      )}
                    </div>
    </div>
  )
              })}
            </div>
            
            <div style={{textAlign: 'center'}}>
              <button 
                className="btn primary big" 
                onClick={addPackToInventory}
                style={{marginRight: 12}}
              >
                Add to Inventory
              </button>
              <button 
                className="btn" 
                onClick={() => setShowPackResults(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mystery Pack Results Modal */}
      {showMysteryResults.open && (
        <div className="modal-backdrop" onClick={()=>setShowMysteryResults({open:false, cards:[]})}>
          <div className="modal" onClick={(e)=>e.stopPropagation()} style={{maxWidth: 900, width:'96%'}}>
            <div className="modal-header">
              <h3 style={{
                color:'white',
                fontSize:26,
                fontWeight:800,
                textTransform:'uppercase',
                letterSpacing:1.2,
                textShadow:'0 4px 12px rgba(0,0,0,0.45)'
              }}>Mystery Pack Results</h3>
              <button onClick={()=>setShowMysteryResults({open:false, cards:[]})} style={{background:'none', border:'none', color:'white', fontSize:20, cursor:'pointer'}}>×</button>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:12, marginBottom:16}}>
              {showMysteryResults.cards.map((id, idx)=>{
                const tok = getTokenById(id) || TOKENS[0]
                return (
                  <div key={idx} style={{
                    background:`linear-gradient(135deg, ${getGradientColor(idx)}, ${getGradientColor(idx+1)})`,
                    borderRadius:16,
                    padding:20,
                    display:'flex', flexDirection:'column', alignItems:'center', gap:10,
                    border:'1px solid rgba(255,255,255,.22)',
                    boxShadow:'0 14px 32px rgba(0,0,0,0.28)'
                  }}>
                    <div style={{width:100,height:100,borderRadius:'50%',overflow:'hidden',border:'3px solid rgba(255,255,255,.3)',display:'grid',placeItems:'center',boxShadow:'0 6px 18px rgba(0,0,0,0.35)'}}>
                      <img
                        src={tok.logo}
                        alt={tok.symbol}
                        style={{width:94,height:94,borderRadius:'50%',objectFit:'cover'}}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.style.display = 'none'
                          const parent = target.parentElement
                          if (parent) {
                            parent.innerHTML = `<div style="font-size: 36px; font-weight: 900; color: white; text-shadow: 0 3px 8px rgba(0,0,0,0.45);">${tok.symbol.charAt(0)}</div>`
                          }
                        }}
                      />
                    </div>
                    <div style={{textAlign:'center'}}>
                      <div style={{
                        fontWeight:900,
                        color:'#fff',
                        fontSize:18,
                        letterSpacing:1,
                        textTransform:'uppercase',
                        textShadow:'0 3px 8px rgba(0,0,0,0.4)'
                      }}>{tok.symbol}</div>
                      <div style={{
                        color:'rgba(255,255,255,0.9)',
                        fontSize:13,
                        fontWeight:600,
                        marginTop:4
                      }}>{tok.name}</div>
                      {tok.about && (
                        <div style={{
                          color:'rgba(255,255,255,0.75)',
                          fontSize:11,
                          letterSpacing:1.5,
                          marginTop:2,
                          textTransform:'uppercase'
                        }}>{tok.about}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{textAlign:'center'}}>
              <button className="btn primary" onClick={addMysteryToInventory} style={{marginRight:8}}>Add to Inventory</button>
              <button className="btn" onClick={()=>setShowMysteryResults({open:false, cards:[]})}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Round Results Modal */}
      {showRoundResults.open && (
        <div className="modal-backdrop" onClick={() => setShowRoundResults({open: false, results: []})}>
          <div className="modal" style={{
            background: 'linear-gradient(180deg, rgba(5,15,12,0.95), rgba(4,12,10,0.95))',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 24,
            padding: 28,
            maxWidth: 820,
            width: '92%',
            maxHeight: '82vh',
            overflow: 'auto',
            position: 'relative',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)'
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24}}>
              <h2 style={{color: 'white', margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: 0.2}}>🎯 Round Results</h2>
              <button 
                onClick={() => setShowRoundResults({open: false, results: []})} 
                style={{background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer'}}
              >
                ×
              </button>
            </div>

            <div style={{marginBottom: 24}}>
              {showRoundResults.results.map((result, index) => {
                const token = getTokenById(result.tokenId) || TOKENS[0]
                return (
                  <div key={index} style={{
                    background: `linear-gradient(135deg, ${getGradientColor(index)}, ${getGradientColor(index + 1)})`,
                    borderRadius: 18,
                    padding: 16,
                    marginBottom: 14,
                    border: '1px solid rgba(255,255,255,0.22)',
                    display: 'grid',
                    gridTemplateColumns: '64px 1fr 120px',
                    alignItems: 'center',
                    gap: 18,
                    boxShadow: '0 10px 28px rgba(0,0,0,0.25)'
                  }}>
                    {/* Token logo */}
                    <div style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid rgba(255,255,255,0.25)'
                    }}>
                      <img
                        src={token.logo}
                        alt={token.symbol}
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: '50%',
                          objectFit: 'cover'
                        }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.innerHTML = `<div style="font-size: 20px; font-weight: 900; color: white;">${token.symbol.charAt(0)}</div>`;
                          }
                        }}
                      />
                    </div>

                    {/* Token info */}
                    <div style={{flex: 1}}>
                      <div style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: 'white',
                        marginBottom: 4,
                        letterSpacing: 0.2
                      }}>
                        {token.symbol}
                      </div>
                      <div style={{
                        fontSize: 12,
                        color: 'rgba(255,255,255,0.8)',
                        marginBottom: 4
                      }}>
                        {result.dir === 'UP' ? '▲ UP' : '▼ DOWN'} • {result.percentage > 0 ? '+' : ''}{result.percentage.toFixed(2)}%
                      </div>
                    </div>

                    {/* Points */}
                    <div style={{
                      fontSize: 20,
                      fontWeight: 900,
                      color: result.points >= 0 ? '#00cfa3' : '#ef4444',
                      textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                      textAlign: 'right'
                    }}>
                      {result.points > 0 ? '+' : ''}{result.points}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Total Points */}
            <div style={{
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 18,
              padding: 22,
              textAlign: 'center',
              marginBottom: 24,
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <div style={{
                fontSize: 15,
                color: 'rgba(255,255,255,0.8)',
                marginBottom: 8
              }}>
                Total Points
              </div>
              <div style={{
                fontSize: 38,
                fontWeight: 900,
                 color: (() => {
                   const total = showRoundResults.results.reduce((sum, result) => sum + result.points, 0)
                   return total >= 0 ? '#00cfa3' : '#ef4444'
                 })(),
                 textShadow: '0 2px 8px rgba(0,0,0,0.4)'
               }}>
                 {(() => {
                   const total = showRoundResults.results.reduce((sum, result) => sum + result.points, 0)
                   return total > 0 ? `+${total}` : total
                 })()}
               </div>
            </div>

            <div style={{textAlign: 'center'}}>
              <button 
                className="btn primary big" 
                onClick={() => setShowRoundResults({open: false, results: []})}
              >
                Continue to Next Round
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  )
}
