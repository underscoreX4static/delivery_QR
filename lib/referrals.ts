import { nanoid } from 'nanoid'
import { supabaseAdmin } from '@/lib/supabase'
import { sendMessage } from '@/lib/telegram'
import { getSettings } from '@/lib/settings'
import { isReferrerCreditable } from '@/lib/referral-rules'
import type { Referral } from '@/types/index'

const BALANCE_UPDATE_RETRY_ATTEMPTS = 5

/** Returns the user's existing referral code, generating and persisting one if they don't have it yet. */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const { data: user } = await supabaseAdmin.from('users').select('referral_code').eq('id', userId).single()
  if (user?.referral_code) return user.referral_code

  const code = nanoid(8)
  await supabaseAdmin.from('users').update({ referral_code: code }).eq('id', userId)
  return code
}

/**
 * Called from the /start handler when a new user's payload is `ref_<code>`.
 * Only ever fires for a genuinely new user (checked by the caller before
 * insert), so there's no risk of an existing customer retroactively
 * attaching a referrer. Self-referral (a code somehow matching yourself) is
 * guarded here too, defensively.
 */
export async function createPendingReferral(referrerUserId: string, referredUserId: string): Promise<void> {
  if (referrerUserId === referredUserId) return

  const settings = await getSettings()

  await supabaseAdmin.from('users').update({ referred_by: referrerUserId }).eq('id', referredUserId)

  const { data: referral, error } = await supabaseAdmin
    .from('referrals')
    .insert({
      referrer_id: referrerUserId,
      referred_id: referredUserId,
      status: 'pending',
      reward_amount: settings.referralRewardAmount,
    })
    .select('*')
    .single()

  if (error || !referral) {
    console.error('Failed to create pending referral:', error?.message)
    return
  }

  const [{ data: referrer }, { data: referred }] = await Promise.all([
    supabaseAdmin.from('users').select('first_name, telegram_id').eq('id', referrerUserId).single(),
    supabaseAdmin.from('users').select('first_name, telegram_id').eq('id', referredUserId).single(),
  ])

  await sendMessage(
    '8376671012',
    `👥 New referral pending review\n\n${referrer?.first_name ?? 'Someone'} referred ${referred?.first_name ?? 'a new customer'}.\nCheck /admin/referrals to approve — $${settings.referralRewardAmount.toFixed(2)} each if approved.`
  ).catch(() => {})
}

/** Deducts credit actually applied to an order at checkout — the exported half of adjustCreditBalance for that use. */
export async function deductCredit(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return
  await adjustCreditBalance(userId, -amount)
}

async function adjustCreditBalance(userId: string, delta: number): Promise<void> {
  for (let attempt = 0; attempt < BALANCE_UPDATE_RETRY_ATTEMPTS; attempt++) {
    const { data: user, error: readError } = await supabaseAdmin
      .from('users')
      .select('credit_balance')
      .eq('id', userId)
      .single()

    if (readError || !user) throw new Error(`User ${userId} not found`)

    const currentBalance = user.credit_balance ?? 0
    const { error: writeError, count } = await supabaseAdmin
      .from('users')
      .update({ credit_balance: round2(currentBalance + delta) }, { count: 'exact' })
      .eq('id', userId)
      .eq('credit_balance', currentBalance)

    if (!writeError && count) return
  }

  throw new Error(`Failed to adjust credit balance for user ${userId}: too much concurrent contention`)
}

export interface ReferralWithContext extends Referral {
  referrer: { id: string; first_name: string | null; last_name: string | null; phone: string | null; notes: string | null }
  referred: { id: string; first_name: string | null; last_name: string | null; phone: string | null }
  referrer_stats: { total_orders: number; total_spent: number; prior_approved_referrals: number }
}

