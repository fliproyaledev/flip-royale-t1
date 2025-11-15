import { useEffect, useState } from 'react'
import ThemeToggle from '../components/ThemeToggle'

export default function Guide(){
  const [user, setUser] = useState<any>(null)
  useEffect(()=>{ try { const s = localStorage.getItem('flipflop-user'); if (s) setUser(JSON.parse(s)) } catch {}
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
          <a className="tab active" href="/guide">GUIDE</a>
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
        </div>
      </header>

      <div className="panel" style={{maxWidth:900}}>
        <h2>🎮 How to Play FLIP ROYALE</h2>
        <div className="sep"></div>
        
        <h3>Getting Started</h3>
        <ul>
          <li><b>Create Your Profile</b>: Go to the PLAY page, register with a username and wallet address. New players start with <b>50,000 points</b> and <b>1 Common Pack</b>.</li>
          <li><b>Understanding Cards</b>: Each card represents a cryptocurrency token on Base network. Cards are tied to specific token trading pairs on Dexscreener.</li>
          <li><b>Opening Packs</b>: Use your packs to get new cards. You can view all your cards in the INVENTORY page.</li>
        </ul>

        <h3>🎯 Main Game (PLAY Mode)</h3>
        <ul>
          <li><b>Select 5 Cards</b>: Choose 5 cards from your inventory for the Active Round.</li>
          <li><b>Choose Direction</b>: For each card, predict if the price will go <b>UP</b> or <b>DOWN</b>.</li>
          <li><b>Daily Reset</b>: Every day at <b>00:00 UTC</b>, a new round begins. The baseline price (p0) is set at midnight UTC.</li>
          <li><b>Scoring System</b>:
            <ul>
              <li>Each <b>+1%</b> price move = <b>+100 points</b></li>
              <li>Each <b>-1%</b> price move = <b>-100 points</b></li>
              <li>If you chose <b>DOWN</b>, the points are flipped (you gain when price drops, lose when it rises)</li>
            </ul>
          </li>
          <li><b>Duplicate Cards</b>: Using the same card multiple times affects your score:
            <ul>
              <li>1st copy: 100% points (normal)</li>
              <li>2nd copy: 75% points if positive, 125% loss if negative</li>
              <li>3rd copy: 50% points if positive, 150% loss if negative</li>
              <li>4th copy: 25% points if positive, 175% loss if negative</li>
              <li>5th copy: 0% points if positive, 200% loss if negative</li>
            </ul>
          </li>
          <li><b>Lock Feature</b>: You can lock a card anytime during the day to freeze its current 24h% change and protect your score. Locked cards are scored immediately. Unlocked cards settle automatically at the next 00:00 UTC.</li>
        </ul>

        <h3>📊 Daily Scoring & Leaderboard</h3>
        <ul>
          <li><b>Automatic Settlement</b>: At 00:00 UTC, all unlocked cards are automatically scored based on their 24h price change.</li>
          <li><b>Point Protection</b>: Your total points never decrease! Negative rounds are logged in your history but don't reduce your total score. Only positive points are added.</li>
          <li><b>Daily Bonuses</b>: Top 20 players each day receive bonus points distributed by rank. Check the LEADERBOARD to see your ranking and bonuses.</li>
          <li><b>View Your History</b>: Check the HISTORY page to see all your past rounds and performance.</li>
        </ul>

        <h3>⚔️ Arena Mode (1v1 Duels)</h3>
        <ul>
          <li><b>How It Works</b>: Challenge other players in head-to-head matches!</li>
          <li><b>Entry Fee</b>: Each Arena match costs <b>2,500 points</b> to enter.</li>
          <li><b>Daily Rooms</b>: 25 new rooms are created automatically every day at 00:00 UTC. Rooms are numbered "Room 1", "Room 2", etc.</li>
          <li><b>Joining a Room</b>:
            <ul>
              <li>Browse available rooms on the ARENA page</li>
              <li>Click "Join Room" and pay 2,500 points</li>
              <li>Both players select 5 cards and choose UP/DOWN for each</li>
            </ul>
          </li>
          <li><b>Refund Policy</b>: If you create a room and no one joins, you can cancel and get your 2,500 points refunded.</li>
          <li><b>Scoring</b>: Same rules as PLAY mode. Lock cards to secure your score, or wait for 00:00 UTC settlement.</li>
          <li><b>Winning</b>: After settlement, the player with higher total points wins and receives <b>+5,000 points</b>. In case of a draw, both players get their 2,500 points back.</li>
        </ul>

        <h3>💡 Pro Tips</h3>
        <ul>
          <li><b>Watch the Prices</b>: Use the PRICES page to monitor live token prices and 24h% changes.</li>
          <li><b>Use Lock Strategically</b>: Lock cards when you're ahead to protect your gains, especially on volatile tokens.</li>
          <li><b>Check Global Movers</b>: The PLAY page shows top gainers and losers - use this to spot opportunities.</li>
          <li><b>Manage Duplicates</b>: Be careful using duplicate cards - they can multiply your losses!</li>
          <li><b>Plan for UTC Midnight</b>: Remember that rounds reset at 00:00 UTC. Lock important cards before then if needed.</li>
        </ul>

        <h3>📱 Pages Overview</h3>
        <ul>
          <li><b>PLAY</b>: Main game mode - select cards, make predictions, and earn points</li>
          <li><b>ARENA</b>: 1v1 duels with other players</li>
          <li><b>INVENTORY</b>: View all your cards and packs</li>
          <li><b>LEADERBOARD</b>: See top players and daily rankings</li>
          <li><b>HISTORY</b>: Review your past rounds and performance</li>
          <li><b>PROFILE</b>: Manage your account and view stats</li>
        </ul>
      </div>
    </div>
  )
}

