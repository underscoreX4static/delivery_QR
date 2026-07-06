import { supabaseAdmin } from '@/lib/supabase'
import { calculatePayout } from '@/lib/calculations'
import { getBrisbaneDayBounds, getBrisbaneDateString } from '@/lib/store-hours'
import { notifyOwner, sendMessage } from '@/lib/telegram'
import type { OrderItem, Settlement } from '@/types/index'

type Result = { ok: true; settlement: Settlement } | { ok: false; error: string }

/** Orders already covered by any settlement (any status) are excluded from new ones. */
async function alreadySettledOrderIds(): Promise<Set<string>> {
  const { data } = await supabaseAdmin.from('settlement_orders').select('order_id')
  return new Set((data ?? []).map((r) => r.order_id))
}

async function costOfGoodsForOrder(orderId: string): Promise<number> {
  const { data } = await supabaseAdmin.from('order_items').select('*').eq('order_id', orderId)
  return ((data as OrderItem[]) ?? []).reduce((sum, i) => sum + i.unit_cost_price * i.quantity, 0)
}

/**
 * Daily driver settlement: all delivered orders for the driver today that
 * aren't already part of another settlement. Notifies the driver via
 * Telegram with confirm/deny buttons (step 4-5 of the settlement flow).
 */
export async function createDriverSettlement(driverId: string, proposedBy: string): Promise<Result> {
  const { data: driver } = await supabaseAdmin.from('drivers').select('*').eq('id', driverId).single()
  if (!driver) return { ok: false, error: 'Driver not found' }

  const { start, end } = getBrisbaneDayBounds()
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('driver_id', driverId)
    .eq('status', 'delivered')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())

  const settled = await alreadySettledOrderIds()
  const eligibleOrders = (orders ?? []).filter((o) => !settled.has(o.id))

  if (eligibleOrders.length === 0) {
    return { ok: false, error: 'No unsettled delivered orders for this driver today' }
  }

  let totalCash = 0
  let payoutAmount = 0
  for (const order of eligibleOrders) {
    const costOfGoods = await costOfGoodsForOrder(order.id)
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

  const today = getBrisbaneDateString()
  const { data: settlement, error } = await supabaseAdmin
    .from('settlements')
    .insert({
      type: 'driver',
      status: 'proposed',
      driver_id: driverId,
      period_start: today,
      period_end: today,
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

  await sendMessage(
    driver.telegram_id,
    `💰 Daily settlement — you collected $${settlement.total_cash.toFixed(2)} today (${eligibleOrders.length} deliveries). Your share: $${settlement.payout_amount.toFixed(2)}. Do you confirm?`,
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
 */
export async function createPartnerSettlement(
  partnerId: string,
  periodStart: string,
  periodEnd: string,
  proposedBy: string
): Promise<Result> {
  const { data: commissions } = await supabaseAdmin
    .from('affiliate_commissions')
    .select('commission_amount')
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
  return { ok: true, settlement: settlement as Settlement }
}

export async function confirmDriverSettlement(settlementId: string): Promise<Result> {
  const { data: settlement, error } = await supabaseAdmin
    .from('settlements')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', settlementId)
    .select('*')
    .single()

  if (error || !settlement) return { ok: false, error: 'Settlement not found' }
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
 */
export async function markSettlementPaid(settlementId: string): Promise<Result> {
  const { data: settlement } = await supabaseAdmin.from('settlements').select('*').eq('id', settlementId).single()
  if (!settlement) return { ok: false, error: 'Settlement not found' }

  const { data: updated, error } = await supabaseAdmin
    .from('settlements')
    .update({ status: 'paid' })
    .eq('id', settlementId)
    .select('*')
    .single()

  if (error || !updated) return { ok: false, error: 'Failed to update settlement' }

  if (settlement.type === 'partner') {
    const partnerId = settlement.notes?.match(/^partner:([0-9a-f-]{36})$/i)?.[1]
    if (partnerId) {
      await supabaseAdmin
        .from('affiliate_commissions')
        .update({ paid_out: true, paid_out_at: new Date().toISOString() })
        .eq('partner_id', partnerId)
        .eq('paid_out', false)
        .gte('created_at', settlement.period_start)
        .lte('created_at', settlement.period_end)
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

export async function confirmSettlementReceived(settlementId: string): Promise<Result> {
  const { data: settlement, error } = await supabaseAdmin
    .from('settlements')
    .update({ status: 'payment_received', payment_confirmed_at: new Date().toISOString() })
    .eq('id', settlementId)
    .select('*')
    .single()

  if (error || !settlement) return { ok: false, error: 'Settlement not found' }
  return { ok: true, settlement: settlement as Settlement }
}

export function parsePartnerIdFromNotes(notes: string | null): string | null {
  return notes?.match(/^partner:([0-9a-f-]{36})$/i)?.[1] ?? null
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
