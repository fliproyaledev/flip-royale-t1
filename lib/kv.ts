/**
 * Vercel KV (Redis) wrapper for persistent data storage
 * Falls back to in-memory storage if KV is not configured (for local dev)
 */

// Optional KV import - only available in production with @vercel/kv installed
let kv: any = null
try {
  // Try to import @vercel/kv - will fail if not installed (local dev)
  // NOT used when KV_REST_API_URL + KV_REST_API_TOKEN aktifse (Upstash/Vercel KV REST)
  // sadece KV_URL kullanırsan devreye girer.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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
    // ✅ Öncelik: REST API (Upstash / Vercel KV)
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const response = await fetch(process.env.KV_REST_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
          // 🔴 ÖNEMLİ: Upstash için Accept: application/json HEADER'I
          Accept: 'application/json'
        },
        body: JSON.stringify(['GET', key])
      })

      if (!response.ok) {
        throw new Error(`KV REST API error: ${response.status}`)
      }

      const data = await response.json()

      // Upstash tipik cevap: { result: value }
      // Bazı KV'ler direkt value döndürebilir
      if (data === null || data === undefined) return null
      if (typeof data === 'object' && 'result' in data) {
        return (data as any).result ?? null
      }
      return data as string
    }

    // ✅ İkinci tercih: native KV client (KV_URL + @vercel/kv)
    if (process.env.KV_URL && kv) {
      const value = await kv.get<string | null>(key)
      return value ?? null
    }

    // ✅ Son tercih: local memory (dev için)
    return memoryStore.get(key) || null
  } catch (err) {
    console.warn(`KV get error for key ${key}, using memory fallback:`, err)
    return memoryStore.get(key) || null
  }
}

async function setKV(key: string, value: string): Promise<void> {
  try {
    // ✅ REST API (Upstash/Vercel KV)
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const response = await fetch(process.env.KV_REST_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(['SET', key, value])
      })

      if (!response.ok) {
        throw new Error(`KV REST API error: ${response.status}`)
      }
      return
    }

    // ✅ Native KV client
    if (process.env.KV_URL && kv) {
      await kv.set(key, value)
      return
    }

    // ✅ Local dev memory
    memoryStore.set(key, value)
  } catch (err) {
    console.warn(`KV set error for key ${key}, using memory fallback:`, err)
    memoryStore.set(key, value)
  }
}

async function delKV(key: string): Promise<void> {
  try {
    // ✅ REST API (Upstash/Vercel KV)
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const response = await fetch(process.env.KV_REST_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(['DEL', key])
      })

      if (!response.ok) {
        throw new Error(`KV REST API error: ${response.status}`)
      }
      return
    }

    // ✅ Native KV client
    if (process.env.KV_URL && kv) {
      await kv.del(key)
      return
    }

    // ✅ Local memory
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
  rounds: 'fliproyale:rounds'
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
