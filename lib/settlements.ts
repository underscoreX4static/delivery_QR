import { supabaseAdmin } from '@/lib/supabase'
import { calculatePayout } from '@/lib/calculations'
import { getBrisbaneDateString } from '@/lib/store-hours'
import { notifyOwner, sendMessage } from '@/lib/telegram'
import type { OrderItem, Settlement } from '@/types/index'

type Result = { ok: true; settlement: Settlement } | { ok: false; error: string }

/** Orders already covered by any settlement (any status) are excluded from new ones. */
async function alreadySettledOrderIds(): Promise<Set<string>> {
  const { data } = await supabaseAdmin.from('settlement_orders').select('order_id')
  return new Set((data ?? []).map((r) => r.order_id))
}

/** Sums unit_cost_price × quantity per order in a single grouped query rather than one per order. */
async function costOfGoodsByOrder(orderIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (orderIds.length === 0) return result

  const { data } = await supabaseAdmin.from('order_items').select('*').in('order_id', orderIds)
  for (const item of (data as OrderItem[]) ?? []) {
    result.set(item.order_id, (result.get(item.order_id) ?? 0) + item.unit_cost_price * item.quantity)
  }
  return result
}

/**
 * Driver settlement: every delivered order for the driver that isn't already
 * part of another settlement. Notifies the driver via Telegram with
 * confirm/deny buttons (step 4-5 of the settlement flow).
 *
 * Deliberately not scoped to "today" by created_at — an order created late
 * one night and delivered just after midnight would otherwise fall between
 * two days' settlements and never get reconciled. The already-settled check
 * is what prevents double-counting, so any outstanding delivered order is
 * fair game regardless of when it was placed. In practice the owner doesn't
 * settle daily — cash gets collected from a driver every few days — so
 * period_start/period_end are set from the actual span of included orders
 * rather than always being "today", or a multi-day settlement would
 * misleadingly display as a single day.
 */
export async function createDriverSettlement(driverId: string, proposedBy: string): Promise<Result> {
  const { data: driver } = await supabaseAdmin.from('drivers').select('*').eq('id', driverId).single()
  if (!driver) return { ok: false, error: 'Driver not found' }

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('driver_id', driverId)
    .eq('status', 'delivered')

  const settled = await alreadySettledOrderIds()
  const eligibleOrders = (orders ?? []).filter((o) => !settled.has(o.id))

  if (eligibleOrders.length === 0) {
    return { ok: false, error: 'No unsettled delivered orders for this driver' }
  }

  const costOfGoodsMap = await costOfGoodsByOrder(eligibleOrders.map((o) => o.id))

  let totalCash = 0
  let payoutAmount = 0
  for (const order of eligibleOrders) {
    const costOfGoods = costOfGoodsMap.get(order.id) ?? 0
    const payout = calculatePayout({
      subtotal: order.subtotal,
      deliveryFee: order.delivery_fee,
      discount: order.discount,
      total: order.total,
      costOfGoods,
      driverIsOwner: driver.is_owner,
      partnerCommissionRate: 0,
    })
    totalCash += order.total
    payoutAmount += payout.driverPayout
  }

  const orderDates = eligibleOrders.map((o) => getBrisbaneDateString(new Date(o.created_at))).sort()
  const periodStart = orderDates[0]
  const periodEnd = orderDates[orderDates.length - 1]

  const { data: settlement, error } = await supabaseAdmin
    .from('settlements')
    .insert({
      type: 'driver',
      status: 'proposed',
      driver_id: driverId,
      period_start: periodStart,
      period_end: periodEnd,
      total_cash: round2(totalCash),
      payout_amount: round2(payoutAmount),
      proposed_by: proposedBy,
    })
    .select('*')
    .single()

  if (error || !settlement) return { ok: false, error: error?.message ?? 'Failed to create settlement' }

  await supabaseAdmin
    .from('settlement_orders')
    .insert(eligibleOrders.map((o) => ({ settlement_id: settlement.id, order_id: o.id })))

  const periodLabel = periodStart === periodEnd ? `on ${periodStart}` : `${periodStart} to ${periodEnd}`

  await sendMessage(
    driver.telegram_id,
    `💰 Settlement — you collected $${settlement.total_cash.toFixed(2)} ${periodLabel} (${eligibleOrders.length} deliveries). Your share: $${settlement.payout_amount.toFixed(2)}. Do you confirm?`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirm', callback_data: `settle_confirm:${settlement.id}` },
            { text: '❌ Dispute', callback_data: `settle_deny:${settlement.id}` },
          ],
        ],
      },
    }
  )

  return { ok: true, settlement: settlement as Settlement }
}

/**
 * On-demand partner/affiliate settlement over an arbitrary date range —
 * sums unpaid commissions. No driver-style Telegram confirmation loop;
 * goes straight to 'confirmed', awaiting the admin's "mark paid" action.
 *
 * The exact set of covered orders is frozen into settlement_orders at
 * creation time (same table the driver flow uses) rather than re-deriving
 * "unpaid commissions in this period" again when markSettlementPaid() runs.
 * Without that, any commission created in the gap between creating the
 * settlement and the admin clicking "mark paid" — which can be hours or
 * days later — would get silently flipped to paid_out without ever having
 * been included in the total the admin actually reviewed and paid out.
 */
