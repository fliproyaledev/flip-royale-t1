import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const id = String(req.query.id || '').trim()
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Missing id' })
    }

    const users = await loadUsers()
    const user = users[id]

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' })
    }

    return res.status(200).json({
      ok: true,
      id,
      user,
    })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'server error' })
  }
}
