import type { NextApiRequest, NextApiResponse } from 'next'
import { loadUsers, saveUsers, getOrCreateUser, creditGamePoints } from '../../../lib/users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).end()

    try {
        const { userId, result } = req.body
        
        if (!userId || !result) {
            return res.status(400).json({ ok: false, error: 'Missing data' })
        }

        const map = await loadUsers()
        const user = getOrCreateUser(map, userId)
        
        // Basic duplicate check by dayKey
        if (Array.isArray(user.roundHistory)) {
            const exists = user.roundHistory.find((h: any) => h.dayKey === result.dayKey)
            if (exists) {
                return res.status(200).json({ ok: true, user, message: 'Already saved' })
            }
        } else {
            user.roundHistory = []
        }
        
        user.roundHistory.push(result)
        
        // Credit points if positive
        if (typeof result.totalPoints === 'number' && result.totalPoints > 0) {
            creditGamePoints(user, result.totalPoints, `round-${result.dayKey}`)
        }
        
        await saveUsers(map)
        return res.status(200).json({ ok: true, user })
    } catch(e: any) {
        return res.status(500).json({ ok: false, error: e.message })
    }
}