export async function createPartnerSettlement(
  partnerId: string,
  periodStart: string,
  periodEnd: string,
  proposedBy: string
): Promise<Result> {
  const { data: commissions } = await supabaseAdmin
    .from('affiliate_commissions')
    .select('order_id, commission_amount')
    .eq('partner_id', partnerId)
    .eq('paid_out', false)
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd)

  const total = (commissions ?? []).reduce((sum, c) => sum + c.commission_amount, 0)
  if (total <= 0) return { ok: false, error: 'No unpaid commissions in this period' }

  const { data: settlement, error } = await supabaseAdmin
    .from('settlements')
    .insert({
      type: 'partner',
      status: 'confirmed',
      driver_id: null,
      period_start: periodStart,
      period_end: periodEnd,
      total_cash: round2(total),
      payout_amount: round2(total),
      proposed_by: proposedBy,
      confirmed_at: new Date().toISOString(),
      // settlements has no partner_id column — encode it in notes since
      // driver_id is null for partner-type settlements.
      notes: `partner:${partnerId}`,
    })
    .select('*')
    .single()

  if (error || !settlement) return { ok: false, error: error?.message ?? 'Failed to create settlement' }

  await supabaseAdmin
    .from('settlement_orders')
    .insert((commissions ?? []).map((c) => ({ settlement_id: settlement.id, order_id: c.order_id })))

  return { ok: true, settlement: settlement as Settlement }
}

/** Driver's telegram_id for a settlement, or null — used to authorize the confirm/receive callbacks. */
export async function getSettlementDriverTelegramId(settlementId: string): Promise<string | null> {
  const { data: settlement } = await supabaseAdmin
    .from('settlements')
    .select('driver_id')
    .eq('id', settlementId)
    .single()
  if (!settlement?.driver_id) return null

  const { data: driver } = await supabaseAdmin
    .from('drivers')
    .select('telegram_id')
    .eq('id', settlement.driver_id)
    .single()
  return driver?.telegram_id ?? null
}

/**
 * proposed -> confirmed. Conditioned on the current status so re-tapping an
 * old Telegram message (e.g. after the owner has already marked it paid)
 * can't regress the settlement backwards through the state machine.
 */
export async function confirmDriverSettlement(settlementId: string): Promise<Result> {
  const { data: settlement, error } = await supabaseAdmin
    .from('settlements')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', settlementId)
    .eq('status', 'proposed')
    .select('*')
    .single()

  if (error || !settlement) return { ok: false, error: 'Settlement not found, or already past the "proposed" step' }
  return { ok: true, settlement: settlement as Settlement }
}

export async function disputeSettlement(settlementId: string, stage: 'confirm' | 'received'): Promise<void> {
  await notifyOwner(
    `⚠️ Driver disputed settlement #${settlementId.slice(0, 8)} at the "${stage}" step — please resolve manually.`
  )
}

/**
 * Admin marks the settlement as physically paid. For driver settlements
 * this prompts the driver to confirm receipt (step 8); for partner
 * settlements it directly flips the covered commissions to paid_out.
 * Conditioned on the current status being 'confirmed' so a repeated click
 * can't re-run the payout side effects (double Telegram prompt to the
 * driver, or re-flipping already-paid commissions).
 */
export async function markSettlementPaid(settlementId: string): Promise<Result> {
  const { data: settlement } = await supabaseAdmin.from('settlements').select('*').eq('id', settlementId).single()
  if (!settlement) return { ok: false, error: 'Settlement not found' }

  const { data: updated, error } = await supabaseAdmin
    .from('settlements')
    .update({ status: 'paid' })
    .eq('id', settlementId)
    .eq('status', 'confirmed')
    .select('*')
    .single()

  if (error || !updated) return { ok: false, error: 'Settlement not found, or not awaiting payment' }

  if (settlement.type === 'partner') {
    // Pay out exactly the orders frozen into settlement_orders at creation —
    // never re-derive "unpaid commissions in this period" here, or a
    // commission created after creation but before this call gets paid
    // without ever having been part of the reviewed total.
    const { data: coveredOrders } = await supabaseAdmin
      .from('settlement_orders')
      .select('order_id')
      .eq('settlement_id', settlementId)
    const orderIds = (coveredOrders ?? []).map((o) => o.order_id)

    if (orderIds.length > 0) {
      await supabaseAdmin
        .from('affiliate_commissions')
        .update({ paid_out: true, paid_out_at: new Date().toISOString() })
        .in('order_id', orderIds)
        .eq('paid_out', false)
    }
  } else if (settlement.driver_id) {
    const { data: driver } = await supabaseAdmin
      .from('drivers')
      .select('telegram_id')
      .eq('id', settlement.driver_id)
      .single()

    if (driver?.telegram_id) {
      await sendMessage(driver.telegram_id, `💵 Did you receive $${settlement.payout_amount.toFixed(2)} in cash?`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Yes', callback_data: `settle_received:${settlementId}` },
              { text: '❌ No', callback_data: `settle_received_deny:${settlementId}` },
            ],
          ],
        },
      })
    }
  }

  return { ok: true, settlement: updated as Settlement }
}

/** paid -> payment_received. Conditioned on status for the same reason as confirmDriverSettlement above. */
export async function confirmSettlementReceived(settlementId: string): Promise<Result> {
  const { data: settlement, error } = await supabaseAdmin
    .from('settlements')
    .update({ status: 'payment_received', payment_confirmed_at: new Date().toISOString() })
    .eq('id', settlementId)
    .eq('status', 'paid')
    .select('*')
    .single()

  if (error || !settlement) return { ok: false, error: 'Settlement not found, or already past the "paid" step' }
  return { ok: true, settlement: settlement as Settlement }
}

export function parsePartnerIdFromNotes(notes: string | null): string | null {
  return notes?.match(/^partner:([0-9a-f-]{36})$/i)?.[1] ?? null
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
