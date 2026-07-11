import { supabaseAdmin } from '@/lib/supabase'
import { acquisitionSpendFromMovements, poolBalanceFromMovements, type PoolCategory, type PoolDirection } from '@/lib/growth-pool-rules'

/**
 * The growth pool ledger (append-only, table pool_movements — see migration
 * 011). One caisse, two tracked pockets:
 *   - driver_bonus : a real budget (in = delivery set-asides, out = grants). Its
 *     balance is settings.driver_pool_balance (frozen as the opening balance)
 *     plus the ledger net.
 *   - acquisition  : a spend tracker (out = commission + promo + referral credit
 *     borne by the owner), so acquisition can be reported apart from bonuses.
 *
 * The ledger is the audit trail; recording is best-effort (a lost movement only
 * skews an advisory balance, never a real obligation — grants owed live in
 * driver_bonus_grants, commissions in affiliate_commissions).
 */

const OPENING_KEY = 'driver_pool_balance'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Appends one movement. Best-effort: logs (never throws) so audit can't break a delivery. */
export async function recordPoolMovement(
  category: PoolCategory,
  direction: PoolDirection,
  amount: number,
  opts?: { orderId?: string | null; reference?: string }
): Promise<void> {
  if (!(amount > 0)) return
  const { error } = await supabaseAdmin.from('pool_movements').insert({
    category,
    direction,
    amount: round2(amount),
    order_id: opts?.orderId ?? null,
    reference: opts?.reference ?? null,
  })
  if (error) console.error(`pool_movements insert failed (${category}/${direction}):`, error.message)
}

/** driver_bonus pocket balance = opening (settings) + ledger net. */
export async function getDriverBonusBalance(): Promise<number> {
  const [{ data: openingRow }, { data: movements }] = await Promise.all([
    supabaseAdmin.from('settings').select('value').eq('key', OPENING_KEY).single(),
    supabaseAdmin.from('pool_movements').select('direction, amount').eq('category', 'driver_bonus'),
  ])
  const opening = openingRow ? Number(openingRow.value) : 0
  return poolBalanceFromMovements(opening, (movements as { direction: PoolDirection; amount: number }[]) ?? [])
}

/** Acquisition spend (out − in) over an optional trailing window. */
export async function getAcquisitionSpend(sinceIso?: string): Promise<number> {
  let query = supabaseAdmin.from('pool_movements').select('direction, amount').eq('category', 'acquisition')
  if (sinceIso) query = query.gte('created_at', sinceIso)
  const { data } = await query
  return acquisitionSpendFromMovements((data as { direction: PoolDirection; amount: number }[]) ?? [])
}
