import { loadUsers, saveUsers } from '../../../lib/users'

export default async function handler(req, res) {
  const users = await loadUsers()

  if (req.query.delete) {
    delete users[req.query.delete]
    await saveUsers(users)
    return res.json({ ok: true, deleted: req.query.delete })
  }

  res.json(users)
}
