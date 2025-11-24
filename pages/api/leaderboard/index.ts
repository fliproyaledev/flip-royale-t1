import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers } from '../../../lib/users'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  try {
    // 1. Tüm kullanıcıları veritabanından çek
    const usersMap = await loadUsers()
    const usersArray = Object.values(usersMap)

    // 2. Puana göre sırala (En yüksekten düşüğe)
    // Not: İleride 'daily' filtresi gelirse burada mantık değişebilir, şimdilik Total Points.
    const sortedUsers = usersArray.sort((a, b) => b.totalPoints - a.totalPoints)

    // 3. İlk 100 kişiyi al ve gereksiz verileri temizle (Güvenlik için)
    const top100 = sortedUsers.slice(0, 100).map(user => ({
      id: user.id,
      name: user.name || user.id.substring(0, 8), // İsim yoksa ID'nin başını göster
      avatar: user.avatar,
      totalPoints: user.totalPoints,
      bankPoints: user.bankPoints,
      roundsPlayed: user.currentRound ? user.currentRound - 1 : 0,
      activeCards: user.activeRound ? user.activeRound.length : 0,
      bestRound: 0 // Şimdilik 0, ileride hesaplanabilir
    }))

    return res.status(200).json({ 
        ok: true, 
        users: top100 
    })

  } catch (error: any) {
    console.error('Leaderboard API Error:', error)
    return res.status(500).json({ ok: false, error: 'Internal Server Error' })
  }
}
