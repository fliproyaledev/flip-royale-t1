import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers, getOrCreateUser, debitBank } from '../../../lib/users'

// Vercel için API route config
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST method
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ ok: false, error: `Method ${req.method} not allowed` })
  }

  try {
    // Parse body - Vercel sometimes needs explicit parsing
    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch (e) {
        return res.status(400).json({ ok: false, error: 'Invalid JSON in request body' })
      }
    }

    const userId = String(body?.userId || req.body?.userId || '')
    const cost = Number(body?.cost || req.body?.cost || 0)
    const packType = String(body?.packType || req.body?.packType || 'mystery')
    
    if (!userId || !Number.isFinite(cost) || cost <= 0) {
      return res.status(400).json({ ok: false, error: 'userId and valid cost required' })
    }

    const users = await loadUsers()
    const u = getOrCreateUser(users, userId)
    
    if (u.bankPoints < cost) {
      return res.status(400).json({ ok: false, error: 'Insufficient points' })
    }

    debitBank(u, cost, `purchase-${packType}-pack`, new Date().toISOString().slice(0, 10))
    await saveUsers(users)
    
    return res.status(200).json({ ok: true, bankPoints: u.bankPoints })
  } catch (e: any) {
    console.error('Purchase pack error:', e)
    return res.status(500).json({ ok: false, error: e?.message || 'Purchase failed' })
  }
}

