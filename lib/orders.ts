import { supabaseAdmin } from '@/lib/supabase'
import { commitConsumption, refundConsumption } from '@/lib/inventory'
import type { Order, OrderItem, OrderStatus } from '@/types/index'

// Single home for order lifecycle transitions and their side effects (stock
// commit/refund, affiliate commission creation) — both the Telegram bot
// callbacks and the admin dashboard routes call into this so the rules are
// never duplicated.

const STOCK_COMMITTED_STATUSES: OrderStatus[] = ['confirmed', 'preparing', 'on_the_way', 'delivered']

type Result = { ok: true } | { ok: false; error: string }

export async function getOrder(orderId: string): Promise<Order | null> {
  const { data } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single()
  return data as Order | null
}

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const { data, error } = await supabaseAdmin.from('order_items').select('*').eq('order_id', orderId)
  if (error || !data) throw new Error(`Failed to load order_items for ${orderId}: ${error?.message}`)
  return data as OrderItem[]
}

async function recordStatusChange(orderId: string, status: OrderStatus, changedBy: string) {
  await supabaseAdmin.from('orders').update({ status }).eq('id', orderId)
  await supabaseAdmin.from('order_status_history').insert({ order_id: orderId, status, changed_by: changedBy })
}

/** pending -> confirmed. Commits FIFO stock for the batches locked in at checkout. */
export async function confirmOrder(orderId: string, changedBy: string): Promise<Result> {
  const items = await getOrderItems(orderId)
  try {
    await commitConsumption(items)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Stock commit failed' }
  }
  await recordStatusChange(orderId, 'confirmed', changedBy)
  return { ok: true }
}

export async function assignDriver(orderId: string, driverId: string): Promise<void> {
  await supabaseAdmin.from('orders').update({ driver_id: driverId }).eq('id', orderId)
}

/** confirmed -> preparing, or preparing -> on_the_way. No stock/commission side effects. */
export async function advanceStatus(
  orderId: string,
  status: Extract<OrderStatus, 'preparing' | 'on_the_way'>,
  changedBy: string
): Promise<Result> {
  await recordStatusChange(orderId, status, changedBy)
  return { ok: true }
}

/** on_the_way -> delivered. Creates the affiliate commission snapshot if the order came via a partner QR. */
export async function markDelivered(orderId: string, changedBy: string): Promise<Result> {
  const order = await getOrder(orderId)
  if (!order) return { ok: false, error: 'Order not found' }

  await recordStatusChange(orderId, 'delivered', changedBy)

  if (order.qr_code_id) {
    const { data: qrCode } = await supabaseAdmin
      .from('qr_codes')
      .select('partner_id')
      .eq('id', order.qr_code_id)
      .single()

    if (qrCode?.partner_id) {
      const { data: partner } = await supabaseAdmin
        .from('partners')
        .select('commission_rate')
        .eq('id', qrCode.partner_id)
        .single()

      if (partner) {
        const commissionAmount = round2(order.total * partner.commission_rate)
        await supabaseAdmin.from('affiliate_commissions').insert({
          partner_id: qrCode.partner_id,
          order_id: order.id,
          order_total: order.total,
          commission_rate: partner.commission_rate,
          commission_amount: commissionAmount,
        })
      }
    }
  }

  return { ok: true }
}

/**
 * Cancels an order at any stage. Only refunds stock if it was actually
 * committed (i.e. the order had already been confirmed) — a still-pending
 * order never touched product_batches in the first place.
 */
export async function cancelOrder(orderId: string, reason: string, changedBy: string): Promise<Result> {
  const order = await getOrder(orderId)
  if (!order) return { ok: false, error: 'Order not found' }
  if (order.status === 'delivered' || order.status === 'cancelled') {
    return { ok: false, error: `Order is already ${order.status}` }
  }

  if (STOCK_COMMITTED_STATUSES.includes(order.status)) {
    const items = await getOrderItems(orderId)
    await refundConsumption(items)
  }

  await recordStatusChange(orderId, 'cancelled', changedBy)
  await supabaseAdmin.from('order_messages').insert({
    order_id: orderId,
    sender_role: 'owner',
    sender_id: changedBy,
    content: `Order cancelled: ${reason}`,
  })

  return { ok: true }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
