import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { computeFinanceSnapshot } from '@/lib/finance'
import type { EarningsPeriod } from '@/lib/store-hours'

const VALID_PERIODS: EarningsPeriod[] = ['today', 'week', 'month', 'all']

export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const periodParam = request.nextUrl.searchParams.get('period')
  const period: EarningsPeriod = VALID_PERIODS.includes(periodParam as EarningsPeriod)
    ? (periodParam as EarningsPeriod)
    : 'all'

  const snapshot = await computeFinanceSnapshot(period)
  return NextResponse.json({ snapshot })
}
