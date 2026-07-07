import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { clearCommercialCommands, setCommercialCommands } from '@/lib/telegram'

const ALLOWED_FIELDS = [
  'name',
  'address',
  'contact_name',
  'contact_phone',
  'commission_rate',
  'telegram_id',
  'is_active',
  'first_sale_bonus_amount',
]

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  const { data: partner, error } = await supabaseAdmin.from('partners').select('*').eq('id', id).single()
  if (error || !partner) return NextResponse.json({ error: 'Commercial not found' }, { status: 404 })

  const { data: qrCodes } = await supabaseAdmin.from('qr_codes').select('id').eq('partner_id', id)
  const qrIds = (qrCodes ?? []).map((q) => q.id)

  const [{ data: scans }, { data: orders }, { data: commissions }] = await Promise.all([
    qrIds.length
      ? supabaseAdmin.from('qr_scans').select('user_id').in('qr_code_id', qrIds)
      : Promise.resolve({ data: [] as { user_id: string | null }[] }),
    qrIds.length
      ? supabaseAdmin.from('orders').select('*, users(first_name, last_name)').in('qr_code_id', qrIds)
      : Promise.resolve({ data: [] as never[] }),
    supabaseAdmin.from('affiliate_commissions').select('*').eq('partner_id', id),
  ])

  const totalScans = scans?.length ?? 0
  const uniqueUserIds = [...new Set((scans ?? []).map((s) => s.user_id).filter(Boolean))] as string[]

  const deliveredOrders = (orders ?? []).filter((o) => o.status === 'delivered')
  const revenueGenerated = deliveredOrders.reduce((sum, o) => sum + o.total, 0)

  const totalEarned = (commissions ?? []).reduce((sum, c) => sum + c.commission_amount, 0)
  const totalPaid = (commissions ?? []).filter((c) => c.paid_out).reduce((sum, c) => sum + c.commission_amount, 0)

  const commissionByOrderId = new Map((commissions ?? []).map((c) => [c.order_id, c]))
  const ordersTable = (orders ?? []).map((o) => {
    const commission = commissionByOrderId.get(o.id)
    return {
      order_id: o.id,
      created_at: o.created_at,
      customer_name: `${o.users?.first_name ?? ''} ${o.users?.last_name ?? ''}`.trim() || 'Unknown',
      total: o.total,
      status: o.status,
      commission_amount: commission?.commission_amount ?? null,
      commission_paid_out: commission?.paid_out ?? null,
    }
  })

  const customersByUser = new Map<
    string,
    { user_id: string; name: string; first_order_at: string; order_count: number; total_spent: number }
  >()
  for (const o of orders ?? []) {
    if (!o.user_id) continue
    const existing = customersByUser.get(o.user_id)
    const name = `${o.users?.first_name ?? ''} ${o.users?.last_name ?? ''}`.trim() || 'Unknown'
    if (existing) {
      existing.order_count += 1
      if (o.status === 'delivered') existing.total_spent += o.total
      if (o.created_at < existing.first_order_at) existing.first_order_at = o.created_at
    } else {
      customersByUser.set(o.user_id, {
        user_id: o.user_id,
        name,
        first_order_at: o.created_at,
        order_count: 1,
        total_spent: o.status === 'delivered' ? o.total : 0,
      })
    }
  }

  return NextResponse.json({
    partner,
    stats: {
      total_scans: totalScans,
      unique_users: uniqueUserIds.length,
      orders_generated: orders?.length ?? 0,
      revenue_generated: Math.round(revenueGenerated * 100) / 100,
      commission_rate: partner.commission_rate,
      total_earned: Math.round(totalEarned * 100) / 100,
      total_paid: Math.round(totalPaid * 100) / 100,
      pending: Math.round((totalEarned - totalPaid) * 100) / 100,
    },
    orders: ordersTable.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    customers: [...customersByUser.values()].sort((a, b) => b.total_spent - a.total_spent),
    first_sale_bonus: {
      amount: partner.first_sale_bonus_amount ?? 10,
      // Earned as soon as they have at least one commission on record —
      // matches the "first delivered commission" check in markDelivered.
      earned: (commissions?.length ?? 0) > 0,
      paid: partner.first_sale_bonus_paid ?? false,
    },
  })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const update: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (key in body) update[key] = body[key]
  }

  let previousTelegramId: string | null = null
  if ('telegram_id' in update) {
    const { data: existing } = await supabaseAdmin.from('partners').select('telegram_id').eq('id', id).single()
    previousTelegramId = existing?.telegram_id ?? null
  }

  const { data: partner, error } = await supabaseAdmin
    .from('partners')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !partner) return NextResponse.json({ error: 'Failed to update partner' }, { status: 500 })

  // Give the commercial an extra /mystats entry in their own Telegram command
  // menu the moment their ID is set, and remove it if it's cleared — never
  // touches the default (customer) menu.
  if ('telegram_id' in update) {
    if (update.telegram_id) {
      await setCommercialCommands(update.telegram_id as string).catch(() => {})
    } else if (previousTelegramId) {
      await clearCommercialCommands(previousTelegramId).catch(() => {})
    }
  }

  return NextResponse.json({ partner })
}
