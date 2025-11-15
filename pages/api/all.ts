import type { NextApiRequest, NextApiResponse } from 'next'
import { ensurePriceOrchestrator } from '../../../lib/price_orchestrator'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const orchestrator = ensurePriceOrchestrator()
    const allPrices = orchestrator.getAll()
    
    // Return a map of tokenId -> fdv for efficient lookup
    const fdvMap: Record<string, number | undefined> = {}
    for (const price of allPrices) {
      fdvMap[price.tokenId] = price.fdv
    }
    
    return res.status(200).json({ ok: true, fdv: fdvMap })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch FDV data' })
  }
}

