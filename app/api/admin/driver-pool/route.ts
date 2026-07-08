import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getPoolBalance, grantBonus } from '@/lib/driver-pool'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({ balance: await getPoolBalance() })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const driverIds: unknown = body?.driver_ids
  const amount = Number(body?.amount)
  const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : null

  if (!Array.isArray(driverIds) || driverIds.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'driver_ids must be an array of ids' }, { status: 400 })
  }
  if (!(amount > 0)) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  const result = await grantBonus(driverIds as string[], amount, note)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json(result)
}
