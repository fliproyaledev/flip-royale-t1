import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers, getOrCreateUser, creditBank } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== 'POST') {
    return res.status(405).json({ ok:false, error:'Method not allowed' })
  }
  try{
    const userId = String(req.body?.userId || '')
    const amount = Number(req.body?.amount || 0)
    if(!userId || !Number.isFinite(amount)) return res.status(400).json({ ok:false, error:'userId and amount required' })
    const users = await loadUsers()
    const u = getOrCreateUser(users, userId)
    creditBank(u, amount, 'admin-grant')
    await saveUsers(users)
    return res.status(200).json({ ok:true, bankPoints: u.bankPoints })
  }catch(e:any){
    return res.status(400).json({ ok:false, error: e?.message || 'grant failed' })
  }
}

