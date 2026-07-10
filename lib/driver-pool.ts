import { supabaseAdmin } from '@/lib/supabase'
import { sendMessage } from '@/lib/telegram'
import { getDriverBonusBalance, recordPoolMovement } from '@/lib/growth-pool'
import type { DriverBonusGrant } from '@/types/index'

// The driver bonus pool is the 'driver_bonus' pocket of the growth pool ledger
// (lib/growth-pool.ts): funded by a share of owner net on every non-owner-driver
// delivery (in), drawn down by discretionary grants (out). Its balance is the
// frozen opening (settings.driver_pool_balance) plus the ledger net. Grants are
// paid out with the driver's settlement. The driver's regular cut (delivery fee
// + 38% of margin) is unchanged and lives entirely in lib/calculations.ts.

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Current driver-bonus pocket balance (opening + ledger). */
export async function getPoolBalance(): Promise<number> {
  return getDriverBonusBalance()
}

/** Sets aside a slice of owner net from one delivered order into the driver-bonus pocket. */
export async function contributeToPool(amount: number, orderId?: string): Promise<void> {
  if (amount <= 0) return
  await recordPoolMovement('driver_bonus', 'in', amount, { orderId, reference: 'delivery_contribution' })
}

export interface GrantResult {
  ok: boolean
  granted: number
  total: number
  newBalance: number
  error?: string
}

/**
 * Grants a fixed bonus of `amount` to each driver in driverIds, drawn from the
 * global pool. Deducts amount × recipients from the pool (balance may go
 * negative — that's the owner committing more than currently set aside, shown
 * in red in the UI, deliberately allowed). Notifies each driver.
 */
export async function grantBonus(driverIds: string[], amount: number, note: string | null): Promise<GrantResult> {
  const recipients = [...new Set(driverIds)]
  if (recipients.length === 0) return { ok: false, granted: 0, total: 0, newBalance: 0, error: 'No recipients' }
  if (!(amount > 0)) return { ok: false, granted: 0, total: 0, newBalance: 0, error: 'Amount must be positive' }

  // The owner can grant to themselves too — moving pool money into an owner
  // payable is a wash economically, but it's the owner's call to make.
  const { data: validDrivers } = await supabaseAdmin
    .from('drivers')
    .select('id, telegram_id, first_name, is_owner')
    .in('id', recipients)

  const targets = validDrivers ?? []
  if (targets.length === 0) {
    return { ok: false, granted: 0, total: 0, newBalance: await getPoolBalance(), error: 'No matching drivers' }
  }

  const total = round2(amount * targets.length)

  const { error: insertError } = await supabaseAdmin
    .from('driver_bonus_grants')
    .insert(targets.map((d) => ({ driver_id: d.id, amount: round2(amount), note })))

  if (insertError) {
    return { ok: false, granted: 0, total: 0, newBalance: await getPoolBalance(), error: insertError.message }
  }

  await recordPoolMovement('driver_bonus', 'out', total, { reference: 'grant' })

  for (const d of targets) {
    if (!d.telegram_id) continue
    await sendMessage(
      d.telegram_id,
      `🎁 *Bonus!*\n\nYou've been granted a *$${round2(amount).toFixed(2)}* bonus${note ? ` — ${note}` : ''}. It'll be paid with your next settlement.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {})
  }

  return { ok: true, granted: targets.length, total, newBalance: await getPoolBalance() }
}

/** All grants for a driver, newest first. */
export async function getDriverGrants(driverId: string): Promise<DriverBonusGrant[]> {
  const { data } = await supabaseAdmin
    .from('driver_bonus_grants')
    .select('*')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
  return (data as DriverBonusGrant[]) ?? []
}

/** Unpaid, not-yet-settled grants for a driver — the ones a new settlement should pick up. */
export async function getUnsettledGrants(driverId: string): Promise<DriverBonusGrant[]> {
  const { data } = await supabaseAdmin
    .from('driver_bonus_grants')
    .select('*')
    .eq('driver_id', driverId)
    .eq('paid_out', false)
    .is('settlement_id', null)
    .order('created_at', { ascending: true })
  return (data as DriverBonusGrant[]) ?? []
}

/** Total unpaid grants across all drivers — the pool's outstanding hard obligation. */
export async function getTotalUnpaidGrants(): Promise<number> {
  const { data } = await supabaseAdmin.from('driver_bonus_grants').select('amount').eq('paid_out', false)
  return round2((data ?? []).reduce((s, g) => s + g.amount, 0))
}

/** Marks every grant frozen into a settlement as paid. Called when the settlement is marked paid. */
export async function markSettlementGrantsPaid(settlementId: string): Promise<void> {
  await supabaseAdmin
    .from('driver_bonus_grants')
    .update({ paid_out: true, paid_out_at: new Date().toISOString() })
    .eq('settlement_id', settlementId)
    .eq('paid_out', false)
}
