import type { PayoutBreakdown } from '@/types/index'

// ⚠️ CRITICAL: This is the ONLY file in the codebase allowed to contain
// payout, profit, pricing, or discount calculations. Every other file must
// call into these functions rather than re-deriving the math.

// Default split of the product MARGIN (not revenue). Configurable via settings
// (settings.driver_share); owner share is always derived as 1 − driver share
// (decision D3), so the two can never fail to sum to 1.
export const DRIVER_SHARE = 0.38
export const OWNER_SHARE = 0.62 // = 1 − DRIVER_SHARE; kept for callers/readers that display the headline rate

// Back-compat aliases (some read-model displays still import these names).
export const DRIVER_PAYOUT_SHARE = DRIVER_SHARE
export const OWNER_PROFIT_SHARE = OWNER_SHARE

// The owner keeps AT LEAST this fraction of their gross share — acquisition
// commissions can never clamp the owner below it. Configurable via settings
// (settings.owner_floor) but never below this hard floor (decision: 11%).
export const OWNER_FLOOR = 0.11
export const OWNER_FLOOR_HARD_MIN = 0.11

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
  /** Sum of line sell prices before the tier discount, EXCLUDING delivery. */
  subtotal: number
  /** Tier discount applied to the order (an owner-borne acquisition cost — decision D2). */
  discount: number
  /** Delivery fee charged to the customer (0 above the free-delivery threshold). Pass-through to the driver, outside the margin. */
  deliveryFee: number
  /** Referral credit actually applied on this order — also owner-borne (D2). Defaults to 0. */
  creditApplied?: number
  /** Sum of unit_cost_price × quantity across all order_items. */
  costOfGoods: number
  driverIsOwner: boolean
  /** partner.commission_rate; 0 if the order has no attributed partner. Commission is now charged on MARGIN, not revenue. */
  partnerCommissionRate: number
  /**
   * Use this exact commission figure instead of margin × partnerCommissionRate.
   * For a delivered order the real commission owed is whatever was frozen into
   * affiliate_commissions at delivery time — a rate can change afterward, and
   * recomputing would make historical figures drift. Pass the snapshot whenever
   * one exists (everywhere except the moment of first delivery).
   */
  affiliateCommissionOverride?: number
  /** Driver's share of margin. Defaults to DRIVER_SHARE; owner share is 1 − this. */
  driverShare?: number
  /** Owner floor fraction. Defaults to OWNER_FLOOR; always clamped to at least OWNER_FLOOR_HARD_MIN. */
  ownerFloor?: number
}

/**
 * Computes the full financial breakdown for a single delivered order.
 *
 * Cascade (see REFACTOR_PLAN / DECISIONS):
 *   margin          = subtotal − COGS                 (delivery excluded; promo NOT in margin — D2 owner-borne)
 *   driverPayout    = isOwner ? 0 : margin×driverShare + deliveryFee
 *   ownerShareGross = margin×ownerShare (+ the driver share + delivery if the owner delivered it himself)
 *   commission      = margin × rate,  capped so the owner keeps ≥ ownerFloor of ownerShareGross
 *   ownerNet        = ownerShareGross − commission − discount − credit   (owner bears promo + referral credit)
 *
 * This makes total cash reconcile exactly:
 *   driverPayout + ownerNet + commission + COGS + discount + credit = order.total
 */
export function calculatePayout(input: PayoutInput): PayoutBreakdown {
  const driverShare = input.driverShare ?? DRIVER_SHARE
  const ownerShare = 1 - driverShare
  const ownerFloor = Math.max(input.ownerFloor ?? OWNER_FLOOR, OWNER_FLOOR_HARD_MIN)
  const discount = input.discount
  const credit = input.creditApplied ?? 0

  const margin = round2(input.subtotal - input.costOfGoods)

  const driverPayout = input.driverIsOwner ? 0 : round2(margin * driverShare + input.deliveryFee)

  // When the owner delivers, they also keep the driver's slice + the delivery fee.
  const ownerShareGross = round2(
    margin * ownerShare + (input.driverIsOwner ? margin * driverShare + input.deliveryFee : 0)
  )

  const uncappedCommission =
    input.affiliateCommissionOverride !== undefined
      ? round2(input.affiliateCommissionOverride)
      : round2(margin * input.partnerCommissionRate)

  const maxCommission = round2(ownerShareGross * (1 - ownerFloor))
  const affiliateCommission = round2(Math.min(uncappedCommission, maxCommission))

  const ownerNet = round2(ownerShareGross - affiliateCommission - discount - credit)

  return {
    margin,
    driverPayout,
    ownerShareGross,
    affiliateCommission,
    affiliateCommissionUncapped: uncappedCommission,
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
