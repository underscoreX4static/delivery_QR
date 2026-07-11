import { describe, expect, it } from 'vitest'
import { calculateOrderPricing, suggestSellPrice, type PricingSettings } from './calculations'

// Realistic pricing config (matches the app defaults).
const S: PricingSettings = {
  deliveryFee: 10,
  freeDeliveryThreshold: 100,
  discountThreshold: 175,
  discountRate: 0.1,
  discountThreshold2: 250,
  discountRate2: 0.15,
}

describe('calculateOrderPricing — the customer price (delivery, discount tiers, credit)', () => {
  it('below free-delivery threshold: delivery fee applies, no discount', () => {
    const p = calculateOrderPricing(40, S)
    expect(p.deliveryFee).toBe(10)
    expect(p.discount).toBe(0)
    expect(p.total).toBe(50)
  })

  it('at/above the free-delivery threshold: delivery is free', () => {
    const p = calculateOrderPricing(120, S)
    expect(p.deliveryFee).toBe(0)
    expect(p.discount).toBe(0)
    expect(p.total).toBe(120)
  })

  it('tier 1 discount (>= 175, < 250)', () => {
    const p = calculateOrderPricing(200, S)
    expect(p.discountRate).toBe(0.1)
    expect(p.discount).toBe(20)
    expect(p.total).toBe(180)
  })

  it('tier 2 discount (>= 250) stacks upward', () => {
    const p = calculateOrderPricing(300, S)
    expect(p.discountRate).toBe(0.15)
    expect(p.discount).toBe(45)
    expect(p.total).toBe(255)
  })

  it('just under a threshold gets the lower tier (boundary)', () => {
    expect(calculateOrderPricing(174.99, S).discountRate).toBe(0)
    expect(calculateOrderPricing(175, S).discountRate).toBe(0.1)
    expect(calculateOrderPricing(250, S).discountRate).toBe(0.15)
  })

  it('referral credit is applied last and capped so total never goes below 0', () => {
    // subtotal 40 + delivery 10 = 50 to pay; 100 credit available → only 50 used.
    const p = calculateOrderPricing(40, S, 100)
    expect(p.creditApplied).toBe(50)
    expect(p.total).toBe(0)
  })

  it('partial credit reduces the total by exactly the credit', () => {
    const p = calculateOrderPricing(120, S, 30)
    expect(p.creditApplied).toBe(30)
    expect(p.total).toBe(90)
  })

  it('negative available credit is ignored (never adds to the bill)', () => {
    const p = calculateOrderPricing(120, S, -50)
    expect(p.creditApplied).toBe(0)
    expect(p.total).toBe(120)
  })

  it('credit applies after delivery + discount, on the discounted total', () => {
    // subtotal 200 → discount 20, delivery 0 → 180 to pay; 30 credit → 150.
    const p = calculateOrderPricing(200, S, 30)
    expect(p.discount).toBe(20)
    expect(p.creditApplied).toBe(30)
    expect(p.total).toBe(150)
  })
})

describe('suggestSellPrice — cost / (1 − target margin)', () => {
  it('55% margin on a $70 cost', () => {
    expect(suggestSellPrice(70, 0.55)).toBe(155.56)
  })

  it('50% margin doubles the cost', () => {
    expect(suggestSellPrice(20, 0.5)).toBe(40)
  })
})
