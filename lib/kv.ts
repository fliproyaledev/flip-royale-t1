/**
 * Vercel KV (Redis) wrapper for persistent data storage
 * Falls back to in-memory storage if KV is not configured (for local dev)
 */

// Optional KV import - only available in production with @vercel/kv installed
let kv: any = null
try {
  // Try to import @vercel/kv - will fail if not installed (local dev)
  const kvModule = require('@vercel/kv')
  kv = kvModule.kv
} catch {
  // KV not available - will use memory store
  kv = null
}

// Fallback in-memory storage for local development
const memoryStore = new Map<string, string>()

async function getKV(key: string): Promise<string | null> {
  try {
    // Check if REST API is configured (Vercel KV or Upstash)
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      // Upstash/Vercel KV REST API format: POST with command array
      const response = await fetch(process.env.KV_REST_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['GET', key])
      })
      if (!response.ok) throw new Error(`KV REST API error: ${response.status}`)
      const data = await response.json()
      // Upstash returns { result: value }, Vercel KV might return value directly
      return data.result !== undefined ? data.result : (data || null)
    }
    // Fallback: Try native KV if KV_URL is available
    if (process.env.KV_URL && kv) {
      return await kv.get(key)
    }
    // Fallback to memory for local dev
    return memoryStore.get(key) || null
  } catch (err) {
    console.warn(`KV get error for key ${key}, using memory fallback:`, err)
    return memoryStore.get(key) || null
  }
}

async function setKV(key: string, value: string): Promise<void> {
  try {
    // Check if REST API is configured (Vercel KV or Upstash)
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      // Upstash/Vercel KV REST API format: POST with command array
      const response = await fetch(process.env.KV_REST_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['SET', key, value])
      })
      if (!response.ok) throw new Error(`KV REST API error: ${response.status}`)
      return
    }
    // Fallback: Try native KV if KV_URL is available
    if (process.env.KV_URL && kv) {
      await kv.set(key, value)
      return
    }
    // Fallback to memory for local dev
    memoryStore.set(key, value)
  } catch (err) {
    console.warn(`KV set error for key ${key}, using memory fallback:`, err)
    memoryStore.set(key, value)
  }
}

async function delKV(key: string): Promise<void> {
  try {
    // Check if REST API is configured (Vercel KV or Upstash)
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      // Upstash/Vercel KV REST API format: POST with command array
      const response = await fetch(process.env.KV_REST_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['DEL', key])
      })
      if (!response.ok) throw new Error(`KV REST API error: ${response.status}`)
      return
    }
    // Fallback: Try native KV if KV_URL is available
    if (process.env.KV_URL && kv) {
      await kv.del(key)
      return
    }
    memoryStore.delete(key)
  } catch (err) {
    console.warn(`KV del error for key ${key}, using memory fallback:`, err)
    memoryStore.delete(key)
  }
}

// Key prefixes for different data types
const KEYS = {
  users: 'fliproyale:users',
  duels: 'fliproyale:duels',
  rounds: 'fliproyale:rounds',
} as const

export async function loadUsersKV(): Promise<Record<string, any>> {
  const raw = await getKV(KEYS.users)
  if (!raw) return {}
  try {
    const json = JSON.parse(raw)
    return json && typeof json === 'object' ? json : {}
  } catch {
    return {}
  }
}

export async function saveUsersKV(data: Record<string, any>): Promise<void> {
  await setKV(KEYS.users, JSON.stringify(data, null, 2))
}

export async function loadDuelsKV(): Promise<Record<string, any>> {
  const raw = await getKV(KEYS.duels)
  if (!raw) return {}
  try {
    const json = JSON.parse(raw)
    return json && typeof json === 'object' ? json : {}
  } catch {
    return {}
  }
}

export async function saveDuelsKV(data: Record<string, any>): Promise<void> {
  await setKV(KEYS.duels, JSON.stringify(data, null, 2))
}

export async function loadRoundsKV(): Promise<any[]> {
  const raw = await getKV(KEYS.rounds)
  if (!raw) return []
  try {
    const json = JSON.parse(raw)
    return Array.isArray(json) ? json : []
  } catch {
    return []
  }
}

export async function saveRoundsKV(data: any[]): Promise<void> {
  await setKV(KEYS.rounds, JSON.stringify(data, null, 2))
}

