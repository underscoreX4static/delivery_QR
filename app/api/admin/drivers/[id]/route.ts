import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { clearDriverCommands, setDriverCommands } from '@/lib/telegram'
import { getDriverBonuses } from '@/lib/driver-bonuses'
import { DRIVER_BONUS_MILESTONES, calculatePayout } from '@/lib/calculations'
import type { OrderItem } from '@/types/index'

const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'on_the_way']

// is_owner is intentionally not editable here — there must always be exactly
// one owner driver (seeded at telegram_id 8376671012), so it's read-only in
// the admin UI to avoid accidentally creating a second one or clearing it.
const ALLOWED_FIELDS = ['first_name', 'last_name', 'telegram_id', 'is_active']

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  const { data: driver, error } = await supabaseAdmin.from('drivers').select('*').eq('id', id).single()
  if (error || !driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })

  const [{ data: orders }, bonuses] = await Promise.all([
    supabaseAdmin.from('orders').select('*, users(first_name, last_name)').eq('driver_id', id).order('created_at', { ascending: false }),
    getDriverBonuses(id),
  ])

  const deliveredOrders = (orders ?? []).filter((o) => o.status === 'delivered')
  const activeOrders = (orders ?? []).filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status))
  const lifetimeDeliveredOrders = deliveredOrders.length

  const orderIds = deliveredOrders.map((o) => o.id)
  const { data: items } = orderIds.length
    ? await supabaseAdmin.from('order_items').select('*').in('order_id', orderIds)
    : { data: [] as OrderItem[] }

  const itemsByOrder = new Map<string, OrderItem[]>()
  for (const item of (items as OrderItem[]) ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? []
    list.push(item)
    itemsByOrder.set(item.order_id, list)
  }

  let revenueGenerated = 0
  let totalPayoutEarned = 0
  for (const order of deliveredOrders) {
    const orderItems = itemsByOrder.get(order.id) ?? []
    const costOfGoods = orderItems.reduce((sum, i) => sum + i.unit_cost_price * i.quantity, 0)
    const payout = calculatePayout({
      subtotal: order.subtotal,
      deliveryFee: order.delivery_fee,
      discount: order.discount,
      total: order.total,
      costOfGoods,
      driverIsOwner: driver.is_owner,
      partnerCommissionRate: 0,
    })
    revenueGenerated += order.total
    totalPayoutEarned += payout.driverPayout
  }

  const ordersTable = (orders ?? []).slice(0, 50).map((o) => ({
    order_id: o.id,
    created_at: o.created_at,
    customer_name: `${o.users?.first_name ?? ''} ${o.users?.last_name ?? ''}`.trim() || 'Unknown',
    total: o.total,
    status: o.status,
  }))

  return NextResponse.json({
    driver,
    stats: {
      lifetime_delivered_orders: lifetimeDeliveredOrders,
      active_orders: activeOrders.length,
      revenue_generated: Math.round(revenueGenerated * 100) / 100,
      total_payout_earned: Math.round(totalPayoutEarned * 100) / 100,
    },
    orders: ordersTable,
    bonuses: {
      pool_balance: driver.bonus_pool_balance ?? 0,
      lifetime_delivered_orders: lifetimeDeliveredOrders,
      next_milestone: DRIVER_BONUS_MILESTONES.find((m) => m.orders > lifetimeDeliveredOrders) ?? null,
      awarded: bonuses,
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

  const { data: before } = await supabaseAdmin
    .from('drivers')
    .select('telegram_id, is_active')
    .eq('id', id)
    .single()

  const { data: driver, error } = await supabaseAdmin
    .from('drivers')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !driver) return NextResponse.json({ error: 'Failed to update driver' }, { status: 500 })

  // Keep the driver's per-chat /orders command menu in sync with their
  // telegram_id and active status — never touches the default menu.
  if (before?.telegram_id && before.telegram_id !== driver.telegram_id) {
    await clearDriverCommands(before.telegram_id).catch(() => {})
  }
  if (driver.telegram_id) {
    if (driver.is_active) await setDriverCommands(driver.telegram_id).catch(() => {})
    else await clearDriverCommands(driver.telegram_id).catch(() => {})
  }

  return NextResponse.json({ driver })
}
