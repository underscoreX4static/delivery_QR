import { supabaseAdmin } from '@/lib/supabase'
import { sendMessage } from '@/lib/telegram'
import type { DriverBonusGrant } from '@/types/index'

// The driver bonus pool is a SINGLE global budget (settings key
// `driver_pool_balance`), funded by a share of owner net on every
// non-owner-driver delivery (see markDelivered). The owner draws discretionary
// fixed bonuses from it and grants them to any driver(s); grants are paid out
// with the driver's settlement. This replaces the old per-driver auto-pool +
// fixed milestones — the driver's regular cut (delivery fee + 38%) is
// unchanged and lives entirely in lib/calculations.ts.

const POOL_KEY = 'driver_pool_balance'
const BALANCE_UPDATE_RETRY_ATTEMPTS = 8

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Current global pool budget. Missing key (migration not yet run) reads as 0. */
export async function getPoolBalance(): Promise<number> {
  const { data } = await supabaseAdmin.from('settings').select('value').eq('key', POOL_KEY).single()
  return data ? Number(data.value) : 0
}

/**
 * Adjusts the global pool balance by delta, with optimistic-concurrency retry
 * (same guard pattern as lib/inventory.ts) so a delivery contribution and a
 * grant landing together can't clobber each other. Upserts the row if the
 * migration seeded it late.
 */
async function adjustPoolBalance(delta: number): Promise<void> {
  for (let attempt = 0; attempt < BALANCE_UPDATE_RETRY_ATTEMPTS; attempt++) {
    const { data: row } = await supabaseAdmin.from('settings').select('value').eq('key', POOL_KEY).single()

    if (!row) {
      const { error } = await supabaseAdmin
        .from('settings')
        .insert({ key: POOL_KEY, value: String(round2(delta)) })
      if (!error) return
      continue // someone else inserted first — loop and update instead
    }

    const current = Number(row.value)
    const { error, count } = await supabaseAdmin
      .from('settings')
      .update({ value: String(round2(current + delta)), updated_at: new Date().toISOString() }, { count: 'exact' })
      .eq('key', POOL_KEY)
      .eq('value', row.value)

    if (!error && count) return
  }
  throw new Error('Failed to adjust driver pool balance: too much concurrent contention')
}

/** Sets aside a slice of owner net from one delivered order into the global pool. */
export async function contributeToPool(amount: number): Promise<void> {
  if (amount <= 0) return
  await adjustPoolBalance(amount)
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

  await adjustPoolBalance(-total)

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
