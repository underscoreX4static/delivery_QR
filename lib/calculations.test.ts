import { describe, expect, it } from 'vitest'
import { calculatePayout, OWNER_FLOOR_HARD_MIN } from './calculations'

// Base inputs; each case overrides what it needs. rate = partnerCommissionRate.
const base = {
  subtotal: 0,
  discount: 0,
  deliveryFee: 0,
  creditApplied: 0,
  costOfGoods: 0,
  driverIsOwner: false,
  partnerCommissionRate: 0,
}

describe('calculatePayout — target cascade (margin base, delivery pass-through, owner floor)', () => {
  it('Cas A — above the free-delivery threshold, no delivery fee', () => {
    const p = calculatePayout({ ...base, subtotal: 130, costOfGoods: 70, partnerCommissionRate: 0.1 })
    expect(p.margin).toBe(60)
    expect(p.driverPayout).toBe(22.8)
    expect(p.ownerShareGross).toBe(37.2)
    expect(p.affiliateCommission).toBe(6) // maxCommission 33.11 not binding
    expect(p.ownerNet).toBe(31.2)
  })

  it('Cas B — below threshold, delivery fee is a pass-through to the driver', () => {
    const p = calculatePayout({ ...base, subtotal: 40, costOfGoods: 25, deliveryFee: 10, partnerCommissionRate: 0.1 })
    expect(p.margin).toBe(15)
    expect(p.driverPayout).toBe(15.7) // 15×0.38 + 10
    expect(p.ownerShareGross).toBe(9.3)
    expect(p.affiliateCommission).toBe(1.5)
    expect(p.ownerNet).toBe(7.8)
  })

  it('Cas C — owner delivers: keeps the driver slice + delivery, driver payout is 0', () => {
    const p = calculatePayout({ ...base, subtotal: 130, costOfGoods: 70, driverIsOwner: true, partnerCommissionRate: 0.1 })
    expect(p.driverPayout).toBe(0)
    expect(p.ownerShareGross).toBe(60) // 37.20 + 22.80
    expect(p.affiliateCommission).toBe(6)
    expect(p.ownerNet).toBe(54)
  })

  it('Cas D — owner floor bites at an absurd rate (D1: rounded to cents)', () => {
    const p = calculatePayout({ ...base, subtotal: 130, costOfGoods: 70, partnerCommissionRate: 0.95 })
    expect(p.affiliateCommissionUncapped).toBe(57)
    // maxCommission = round2(37.20 × 0.89) = 33.11 ; ownerNet = 37.20 − 33.11
    expect(p.affiliateCommission).toBe(33.11)
    expect(p.ownerNet).toBe(4.09)
  })
})

describe('calculatePayout — D2: promo & referral credit are owner-borne', () => {
  it('discount reduces the OWNER net, never the driver payout', () => {
    // subtotal 200, discount 20 (promo), COGS 110, rate 5%
    const p = calculatePayout({ ...base, subtotal: 200, discount: 20, costOfGoods: 110, partnerCommissionRate: 0.05 })
    expect(p.margin).toBe(90) // subtotal − COGS, promo NOT in margin
    expect(p.driverPayout).toBe(34.2) // 90×0.38 — unaffected by the promo
    expect(p.ownerShareGross).toBe(55.8)
    expect(p.affiliateCommission).toBe(4.5)
    expect(p.ownerNet).toBe(31.3) // 55.80 − 4.50 − 20
  })

  it('referral credit also comes out of the owner net', () => {
    const p = calculatePayout({ ...base, subtotal: 200, creditApplied: 20, costOfGoods: 110, partnerCommissionRate: 0.05 })
    expect(p.driverPayout).toBe(34.2)
    expect(p.ownerNet).toBe(31.3) // 55.80 − 4.50 − 0 − 20
  })

  it('cash reconciles: driverPayout + ownerNet + commission + COGS = total (discount/credit already netted into total and absorbed by owner)', () => {
    const subtotal = 200, discount = 20, credit = 5, deliveryFee = 10, costOfGoods = 110, rate = 0.05
    const total = subtotal + deliveryFee - discount - credit
    const p = calculatePayout({ subtotal, discount, deliveryFee, creditApplied: credit, costOfGoods, driverIsOwner: false, partnerCommissionRate: rate })
    const sum = p.driverPayout + p.ownerNet + p.affiliateCommission + costOfGoods
    expect(Math.round(sum * 100) / 100).toBe(total)
  })
})

describe('calculatePayout — configurable shares & hard floor', () => {
  it('driverShare is configurable; owner share is the complement', () => {
    const p = calculatePayout({ ...base, subtotal: 100, costOfGoods: 40, driverShare: 0.5 })
    expect(p.driverPayout).toBe(30) // 60×0.5
    expect(p.ownerShareGross).toBe(30) // 60×0.5
  })

  it('ownerFloor can never be set below the hard minimum', () => {
    // Ask for a 0% floor; it must clamp to OWNER_FLOOR_HARD_MIN (0.11).
    const p = calculatePayout({ ...base, subtotal: 130, costOfGoods: 70, partnerCommissionRate: 0.95, ownerFloor: 0 })
    expect(OWNER_FLOOR_HARD_MIN).toBe(0.11)
    expect(p.affiliateCommission).toBe(33.11) // same cap as Cas D, not the full 57
    expect(p.ownerNet).toBe(4.09)
  })
})
