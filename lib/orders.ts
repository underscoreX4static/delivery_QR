import { supabaseAdmin } from '@/lib/supabase'
import { commitConsumption, refundConsumption } from '@/lib/inventory'
import { calculateBonusPoolContribution, calculatePayout } from '@/lib/calculations'
import { getSettings } from '@/lib/settings'
import { contributeToPool } from '@/lib/driver-pool'
import { notifyOwner, sendMessage } from '@/lib/telegram'
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

/**
 * Updates orders.status and appends to order_status_history. These are two
 * separate writes with no transaction tying them together — but a failure
 * on the history insert must not fail the whole transition: the status
 * change already succeeded by that point, and throwing here would make the
 * caller report a false failure back to the customer/driver even though
 * their action actually worked. The history row is informational, so a
 * failure to write it is surfaced to the owner instead of blocking anything.
 */
async function recordStatusChange(orderId: string, status: OrderStatus, changedBy: string): Promise<void> {
  const { error } = await supabaseAdmin.from('orders').update({ status }).eq('id', orderId)
  if (error) throw new Error(`Failed to update order ${orderId} to ${status}: ${error.message}`)

  const { error: historyError } = await supabaseAdmin
    .from('order_status_history')
    .insert({ order_id: orderId, status, changed_by: changedBy })

  if (historyError) {
    console.error(`Failed to log status history for order ${orderId}:`, historyError.message)
    await notifyOwner(
      `⚠️ Order #${orderId.slice(0, 8)} moved to "${status}" but its history log failed to write: ${historyError.message}`
    ).catch(() => {})
  }
}

/**
 * pending -> confirmed. Commits FIFO stock for the batches locked in at
 * checkout. Idempotent: repeat calls (e.g. a double-tapped Telegram button)
 * are a no-op once the order is past 'pending' — commitConsumption must
 * only ever run once per order, or stock gets decremented multiple times
 * for the same order (this happened in production: a double confirm tap
 * silently over-consumed two batches before this guard existed).
 */
