import { NextRequest, NextResponse } from 'next/server'
import { refreshInventoryIntelligence } from '@/lib/inventory-intelligence'

// Vercel cron schedule: "0 16 * * *" (2am Brisbane, UTC+10) — see vercel.json.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await refreshInventoryIntelligence()
  return NextResponse.json(result)
}
