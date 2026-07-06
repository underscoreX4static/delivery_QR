import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { markSettlementPaid } from '@/lib/settlements'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const body = await request.json().catch(() => null)

  if (body?.action !== 'mark_paid') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const result = await markSettlementPaid(id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })

  return NextResponse.json({ settlement: result.settlement })
}