export async function confirmOrder(orderId: string, changedBy: string): Promise<Result> {
  const order = await getOrder(orderId)
  if (!order) return { ok: false, error: 'Order not found' }
  if (order.status !== 'pending') return { ok: true } // already confirmed (or beyond) — no-op

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

/** confirmed -> preparing, or preparing -> on_the_way. No stock/commission side effects, but still idempotent against repeat taps. */
export async function advanceStatus(
  orderId: string,
  status: Extract<OrderStatus, 'preparing' | 'on_the_way'>,
  changedBy: string
): Promise<Result> {
  const order = await getOrder(orderId)
  if (!order) return { ok: false, error: 'Order not found' }
  if (order.status === status) return { ok: true } // already there — no-op

  await recordStatusChange(orderId, status, changedBy)
  return { ok: true }
}

/**
 * on_the_way -> delivered. Creates the affiliate commission snapshot if the
 * order came via a partner QR (plus a one-time first-sale bonus notice for
 * that commercial), and separately contributes to the assigned driver's
 * milestone bonus pool. Idempotent: a repeat call after the order is already
 * delivered is a no-op, so double-tapping "Delivered" can't insert a
 * duplicate affiliate_commissions row or double-count a bonus contribution.
 */
export async function markDelivered(orderId: string, changedBy: string): Promise<Result> {
  const order = await getOrder(orderId)
  if (!order) return { ok: false, error: 'Order not found' }
  if (order.status === 'delivered') return { ok: true } // already delivered — no-op

  await recordStatusChange(orderId, 'delivered', changedBy)

  // Compute the full payout ONCE (single source of truth — lib/calculations.ts),
  // then apply every side effect from it: freeze the payout snapshot on the
  // order (decision D5), record the partner commission (now charged on MARGIN,
  // stored with commission_base), and fund the driver bonus pool. Wrapped so a
  // side-effect failure surfaces to the owner instead of 500-ing a delivery
  // whose status is already committed.
  try {
    const [items, settings] = await Promise.all([getOrderItems(orderId), getSettings()])
    const costOfGoods = items.reduce((sum, i) => sum + i.unit_cost_price * i.quantity, 0)

    const driverIsOwner = order.driver_id
      ? Boolean((await supabaseAdmin.from('drivers').select('is_owner').eq('id', order.driver_id).single()).data?.is_owner)
      : false

    // Resolve the attributed partner (still via this order's QR in Phase 1;
    // Phase 2 switches to the customer's first_qr_source).
    let partnerId: string | null = null
    let partner: { commission_rate: number; first_sale_bonus_amount: number; welcome_bonus_trigger_orders: number } | null = null
    if (order.qr_code_id) {
      const { data: qrCode } = await supabaseAdmin.from('qr_codes').select('partner_id').eq('id', order.qr_code_id).single()
      if (qrCode?.partner_id) {
        const { data: p } = await supabaseAdmin
          .from('partners')
          .select('commission_rate, first_sale_bonus_amount, welcome_bonus_trigger_orders')
          .eq('id', qrCode.partner_id)
          .single()
        if (p) {
          partnerId = qrCode.partner_id
          partner = p
        }
      }
    }

    // Referral credit applied on this order = the gap between the priced total
    // and subtotal+delivery−discount. Owner-borne (decision D2).
    const creditApplied = round2(order.subtotal + order.delivery_fee - order.discount - order.total)

    const payout = calculatePayout({
      subtotal: order.subtotal,
      discount: order.discount,
      deliveryFee: order.delivery_fee,
      creditApplied,
      costOfGoods,
      driverIsOwner,
      partnerCommissionRate: partner?.commission_rate ?? 0,
      driverShare: settings.driverShare,
      ownerFloor: settings.ownerFloor,
    })

    // Freeze the payout snapshot on the order.
    await supabaseAdmin
      .from('orders')
      .update({ margin: payout.margin, driver_payout: payout.driverPayout, owner_net: payout.ownerNet })
      .eq('id', order.id)

    // Partner commission — charged on the margin, stored with its base.
    if (partnerId && partner) {
      const { count: priorCommissions } = await supabaseAdmin
        .from('affiliate_commissions')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', partnerId)

      await supabaseAdmin.from('affiliate_commissions').insert({
        partner_id: partnerId,
        order_id: order.id,
        order_total: order.total,
        commission_base: payout.margin,
        commission_rate: partner.commission_rate,
        commission_amount: payout.affiliateCommission,
      })

      const triggerOrders = partner.welcome_bonus_trigger_orders ?? 1
      if ((priorCommissions ?? 0) === triggerOrders - 1) {
        await notifyFirstSaleBonus(partnerId, partner.first_sale_bonus_amount ?? 10, triggerOrders).catch((err) => {
          console.error(`Welcome bonus notification failed for order ${orderId}:`, err)
        })
      }
    }

    // Fund the global driver bonus pool from owner net (non-owner deliveries only).
    if (order.driver_id && !driverIsOwner) {
      const contribution = calculateBonusPoolContribution(payout.ownerNet, settings.bonusPoolRate)
      await contributeToPool(contribution)
    }
  } catch (err) {
    console.error(`Delivery side effects failed for order ${orderId}:`, err)
    await notifyOwner(
      `⚠️ Order #${orderId.slice(0, 8)} delivered but its payout/commission/pool side effects failed — check manually.`
    ).catch(() => {})
  }

  return { ok: true }
}

function ordinal(n: number): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
}

async function notifyFirstSaleBonus(partnerId: string, amount: number, triggerOrders: number): Promise<void> {
  const { data: partner } = await supabaseAdmin
    .from('partners')
    .select('name, telegram_id')
    .eq('id', partnerId)
    .single()
  if (!partner) return

  const ord = ordinal(triggerOrders)

  await notifyOwner(
    `🎉 ${partner.name} just hit their ${ord} referred sale — $${amount.toFixed(2)} welcome bonus owed.`
  )

  if (partner.telegram_id) {
    await sendMessage(
      partner.telegram_id,
      `🎉 *Congrats!*\n\nYou've reached your ${ord} referral and earned a *$${amount.toFixed(2)} welcome bonus* 🥳\n\nHAZE will arrange payment shortly.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {})
  }
}

/**
 * Cancels an order at any stage. Only refunds stock if it was actually
 * committed (i.e. the order had already been confirmed) — a still-pending
 * order never touched product_batches in the first place. Idempotent via
 * the delivered/cancelled guard below.
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
