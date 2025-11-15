import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

type User = {
  id: string
  username: string
  walletAddress?: string
  createdAt: string
  lastLogin: string
}

export default function Auth(){
  const router = useRouter()
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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

    if (!username.trim()) {
      setError('Username is required')
      return
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }

    if (username.length > 20) {
      setError('Username must be less than 20 characters')
      return
    }

    // Check if username contains only alphanumeric characters and underscores
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores')
      return
    }

    try {
      // Simulate API call - in real app, this would be a server call
      const existingUsers = JSON.parse(localStorage.getItem('flipflop-users') || '[]')
      
      if (isLogin) {
        // Login logic
        const user = existingUsers.find((u: User) => u.username === username)
        if (!user) {
          setError('User not found')
          return
        }
        
        // Update last login
        user.lastLogin = new Date().toISOString()
        localStorage.setItem('flipflop-users', JSON.stringify(existingUsers))
        localStorage.setItem('flipflop-user', JSON.stringify(user))
        
        setSuccess('Login successful!')
        setTimeout(() => router.push('/'), 1000)
      } else {
        // Register logic
        const existingUser = existingUsers.find((u: User) => u.username === username)
        if (existingUser) {
          setError('Username already exists')
          return
        }

        const newUser: User = {
          id: Date.now().toString(),
          username: username,
          walletAddress: walletAddress || undefined,
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        }

        existingUsers.push(newUser)
        localStorage.setItem('flipflop-users', JSON.stringify(existingUsers))
        localStorage.setItem('flipflop-user', JSON.stringify(newUser))
        
        setSuccess('Registration successful!')
        setTimeout(() => router.push('/'), 1000)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    }
  }

  return (
    <div className="app">
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(20px)',
          borderRadius: 20,
          padding: 40,
          width: '100%',
          maxWidth: 400,
          border: '1px solid rgba(255,255,255,0.2)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}>
          {/* Header */}
          <div style={{textAlign: 'center', marginBottom: 30}}>
            <div style={{
              fontSize: 32,
              fontWeight: 900,
              color: 'white',
              marginBottom: 8,
              textShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}>
              <img src="/logo.png" alt="FLIP ROYALE" style={{height: '160px', width: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto', filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.4))'}} onError={(e) => {
                const target = e.currentTarget as HTMLImageElement
                target.src = '/logo.svg'
                target.onerror = () => {
                  target.style.display = 'none'
                  const parent = target.parentElement
                  if (parent) parent.textContent = 'FLIP ROYALE'
                }
              }} />
            </div>
            <div style={{
              fontSize: 16,
              color: 'rgba(255,255,255,0.8)',
              marginBottom: 20
            }}>
              {isLogin ? 'Welcome back!' : 'Create your account'}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {/* Username */}
            <div style={{marginBottom: 20}}>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: 'white',
                marginBottom: 8
              }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.1)',
                  color: 'white',
                  fontSize: 16,
                  outline: 'none',
                  transition: 'all 0.3s'
                }}
                onFocus={(e) => {
                  e.target.style.border = '1px solid rgba(255,255,255,0.5)'
                  e.target.style.background = 'rgba(255,255,255,0.15)'
                }}
                onBlur={(e) => {
                  e.target.style.border = '1px solid rgba(255,255,255,0.2)'
                  e.target.style.background = 'rgba(255,255,255,0.1)'
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
                  marginBottom: 8
                }}>
                  Wallet Address (Optional)
                </label>
                <div style={{display: 'flex', gap: 8}}>
                  <input
                    type="text"
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    placeholder="0x..."
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      fontSize: 16,
                      outline: 'none',
                      transition: 'all 0.3s'
                    }}
                    onFocus={(e) => {
                      e.target.style.border = '1px solid rgba(255,255,255,0.5)'
                      e.target.style.background = 'rgba(255,255,255,0.15)'
                    }}
                    onBlur={(e) => {
                      e.target.style.border = '1px solid rgba(255,255,255,0.2)'
                      e.target.style.background = 'rgba(255,255,255,0.1)'
                    }}
                  />
                  <button
                    type="button"
                    onClick={connectWallet}
                    disabled={isConnecting}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.2)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
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
                padding: '12px 16px',
                borderRadius: 8,
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
                padding: '12px 16px',
                borderRadius: 8,
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
              style={{
                width: '100%',
                padding: '14px 20px',
                borderRadius: 12,
                border: 'none',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.3s',
                marginBottom: 20
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {isLogin ? 'Login' : 'Create Account'}
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
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: 14,
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
              </button>
            </div>
          </form>

          
        </div>
      </div>
    </div>
  )
}
