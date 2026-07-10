import { describe, expect, it } from 'vitest'
import { isReferrerCreditable } from './referral-rules'

const base = {
  status: 'approved',
  referrerCreditedAt: null as string | null,
  referredDeliveredCount: 1,
}

describe('isReferrerCreditable — referrer paid once the referred customer is delivered', () => {
  it('credits the referrer once the referred customer has a first delivery', () => {
    expect(isReferrerCreditable(base)).toBe(true)
  })

  it('does NOT credit while the referral is still pending review', () => {
    expect(isReferrerCreditable({ ...base, status: 'pending' })).toBe(false)
  })

  it('does NOT credit the referrer twice (idempotent)', () => {
    expect(isReferrerCreditable({ ...base, referrerCreditedAt: '2026-07-10T00:00:00Z' })).toBe(false)
  })

  it('does NOT credit the referrer until the referred customer has been delivered', () => {
    expect(isReferrerCreditable({ ...base, referredDeliveredCount: 0 })).toBe(false)
  })
})
