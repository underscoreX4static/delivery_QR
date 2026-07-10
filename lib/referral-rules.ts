/**
 * Pure referral rules — no DB/I/O, so it's unit-testable in isolation (the rest
 * of lib/referrals.ts pulls in the Supabase client, which can't load without env).
 *
 * Asymmetric credit (Phase 3):
 *   - The referred customer is credited at approval (usable on their first order).
 *   - The referrer is credited once the referred customer's first order is delivered.
 */

/**
 * Whether the REFERRER can be credited now: the referral is approved, the
 * referrer hasn't already been credited, and the referred customer has been
 * delivered at least once.
 */
export function isReferrerCreditable(input: {
  status: string
  referrerCreditedAt: string | null | undefined
  referredDeliveredCount: number
}): boolean {
  return input.status === 'approved' && !input.referrerCreditedAt && input.referredDeliveredCount >= 1
}