/** Pending referrals with enough referrer context (notes, stats) to actually review them. */
export async function getPendingReferrals(): Promise<ReferralWithContext[]> {
  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('*, referrer:referrer_id(id, first_name, last_name, phone, notes), referred:referred_id(id, first_name, last_name, phone)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (!referrals || referrals.length === 0) return []

  const referrerIds = [...new Set(referrals.map((r) => r.referrer_id))]

  const [{ data: referrerOrders }, { data: priorApproved }] = await Promise.all([
    supabaseAdmin.from('orders').select('user_id, total, status').in('user_id', referrerIds),
    supabaseAdmin.from('referrals').select('referrer_id').in('referrer_id', referrerIds).eq('status', 'approved'),
  ])

  const statsByReferrer = new Map<string, { total_orders: number; total_spent: number }>()
  for (const order of referrerOrders ?? []) {
    const existing = statsByReferrer.get(order.user_id) ?? { total_orders: 0, total_spent: 0 }
    existing.total_orders += 1
    if (order.status === 'delivered') existing.total_spent += order.total
    statsByReferrer.set(order.user_id, existing)
  }

  const priorApprovedByReferrer = new Map<string, number>()
  for (const r of priorApproved ?? []) {
    priorApprovedByReferrer.set(r.referrer_id, (priorApprovedByReferrer.get(r.referrer_id) ?? 0) + 1)
  }

  return referrals.map((r) => ({
    ...r,
    referrer_stats: {
      total_orders: statsByReferrer.get(r.referrer_id)?.total_orders ?? 0,
      total_spent: Math.round((statsByReferrer.get(r.referrer_id)?.total_spent ?? 0) * 100) / 100,
      prior_approved_referrals: priorApprovedByReferrer.get(r.referrer_id) ?? 0,
    },
  })) as unknown as ReferralWithContext[]
}

/**
 * Admin approves a pending referral. This credits the REFERRED customer right
 * away (so the reward is usable on their first order — the acquisition hook)
 * but NOT the referrer, who is only credited once that customer's first order
 * is actually delivered (see creditReferrerIfDelivered, called from
 * markDelivered). If the referred customer was already delivered before the
 * admin got to the review, the referrer is credited immediately too.
 * Idempotent via the status guard + the per-side credited_at guards.
 */
export async function approveReferral(
  referralId: string,
  approvedBy: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: referral, error } = await supabaseAdmin
    .from('referrals')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: approvedBy })
    .eq('id', referralId)
    .eq('status', 'pending')
    .select('*')
    .single()

  if (error || !referral) return { ok: false, error: 'Referral not found, or already reviewed' }

  await creditReferredNow(referral as Referral).catch((err) =>
    console.error(`Referred credit on approval failed for referral ${referralId}:`, err)
  )
  // In case the new customer was already delivered before approval.
  await creditReferrerIfDelivered(referral as Referral).catch((err) =>
    console.error(`Referrer credit attempt on approval failed for referral ${referralId}:`, err)
  )

  return { ok: true }
}

/** Credits the referred customer (usable on their first order). Idempotent via referred_credited_at. */
async function creditReferredNow(referral: Referral): Promise<void> {
  if (referral.status !== 'approved' || referral.referred_credited_at) return

  const { data: claimed } = await supabaseAdmin
    .from('referrals')
    .update({ referred_credited_at: new Date().toISOString() })
    .eq('id', referral.id)
    .is('referred_credited_at', null)
    .eq('status', 'approved')
    .select('id')
    .single()
  if (!claimed) return

  await adjustCreditBalance(referral.referred_id, referral.reward_amount)

  const { data: referred } = await supabaseAdmin.from('users').select('telegram_id').eq('id', referral.referred_id).single()
  if (referred?.telegram_id) {
    await sendMessage(
      referred.telegram_id,
      `🎉 Welcome! You've got *$${referral.reward_amount.toFixed(2)} credit* — it'll come off your first order.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {})
  }
}

/**
 * Credits the referrer once the referred customer's first order is delivered.
 * Claimed atomically (conditional update on referrer_credited_at) so concurrent
 * deliveries can never double-pay. Returns whether it credited.
 */
export async function creditReferrerIfDelivered(referral: Referral): Promise<boolean> {
  if (referral.status !== 'approved' || referral.referrer_credited_at) return false

  const { count: referredDelivered } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', referral.referred_id)
    .eq('status', 'delivered')

  if (!isReferrerCreditable({ status: referral.status, referrerCreditedAt: referral.referrer_credited_at, referredDeliveredCount: referredDelivered ?? 0 })) {
    return false
  }

  const { data: claimed } = await supabaseAdmin
    .from('referrals')
    .update({ referrer_credited_at: new Date().toISOString() })
    .eq('id', referral.id)
    .is('referrer_credited_at', null)
    .eq('status', 'approved')
    .select('id')
    .single()
  if (!claimed) return false

  await adjustCreditBalance(referral.referrer_id, referral.reward_amount)

  const { data: referrer } = await supabaseAdmin.from('users').select('telegram_id').eq('id', referral.referrer_id).single()
  if (referrer?.telegram_id) {
    await sendMessage(
      referrer.telegram_id,
      `🎉 Your referral paid off — you've got *$${referral.reward_amount.toFixed(2)} credit* toward your next order!`,
      { parse_mode: 'Markdown' }
    ).catch(() => {})
  }
  return true
}

/**
 * After a delivery, credit the referrer of any referral where THIS customer is
 * the referred and their order was just delivered. Called from markDelivered.
 */
export async function settleReferralsForUser(userId: string): Promise<void> {
  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('*')
    .eq('status', 'approved')
    .is('referrer_credited_at', null)
    .eq('referred_id', userId)

  for (const r of (referrals as Referral[]) ?? []) {
    await creditReferrerIfDelivered(r).catch((err) => console.error(`Referrer credit failed for referral ${r.id}:`, err))
  }
}

/** Rejects a pending referral — no credit, no customer-facing notification. Idempotent via the status guard. */
export async function rejectReferral(
  referralId: string,
  reviewedBy: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: referral, error } = await supabaseAdmin
    .from('referrals')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: reviewedBy })
    .eq('id', referralId)
    .eq('status', 'pending')
    .select('*')
    .single()

  if (error || !referral) return { ok: false, error: 'Referral not found, or already reviewed' }
  return { ok: true }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
