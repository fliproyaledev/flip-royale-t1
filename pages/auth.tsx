import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

const DEFAULT_AVATAR = '/avatars/default-avatar.png'

type User = {
  id: string
  username: string
  walletAddress?: string
  createdAt: string
  lastLogin: string
  avatar?: string
}

export default function Auth(){
  const router = useRouter()
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  // Check if user is already logged in
  useEffect(() => {
    const user = localStorage.getItem('flipflop-user')
    if (user) {
      router.push('/')
    }
  }, [router])

  async function connectWallet() {
    setIsConnecting(true)
    setError('')
    
    try {
      // Check if MetaMask is installed
      if (typeof window.ethereum === 'undefined') {
        setError('MetaMask is not installed. Please install MetaMask to continue.')
        setIsConnecting(false)
        return
      }

      // Request account access
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      })
      
      if (accounts.length > 0) {
        setWalletAddress(accounts[0])
        setSuccess('Wallet connected successfully!')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet')
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    if (!username.trim()) {
      setError('Username is required')
      setLoading(false)
      return
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters')
      setLoading(false)
      return
    }

    if (username.length > 20) {
      setError('Username must be less than 20 characters')
      setLoading(false)
      return
    }

    // Check if username contains only alphanumeric characters and underscores
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores')
      setLoading(false)
      return
    }

    try {
      if (isLogin) {
        // Login logic - check server first
        try {
          const userId = walletAddress.trim() || username.trim()
          const r = await fetch(`/api/users/me?userId=${encodeURIComponent(userId)}`)
          const j = await r.json()
          if (j?.ok && j?.user) {
            const userData = j.user
            const newUser: User = {
              id: userData.id || userId,
              username: userData.name || username,
              walletAddress: walletAddress || undefined,
              createdAt: userData.updatedAt || new Date().toISOString(),
              lastLogin: new Date().toISOString(),
              avatar: userData.avatar || DEFAULT_AVATAR
            }
            localStorage.setItem('flipflop-user', JSON.stringify(newUser))
            setSuccess('Login successful!')
            setTimeout(() => router.push('/'), 1000)
            return
          }
        } catch (err) {
          // Fallback to local storage check
        }

        // Fallback: Check local storage
        const existingUsers = JSON.parse(localStorage.getItem('flipflop-users') || '[]')
        const user = existingUsers.find((u: User) => u.username === username)
        if (!user) {
          setError('User not found')
          setLoading(false)
          return
        }
        
        user.lastLogin = new Date().toISOString()
        localStorage.setItem('flipflop-users', JSON.stringify(existingUsers))
        localStorage.setItem('flipflop-user', JSON.stringify(user))
        
        setSuccess('Login successful!')
        setTimeout(() => router.push('/'), 1000)
      } else {
        // Register logic
        const userId = walletAddress.trim() || `user_${Date.now()}`
        
        // Register on server to get initial points and pack
        try {
          const r = await fetch(`/api/users/me?userId=${encodeURIComponent(userId)}`)
          const j = await r.json()
          if (j?.ok && j?.user) {
            const userData = j.user
            const newUser: User = {
              id: userData.id || userId,
              username: username,
              walletAddress: walletAddress || undefined,
              createdAt: new Date().toISOString(),
              lastLogin: new Date().toISOString(),
              avatar: userData.avatar || DEFAULT_AVATAR
            }
            localStorage.setItem('flipflop-user', JSON.stringify(newUser))
            
            // Set initial points and starter pack availability
            const bankPoints = userData.bankPoints || 50000
            localStorage.setItem('flipflop-points', String(bankPoints))
            localStorage.setItem('flipflop-starter-available', '1')
            
            setSuccess('Registration successful! You received 50,000 points and 1 starter pack!')
            setTimeout(() => router.push('/'), 1500)
            return
          }
        } catch (err) {
          console.error('Registration error:', err)
        }

        // Fallback: Local storage registration
        const existingUsers = JSON.parse(localStorage.getItem('flipflop-users') || '[]')
        const existingUser = existingUsers.find((u: User) => u.username === username)
        if (existingUser) {
          setError('Username already exists')
          setLoading(false)
          return
        }

        const newUser: User = {
          id: userId,
          username: username,
          walletAddress: walletAddress || undefined,
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          avatar: DEFAULT_AVATAR
        }

        existingUsers.push(newUser)
        localStorage.setItem('flipflop-users', JSON.stringify(existingUsers))
        localStorage.setItem('flipflop-user', JSON.stringify(newUser))
        localStorage.setItem('flipflop-points', '50000')
        localStorage.setItem('flipflop-starter-available', '1')
        
        setSuccess('Registration successful! You received 50,000 points and 1 starter pack!')
        setTimeout(() => router.push('/'), 1500)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, rgba(16,185,129,0.15) 0%, rgba(0,0,0,0.8) 50%, rgba(0,0,0,0.95) 100%)',
      padding: '20px'
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        borderRadius: 24,
        padding: 48,
        width: '100%',
        maxWidth: 480,
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Decorative gradient overlay */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: 'linear-gradient(90deg, #10b981, #3b82f6, #8b5cf6, #ec4899)',
          borderRadius: '24px 24px 0 0'
        }}></div>

        {/* Header */}
        <div style={{textAlign: 'center', marginBottom: 32}}>
          <div style={{
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <img 
              src="/logo.png" 
              alt="FLIP ROYALE" 
              style={{
                height: '140px', 
                width: 'auto', 
                objectFit: 'contain', 
                filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.4))'
              }} 
              onError={(e) => {
                const target = e.currentTarget as HTMLImageElement
                target.src = '/logo.svg'
                target.onerror = () => {
                  target.style.display = 'none'
                  const parent = target.parentElement
                  if (parent) parent.textContent = 'FLIP ROYALE'
                }
              }} 
            />
          </div>
          <div style={{
            fontSize: 28,
            fontWeight: 900,
            color: 'white',
            marginBottom: 8,
            textShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}>
            {isLogin ? 'Welcome Back!' : 'Join FLIP ROYALE'}
          </div>
          <div style={{
            fontSize: 15,
            color: 'rgba(255,255,255,0.7)',
            marginBottom: 24
          }}>
            {isLogin ? 'Sign in to continue your journey' : 'Start your trading adventure today'}
          </div>
        </div>

        {/* Registration Rewards Info (only for signup) */}
        {!isLogin && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(59,130,246,0.15) 100%)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 16,
            padding: 20,
            marginBottom: 24,
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              top: -50,
              right: -50,
              width: 100,
              height: 100,
              background: 'radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 70%)',
              borderRadius: '50%'
            }}></div>
            <div style={{
              fontSize: 16,
              fontWeight: 700,
              color: '#86efac',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span>🎁</span>
              <span>New Player Rewards</span>
            </div>
            <div style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.9)',
              lineHeight: 1.6
            }}>
              <div style={{marginBottom: 8}}>
                <strong style={{color: '#86efac'}}>50,000 Points</strong> - Start trading immediately
              </div>
              <div>
                <strong style={{color: '#86efac'}}>1 Starter Pack</strong> - Get 5 random cards to begin
              </div>
            </div>
            <div style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.6)',
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,0.1)'
            }}>
              One wallet can register once during beta period
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Username */}
          <div style={{marginBottom: 20}}>
            <label style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: 'white',
              marginBottom: 10
            }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px 18px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.08)',
                color: 'white',
                fontSize: 16,
                outline: 'none',
                transition: 'all 0.3s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.target.style.border = '1px solid rgba(16,185,129,0.5)'
                e.target.style.background = 'rgba(255,255,255,0.12)'
              }}
              onBlur={(e) => {
                e.target.style.border = '1px solid rgba(255,255,255,0.2)'
                e.target.style.background = 'rgba(255,255,255,0.08)'
              }}
            />
          </div>

          {/* Wallet Connection (only for registration) */}
          {!isLogin && (
            <div style={{marginBottom: 20}}>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: 'white',
                marginBottom: 10
              }}>
                Wallet Address (Optional)
              </label>
              <div style={{display: 'flex', gap: 10}}>
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="0x..."
                  disabled={loading || isConnecting}
                  style={{
                    flex: 1,
                    padding: '14px 18px',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.08)',
                    color: 'white',
                    fontSize: 16,
                    outline: 'none',
                    transition: 'all 0.3s',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => {
                    e.target.style.border = '1px solid rgba(16,185,129,0.5)'
                    e.target.style.background = 'rgba(255,255,255,0.12)'
                  }}
                  onBlur={(e) => {
                    e.target.style.border = '1px solid rgba(255,255,255,0.2)'
                    e.target.style.background = 'rgba(255,255,255,0.08)'
                  }}
                />
                <button
                  type="button"
                  onClick={connectWallet}
                  disabled={loading || isConnecting}
                  style={{
                    padding: '14px 20px',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: isConnecting ? 'rgba(255,255,255,0.1)' : 'rgba(16,185,129,0.2)',
                    color: 'white',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: (loading || isConnecting) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s',
                    whiteSpace: 'nowrap',
                    opacity: (loading || isConnecting) ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!loading && !isConnecting) {
                      e.currentTarget.style.background = 'rgba(16,185,129,0.3)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading && !isConnecting) {
                      e.currentTarget.style.background = 'rgba(16,185,129,0.2)'
                    }
                  }}
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          )}

          {/* Error/Success Messages */}
          {error && (
            <div style={{
              padding: '14px 18px',
              borderRadius: 12,
              background: 'rgba(239,68,68,0.2)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5',
              fontSize: 14,
              marginBottom: 20
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              padding: '14px 18px',
              borderRadius: 12,
              background: 'rgba(16,185,129,0.2)',
              border: '1px solid rgba(16,185,129,0.3)',
              color: '#86efac',
              fontSize: 14,
              marginBottom: 20
            }}>
              {success}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px 24px',
              borderRadius: 12,
              border: 'none',
              background: loading 
                ? 'rgba(255,255,255,0.1)' 
                : 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
              color: 'white',
              fontSize: 17,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              marginBottom: 24,
              opacity: loading ? 0.6 : 1,
              boxShadow: loading ? 'none' : '0 4px 15px rgba(16,185,129,0.3)'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(16,185,129,0.4)'
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(16,185,129,0.3)'
              }
            }}
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>

          {/* Toggle */}
          <div style={{textAlign: 'center'}}>
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin)
                setError('')
                setSuccess('')
                setUsername('')
                setWalletAddress('')
              }}
              disabled={loading}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.7)',
                fontSize: 14,
                cursor: loading ? 'not-allowed' : 'pointer',
                textDecoration: 'none',
                padding: '8px 12px',
                borderRadius: 8,
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.color = 'white'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
                  e.currentTarget.style.background = 'none'
                }
              }}
            >
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <span style={{color: '#86efac', fontWeight: 600}}>
                {isLogin ? 'Sign Up' : 'Sign In'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
