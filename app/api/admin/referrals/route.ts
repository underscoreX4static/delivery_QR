import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getPendingReferrals } from '@/lib/referrals'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const referrals = await getPendingReferrals()
  return NextResponse.json({ referrals })
}
