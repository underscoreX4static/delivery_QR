import { supabaseAdmin } from '@/lib/supabase'
import { resolvePayout } from '@/lib/earnings'
import { getSettings } from '@/lib/settings'
import { getBrisbaneDateString } from '@/lib/store-hours'
import { getUnsettledGrants, markSettlementGrantsPaid } from '@/lib/driver-pool'
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

  // Discretionary bonuses the owner granted from the pool that haven't been
  // settled yet — paid out together with the cash share, in the same
  // settlement, so the driver gets one figure and one detailed breakdown.
  const grants = await getUnsettledGrants(driverId)
  const grantsTotal = grants.reduce((sum, g) => sum + g.amount, 0)

  if (eligibleOrders.length === 0 && grants.length === 0) {
    return { ok: false, error: 'No unsettled deliveries or bonuses for this driver' }
  }

  const [costOfGoodsMap, settings] = await Promise.all([
    costOfGoodsByOrder(eligibleOrders.map((o) => o.id)),
    getSettings(),
  ])

  let totalCash = 0
  let cashShare = 0
  for (const order of eligibleOrders) {
    // Prefer the driver-payout snapshot frozen at delivery (decision D5); the
    // commission snapshot is irrelevant here (driver payout doesn't depend on it).
    const { driverPayout } = resolvePayout(order, costOfGoodsMap.get(order.id) ?? 0, driver.is_owner, 0, settings)
    totalCash += order.total
    cashShare += driverPayout
  }

  const payoutAmount = cashShare + grantsTotal

  // Period spans the orders; fall back to today when it's a bonus-only settlement.
  const orderDates = eligibleOrders.map((o) => getBrisbaneDateString(new Date(o.created_at))).sort()
  const periodStart = orderDates[0] ?? getBrisbaneDateString(new Date())
  const periodEnd = orderDates[orderDates.length - 1] ?? periodStart

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

  if (eligibleOrders.length > 0) {
    await supabaseAdmin
      .from('settlement_orders')
      .insert(eligibleOrders.map((o) => ({ settlement_id: settlement.id, order_id: o.id })))
  }

  // Freeze exactly these grants into the settlement so bonuses granted after
  // this point don't leak into a settlement the driver already reviewed.
  if (grants.length > 0) {
    await supabaseAdmin
      .from('driver_bonus_grants')
      .update({ settlement_id: settlement.id })
      .in('id', grants.map((g) => g.id))
  }

  const periodLabel = periodStart === periodEnd ? `on ${periodStart}` : `${periodStart} to ${periodEnd}`
  const cashLine =
    eligibleOrders.length > 0
      ? `You collected $${round2(totalCash).toFixed(2)} ${periodLabel} (${eligibleOrders.length} deliveries). Cash share: $${round2(cashShare).toFixed(2)}.`
      : 'No new deliveries this settlement.'
  const bonusLine = grantsTotal > 0 ? `\n🎁 Bonuses: $${round2(grantsTotal).toFixed(2)} (${grants.length}).` : ''

  // Plain text (no parse_mode) so no special character in the amounts/labels
  // can make Telegram reject the message. And never let a delivery failure
  // (blocked bot, unreachable id) throw — the settlement is already persisted,
  // so we surface a warning to the owner instead of 500-ing the request.
  try {
    await sendMessage(
      driver.telegram_id,
      `💰 Settlement — ${cashLine}${bonusLine}\n\nTotal due: $${round2(payoutAmount).toFixed(2)}. Do you confirm?`,
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
  } catch (err) {
    console.error(`Settlement ${settlement.id} created but driver notification failed:`, err)
    await notifyOwner(
      `⚠️ Settlement #${settlement.id.slice(0, 8)} created, but I couldn't message the driver on Telegram. Ask them to open the bot (/start), then resend.`
    ).catch(() => {})
  }

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
    // Bonuses frozen into this settlement are disbursed now that it's paid.
    await markSettlementGrantsPaid(settlementId)

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

/**
 * Deletes a settlement that hasn't been paid yet — for cleaning up ones
 * created by mistake (e.g. a failed Telegram notify that still inserted the
 * row). Only 'proposed' and 'confirmed' are removable: once 'paid', grants
 * were marked paid_out and cash moved, so deleting would strand them.
 *
 * The FKs do the reversal cleanly: settlement_orders rows cascade-delete
 * (freeing those orders for a new settlement) and driver_bonus_grants.settlement_id
 * resets to null (making the bonuses re-settleable). Grants keep paid_out=false.
 */
export async function deleteSettlement(settlementId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: settlement } = await supabaseAdmin
    .from('settlements')
    .select('status')
    .eq('id', settlementId)
    .single()

  if (!settlement) return { ok: false, error: 'Settlement not found' }
  if (settlement.status !== 'proposed' && settlement.status !== 'confirmed') {
    return { ok: false, error: 'Only unpaid settlements (proposed or confirmed) can be cancelled' }
  }

  const { error } = await supabaseAdmin
    .from('settlements')
    .delete()
    .eq('id', settlementId)
    .in('status', ['proposed', 'confirmed'])

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export function parsePartnerIdFromNotes(notes: string | null): string | null {
  return notes?.match(/^partner:([0-9a-f-]{36})$/i)?.[1] ?? null
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
