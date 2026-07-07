import { supabaseAdmin } from '@/lib/supabase'
import { COMMERCIAL_BONUS_MILESTONES } from '@/lib/calculations'
import { notifyOwner, sendMessage } from '@/lib/telegram'
import type { PartnerBonus } from '@/types/index'

const BALANCE_UPDATE_RETRY_ATTEMPTS = 5

/**
 * Adds (or, with a negative amount, removes) from a partner's bonus pool
 * balance. Same optimistic-concurrency + retry pattern as
 * lib/inventory.ts's incrementBatch — a delivery landing at the same instant
 * as a payout shouldn't be able to read-then-write over each other and lose
 * an update.
 */
async function adjustBonusPoolBalance(partnerId: string, delta: number): Promise<void> {
  for (let attempt = 0; attempt < BALANCE_UPDATE_RETRY_ATTEMPTS; attempt++) {
    const { data: partner, error: readError } = await supabaseAdmin
      .from('partners')
      .select('bonus_pool_balance')
      .eq('id', partnerId)
      .single()

    if (readError || !partner) throw new Error(`Partner ${partnerId} not found`)

    const currentBalance = partner.bonus_pool_balance ?? 0
    const { error: writeError, count } = await supabaseAdmin
      .from('partners')
      .update({ bonus_pool_balance: round2(currentBalance + delta) }, { count: 'exact' })
      .eq('id', partnerId)
      .eq('bonus_pool_balance', currentBalance)

    if (!writeError && count) return
  }

  throw new Error(`Failed to adjust bonus pool for partner ${partnerId}: too much concurrent contention`)
}

/** Sets aside a slice of the owner's net profit on one delivered order into the partner's bonus pool. */
export async function contributeToBonusPool(partnerId: string, contribution: number): Promise<void> {
  if (contribution <= 0) return
  await adjustBonusPoolBalance(partnerId, contribution)
}

/**
 * Counts the partner's lifetime delivered orders and awards any milestone
 * that's newly been crossed. Idempotent via the DB's unique(partner_id,
 * milestone_orders) constraint on partner_bonuses — an insert attempt for an
 * already-awarded milestone hits that constraint and is silently skipped,
 * so calling this more than once for the same delivery can't double-award.
 */
export async function checkAndAwardMilestones(partnerId: string): Promise<void> {
  const { data: qrCodes } = await supabaseAdmin.from('qr_codes').select('id').eq('partner_id', partnerId)
  const qrIds = (qrCodes ?? []).map((q) => q.id)
  if (qrIds.length === 0) return

  const { count: deliveredCount } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .in('qr_code_id', qrIds)
    .eq('status', 'delivered')

  const lifetimeOrders = deliveredCount ?? 0
  const eligibleMilestones = COMMERCIAL_BONUS_MILESTONES.filter((m) => m.orders <= lifetimeOrders)

  for (const milestone of eligibleMilestones) {
    const { data: awarded, error } = await supabaseAdmin
      .from('partner_bonuses')
      .insert({ partner_id: partnerId, milestone_orders: milestone.orders, bonus_amount: milestone.bonus })
      .select('*')
      .single()

    if (error?.code === '23505') continue // already awarded this milestone — expected on every call after the first
    if (error || !awarded) {
      console.error(`Failed to record milestone bonus for partner ${partnerId}:`, error?.message)
      continue
    }

    await notifyNewMilestone(partnerId, milestone.orders, milestone.bonus)
  }
}

async function notifyNewMilestone(partnerId: string, milestoneOrders: number, bonusAmount: number): Promise<void> {
  const { data: partner } = await supabaseAdmin
    .from('partners')
    .select('name, telegram_id')
    .eq('id', partnerId)
    .single()
  if (!partner) return

  await notifyOwner(
    `🎉 ${partner.name} hit ${milestoneOrders} delivered orders — $${bonusAmount.toFixed(2)} milestone bonus owed.`
  )

  if (partner.telegram_id) {
    await sendMessage(
      partner.telegram_id,
      `🎉 *Milestone reached!*\n\nYou just hit *${milestoneOrders} delivered orders*! You've earned a *$${bonusAmount.toFixed(2)} bonus* 🥳\n\nHAZE will arrange payment shortly.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {})
  }
}

/** Admin marks a milestone bonus as physically paid — deducts it from the pool balance and notifies the commercial. */
export async function markBonusPaid(bonusId: string): Promise<{ ok: true; bonus: PartnerBonus } | { ok: false; error: string }> {
  const { data: bonus, error } = await supabaseAdmin
    .from('partner_bonuses')
    .update({ paid_out: true, paid_out_at: new Date().toISOString() })
    .eq('id', bonusId)
    .eq('paid_out', false)
    .select('*')
    .single()

  if (error || !bonus) return { ok: false, error: 'Bonus not found, or already paid' }

  await adjustBonusPoolBalance(bonus.partner_id, -bonus.bonus_amount)

  const { data: partner } = await supabaseAdmin
    .from('partners')
    .select('name, telegram_id')
    .eq('id', bonus.partner_id)
    .single()

  if (partner?.telegram_id) {
    await sendMessage(
      partner.telegram_id,
      `💵 Your *$${bonus.bonus_amount.toFixed(2)}* milestone bonus (${bonus.milestone_orders} orders) has been paid out!`,
      { parse_mode: 'Markdown' }
    ).catch(() => {})
  }

  return { ok: true, bonus: bonus as PartnerBonus }
}

export async function getPartnerBonuses(partnerId: string): Promise<PartnerBonus[]> {
  const { data } = await supabaseAdmin
    .from('partner_bonuses')
    .select('*')
    .eq('partner_id', partnerId)
    .order('milestone_orders', { ascending: true })
  return (data as PartnerBonus[]) ?? []
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
