import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { approveReferral, rejectReferral } from '@/lib/referrals'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const reviewedBy = admin.email ?? admin.id

  const result =
    body?.action === 'approve'
      ? await approveReferral(id, reviewedBy)
      : body?.action === 'reject'
        ? await rejectReferral(id, reviewedBy)
        : { ok: false as const, error: 'Unknown action' }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
