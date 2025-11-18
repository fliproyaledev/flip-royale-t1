import { loadUsers, saveUsers } from '../../../lib/users'

export default async function handler(req, res) {
  const id = String(req.query.id || '').trim()

  if (!id) {
    return res.status(400).json({ ok: false, error: 'Missing ?id=' })
  }

  const users = await loadUsers()

  if (!users[id]) {
    return res.status(404).json({ ok: false, error: 'User not found', id })
  }

  delete users[id]
  await saveUsers(users)

  return res.status(200).json({
    ok: true,
    deleted: id
  })
}
