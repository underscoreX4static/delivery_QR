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
  /** Referral credit actually applied — never more than the customer's balance, never more than what's left to pay. */
  creditApplied: number
  total: number
}

/**
 * Computes delivery fee, discount, referral-credit, and total for a given
 * subtotal, driven entirely by the `settings` table values passed in — never
 * hardcoded. Two discount tiers stack upward: subtotal >= discountThreshold2
 * gets discountRate2, subtotal >= discountThreshold gets discountRate, else
 * none. Credit is applied last, after delivery fee and discount, and is
 * capped so it can never push the total below zero or exceed what the
 * customer actually has.
 */
export function calculateOrderPricing(subtotal: number, settings: PricingSettings, availableCredit = 0): OrderPricing {
  const deliveryFee = subtotal >= settings.freeDeliveryThreshold ? 0 : settings.deliveryFee

  const discountRate =
    subtotal >= settings.discountThreshold2
      ? settings.discountRate2
      : subtotal >= settings.discountThreshold
        ? settings.discountRate
        : 0

  const discount = round2(subtotal * discountRate)
  const preCreditTotal = round2(subtotal + deliveryFee - discount)
  const creditApplied = round2(Math.min(Math.max(availableCredit, 0), preCreditTotal))
  const total = round2(preCreditTotal - creditApplied)

  return { subtotal: round2(subtotal), deliveryFee, discount, discountRate, creditApplied, total }
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
  /**
   * Use this exact figure instead of total × partnerCommissionRate. For a
   * delivered order, the real commission owed is whatever was frozen into
   * affiliate_commissions at delivery time — a partner's rate can change
   * afterward, and recomputing from the current rate would make historical
   * earnings figures silently drift even though nothing was actually repaid
   * differently. Pass the snapshot amount here whenever one already exists
   * (i.e. everywhere except the moment the order is first delivered).
   */
  affiliateCommissionOverride?: number
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

  const affiliateCommission =
    input.affiliateCommissionOverride !== undefined
      ? round2(input.affiliateCommissionOverride)
      : round2(input.total * input.partnerCommissionRate)

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

/**
 * Uber-style loyalty milestones for drivers, keyed by lifetime delivered
 * order count. Each threshold is awarded at most once per driver. Fixed
 * reward amounts rather than a percentage of the pool balance — deliberately
 * a separate concern from calculateBonusPoolContribution below (the pool is
 * what the owner has set aside toward these obligations, not what determines
 * the reward itself). Placeholder amounts — tune once real figures are decided.
 */
export const DRIVER_BONUS_MILESTONES: { orders: number; bonus: number }[] = [
  { orders: 5, bonus: 20 },
  { orders: 25, bonus: 50 },
  { orders: 50, bonus: 100 },
  { orders: 100, bonus: 200 },
  { orders: 250, bonus: 500 },
]

/**
 * Portion of the owner's net (post-commission) profit on a single delivered
 * order that gets set aside into the assigned driver's bonus pool. The
 * driver's own delivery-fee-based payout and any partner commission are
 * untouched — this only reduces what the owner keeps, in exchange for
 * funding the milestone bonuses above.
 */
export function calculateBonusPoolContribution(ownerNet: number, bonusPoolRate: number): number {
  return round2(ownerNet * bonusPoolRate)
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
