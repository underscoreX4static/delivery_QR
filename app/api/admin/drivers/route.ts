import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import type { Driver } from '@/types/index'

const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'on_the_way']

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: drivers, error } = await supabaseAdmin
    .from('drivers')
    .select('*')
    .order('is_owner', { ascending: false })
    .order('first_name', { ascending: true })

  if (error || !drivers) return NextResponse.json({ error: 'Failed to load drivers' }, { status: 500 })

  const withActiveOrders = await Promise.all(
    (drivers as Driver[]).map(async (driver) => {
      const { count } = await supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('driver_id', driver.id)
        .in('status', ACTIVE_ORDER_STATUSES)
      return { ...driver, active_orders: count ?? 0 }
    })
  )

  return NextResponse.json({ drivers: withActiveOrders })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const telegramId = typeof body?.telegram_id === 'string' ? body.telegram_id.trim() : ''
  const firstName = typeof body?.first_name === 'string' ? body.first_name.trim() : ''
  const lastName = typeof body?.last_name === 'string' ? body.last_name.trim() || null : null

  if (!telegramId || !firstName) {
    return NextResponse.json({ error: 'telegram_id and first_name are required' }, { status: 400 })
  }

  const { data: driver, error } = await supabaseAdmin
    .from('drivers')
    .insert({ telegram_id: telegramId, first_name: firstName, last_name: lastName })
    .select('*')
    .single()

  if (error || !driver) return NextResponse.json({ error: error?.message ?? 'Failed to create driver' }, { status: 500 })
  return NextResponse.json({ driver })
}
