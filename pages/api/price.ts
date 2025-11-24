import type { NextApiRequest, NextApiResponse } from 'next'
import { getPriceForToken } from '../../lib/price'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  const tokenParam = req.query.token
  
  if (!tokenParam || typeof tokenParam !== 'string') {
    return res.status(400).json({ error: 'Missing token id' })
  }

  // ID temizliği ($ işareti varsa kaldır)
  const cleanId = tokenParam.replace(/^\$/, '').toLowerCase()

  try {
    // Redis'ten veriyi çek (lib/price.ts kullanır)
    const data = await getPriceForToken(cleanId)
    
    return res.status(200).json(data)

  } catch (err: any) {
    console.error('[/api/price] error:', err)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}
