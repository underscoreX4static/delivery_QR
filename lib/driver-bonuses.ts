import { supabaseAdmin } from '@/lib/supabase'
import { DRIVER_BONUS_MILESTONES } from '@/lib/calculations'
import { notifyOwner, sendMessage } from '@/lib/telegram'
import type { DriverBonus } from '@/types/index'

const BALANCE_UPDATE_RETRY_ATTEMPTS = 5

/**
 * Adds (or, with a negative amount, removes) from a driver's bonus pool
 * balance. Same optimistic-concurrency + retry pattern as
 * lib/inventory.ts's incrementBatch — a delivery landing at the same instant
 * as a payout shouldn't be able to read-then-write over each other and lose
 * an update.
 */
async function adjustBonusPoolBalance(driverId: string, delta: number): Promise<void> {
  for (let attempt = 0; attempt < BALANCE_UPDATE_RETRY_ATTEMPTS; attempt++) {
    const { data: driver, error: readError } = await supabaseAdmin
      .from('drivers')
      .select('bonus_pool_balance')
      .eq('id', driverId)
      .single()

    if (readError || !driver) throw new Error(`Driver ${driverId} not found`)

    const currentBalance = driver.bonus_pool_balance ?? 0
    const { error: writeError, count } = await supabaseAdmin
      .from('drivers')
      .update({ bonus_pool_balance: round2(currentBalance + delta) }, { count: 'exact' })
      .eq('id', driverId)
      .eq('bonus_pool_balance', currentBalance)

    if (!writeError && count) return
  }

  throw new Error(`Failed to adjust bonus pool for driver ${driverId}: too much concurrent contention`)
}

/** Sets aside a slice of the owner's net profit on one delivered order into the driver's bonus pool. */
export async function contributeToBonusPool(driverId: string, contribution: number): Promise<void> {
  if (contribution <= 0) return
  await adjustBonusPoolBalance(driverId, contribution)
}

/**
 * Counts the driver's lifetime delivered orders and awards any milestone
 * that's newly been crossed. Idempotent via the DB's unique(driver_id,
 * milestone_orders) constraint on driver_bonuses — an insert attempt for an
 * already-awarded milestone hits that constraint and is silently skipped,
 * so calling this more than once for the same delivery can't double-award.
 */
export async function checkAndAwardMilestones(driverId: string): Promise<void> {
  const { count: deliveredCount } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('driver_id', driverId)
    .eq('status', 'delivered')

  const lifetimeOrders = deliveredCount ?? 0
  const eligibleMilestones = DRIVER_BONUS_MILESTONES.filter((m) => m.orders <= lifetimeOrders)

  for (const milestone of eligibleMilestones) {
    const { data: awarded, error } = await supabaseAdmin
      .from('driver_bonuses')
      .insert({ driver_id: driverId, milestone_orders: milestone.orders, bonus_amount: milestone.bonus })
      .select('*')
      .single()

    if (error?.code === '23505') continue // already awarded this milestone — expected on every call after the first
    if (error || !awarded) {
      console.error(`Failed to record milestone bonus for driver ${driverId}:`, error?.message)
      continue
    }

    await notifyNewMilestone(driverId, milestone.orders, milestone.bonus)
  }
}

async function notifyNewMilestone(driverId: string, milestoneOrders: number, bonusAmount: number): Promise<void> {
  const { data: driver } = await supabaseAdmin
    .from('drivers')
    .select('first_name, telegram_id')
    .eq('id', driverId)
    .single()
  if (!driver) return

  await notifyOwner(
    `🎉 ${driver.first_name} hit ${milestoneOrders} delivered orders — $${bonusAmount.toFixed(2)} milestone bonus owed.`
  )

  await sendMessage(
    driver.telegram_id,
    `🎉 *Milestone reached!*\n\nYou just hit *${milestoneOrders} delivered orders*! You've earned a *$${bonusAmount.toFixed(2)} bonus* 🥳\n\nHAZE will arrange payment shortly.`,
    { parse_mode: 'Markdown' }
  ).catch(() => {})
}

/** Admin marks a milestone bonus as physically paid — deducts it from the pool balance and notifies the driver. */
export async function markBonusPaid(bonusId: string): Promise<{ ok: true; bonus: DriverBonus } | { ok: false; error: string }> {
  const { data: bonus, error } = await supabaseAdmin
    .from('driver_bonuses')
    .update({ paid_out: true, paid_out_at: new Date().toISOString() })
    .eq('id', bonusId)
    .eq('paid_out', false)
    .select('*')
    .single()

  if (error || !bonus) return { ok: false, error: 'Bonus not found, or already paid' }

  await adjustBonusPoolBalance(bonus.driver_id, -bonus.bonus_amount)

  const { data: driver } = await supabaseAdmin.from('drivers').select('telegram_id').eq('id', bonus.driver_id).single()

  if (driver?.telegram_id) {
    await sendMessage(
      driver.telegram_id,
      `💵 Your *$${bonus.bonus_amount.toFixed(2)}* milestone bonus (${bonus.milestone_orders} orders) has been paid out!`,
      { parse_mode: 'Markdown' }
    ).catch(() => {})
  }

  return { ok: true, bonus: bonus as DriverBonus }
}

export async function getDriverBonuses(driverId: string): Promise<DriverBonus[]> {
  const { data } = await supabaseAdmin
    .from('driver_bonuses')
    .select('*')
    .eq('driver_id', driverId)
    .order('milestone_orders', { ascending: true })
  return (data as DriverBonus[]) ?? []
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
