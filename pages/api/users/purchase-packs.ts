import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers, getOrCreateUser, debitBank } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  try {
    const userId = String(req.body?.userId || '')
    const cost = Number(req.body?.cost || 0)
    const packType = String(req.body?.packType || 'mystery') // 'mystery' or 'common'
    
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
    return res.status(400).json({ ok: false, error: e?.message || 'Purchase failed' })
  }
}

