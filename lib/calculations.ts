import type { PayoutBreakdown } from '@/types/index'

// ⚠️ CRITICAL: This is the ONLY file in the codebase allowed to contain
// payout, profit, pricing, or discount calculations. Every other file must
// call into these functions rather than re-deriving the math.

const DRIVER_PAYOUT_SHARE = 0.38
const OWNER_PROFIT_SHARE = 0.62

export interface PricingSettings {
  deliveryFee: number
  freeDeliveryThreshold: number
  /** Lower discount tier — e.g. 10% off at $175 */
  discountThreshold: number
  discountRate: number
  /** Upper discount tier — e.g. 15% off at $250. Falls back to tier 1 if unset. */
  discountThreshold2: number
  discountRate2: number
}

export interface OrderPricing {
  subtotal: number
  deliveryFee: number
  discount: number
  /** The discount rate actually applied (0 if under the first threshold) — lets callers show which tier is active. */
  discountRate: number
  total: number
}

/**
 * Computes delivery fee, discount and total for a given subtotal, driven
 * entirely by the `settings` table values passed in — never hardcoded.
 * Two discount tiers stack upward: subtotal >= discountThreshold2 gets
 * discountRate2, subtotal >= discountThreshold gets discountRate, else none.
 */
export function calculateOrderPricing(subtotal: number, settings: PricingSettings): OrderPricing {
  const deliveryFee = subtotal >= settings.freeDeliveryThreshold ? 0 : settings.deliveryFee

  const discountRate =
    subtotal >= settings.discountThreshold2
      ? settings.discountRate2
      : subtotal >= settings.discountThreshold
        ? settings.discountRate
        : 0

  const discount = round2(subtotal * discountRate)
  const total = round2(subtotal + deliveryFee - discount)
  return { subtotal: round2(subtotal), deliveryFee, discount, discountRate, total }
}

export interface PayoutInput {
  subtotal: number
  deliveryFee: number
  discount: number
  total: number
  /** sum of unit_cost_price × quantity across all order_items */
  costOfGoods: number
  driverIsOwner: boolean
  /** partner.commission_rate snapshot; 0 if the order has no attributed partner */
  partnerCommissionRate: number
}

/**
 * Computes the full financial breakdown for a single delivered order.
 */
export function calculatePayout(input: PayoutInput): PayoutBreakdown {
  const revenue = input.total
  const cost = input.costOfGoods
  const grossProfit = round2(revenue - cost)

  const driverPayout = input.driverIsOwner
    ? 0
    : round2(input.deliveryFee + grossProfit * DRIVER_PAYOUT_SHARE)

  const affiliateCommission = round2(input.total * input.partnerCommissionRate)

  const ownerNet = round2(grossProfit * OWNER_PROFIT_SHARE - affiliateCommission)

  return {
    revenue,
    cost: round2(cost),
    grossProfit,
    driverPayout,
    affiliateCommission,
    ownerNet,
  }
}

/**
 * Suggested sell price for a new batch given cost price and target margin.
 * Admin may override the result before saving.
 */
export function suggestSellPrice(costPrice: number, targetMargin: number): number {
  return round2(costPrice / (1 - targetMargin))
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
