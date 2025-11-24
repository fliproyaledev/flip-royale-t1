// pages/api/users/update-avatar.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers } from '../../lib/users'

// Payload boyutu limiti (Next.js varsayılanı 4MB, bunu artırabiliriz gerekirse)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '512kb',
    },
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  try {
    const { userId, avatarData } = req.body

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing userId' })
    }
    if (!avatarData || typeof avatarData !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing avatarData' })
    }

    // 1. Kullanıcıları yükle
    const usersMap = await loadUsers()
    const user = usersMap[userId]

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' })
    }

    // 2. Avatarı güncelle (Base64 string olarak kaydediyoruz)
    user.avatar = avatarData
    usersMap[userId] = user

    // 3. Kaydet
    await saveUsers(usersMap)

    console.log(`[API] Avatar updated for user: ${user.username} (${userId})`)

    return res.status(200).json({ ok: true, avatar: user.avatar })

  } catch (error: any) {
    console.error('[API] Update Avatar Error:', error)
    return res.status(500).json({ ok: false, error: 'Internal Server Error' })
  }
}
