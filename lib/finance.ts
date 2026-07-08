import { supabaseAdmin } from '@/lib/supabase'
import {
  calculatePayout,
  DRIVER_PAYOUT_SHARE,
  OWNER_PROFIT_SHARE,
} from '@/lib/calculations'
import { computeEarnings, type EarningsSummary } from '@/lib/earnings'
import { getSettings } from '@/lib/settings'
import { getBrisbanePeriodStart, type EarningsPeriod } from '@/lib/store-hours'
import type { Order, OrderItem } from '@/types/index'

// ⚠️ This file is the finance dashboard's read-model. It never writes, and it
// never invents new payout/profit math — every per-order figure goes through
// calculatePayout (the single source of truth in lib/calculations.ts). Its job
// is to answer one strategic question, not to be an accounting ledger:
//
//   "How much margin can I afford to burn on growth right now, and at my
//    current acquisition rate, how many weeks of runway does that leave me?"
//
// So the numbers here are decision-grade, not audit-grade: a founder deciding
// how hard to push promos/bonuses, not a bookkeeper reconciling to the cent.

/** Trailing window (days) used for burn-rate and acquisition figures. Fixed, independent of the earnings period tab. */
const BURN_WINDOW_DAYS = 30
const WEEKS_IN_WINDOW = BURN_WINDOW_DAYS / 7

export interface FinanceRates {
  driverPayoutShare: number
  ownerProfitShare: number
  bonusPoolRate: number
  referralRewardAmount: number
  deliveryFee: number
  freeDeliveryThreshold: number
  discountThreshold: number
  discountRate: number
  discountThreshold2: number
  discountRate2: number
  /** Average commission_rate across active partners — a headline view of what commercials cost. */
  avgPartnerCommissionRate: number
}

export interface FinancePools {
  /** Σ drivers.bonus_pool_balance — owner net already provisioned toward driver milestone bonuses. */
  driverPoolSetAside: number
  /** Unpaid driver milestone bonuses — the hard, already-awarded obligation the pool above is meant to cover. */
  driverBonusesOwed: number
  /** Unpaid affiliate commissions across all commercials. */
  commissionsOwed: number
  /** Earned-but-unpaid commercial welcome bonuses. */
  welcomeBonusesOwed: number
  /** Σ users.credit_balance — referral credit sitting in customer accounts, a future discount on revenue. */
  referralCreditFloat: number
  /** Owner's share of COD physically held by drivers on delivered orders not yet settled to payment_received. */
  codInTransit: number
  /** Hard cash obligations already committed: driver bonuses + commissions + welcome bonuses owed. */
  totalCommitted: number
}

export interface FinanceTreasury {
  /** Owner-declared liquid cash (settings.starting_cash). */
  startingCash: number
  /** Owner's share of unremitted COD — cash on its way in. */
  codInTransit: number
  /** startingCash + codInTransit — cash you have or are about to collect. */
  grossCash: number
  /** Hard committed outflows (pools.totalCommitted). */
  committedOutflows: number
  /** grossCash − committedOutflows — free cash ignoring inventory. The optimistic "sans BFR" figure. */
  availableCashNoBFR: number
  /** Purchase-cost value of all remaining active stock — cash locked in inventory (the BFR). */
  stockValue: number
  /** availableCashNoBFR − stockValue — free cash once inventory is treated as unavailable. The realistic "avec BFR" figure. */
  availableCashWithBFR: number
  /** Referral credit float — a soft future liability shown for context, not subtracted from cash. */
  referralCreditFloat: number
}

export interface FinanceGrowth {
  windowDays: number
  /** New customer signups in the window. */
  newCustomers: number
  /** Distinct customers with at least one delivered order in the window. */
  activeBuyers: number
  /** Total growth spend in the window, per week (see burnBreakdown for the parts). */
  weeklyBurn: number
  burnBreakdown: {
    referralCredits: number
    driverBonuses: number
    bonusPoolContributions: number
    discountsGranted: number
  }
  /** availableCashNoBFR / weeklyBurn — optimistic runway. Infinity-safe: null when burn is ~0. */
  runwayWeeksNoBFR: number | null
  /** availableCashWithBFR / weeklyBurn — realistic runway. */
  runwayWeeksWithBFR: number | null
  /** Window growth spend / new customers — a rough blended acquisition cost. */
  costPerNewCustomer: number | null
}

/**
 * Per-week baselines the client simulator rescales when the owner drags a
 * slider. Everything is already normalised to a weekly rate so the front-end
 * only multiplies by the new rate — no re-querying.
 */
export interface FinanceSimBasis {
  weeklyRevenue: number
  /** Owner net per week on non-owner-driver deliveries — the base the bonus-pool rate scales. */
  weeklyPoolableOwnerNet: number
  /** Approved referral pairs per week — each pair costs 2 × referralRewardAmount when the reward changes. */
  weeklyReferralPairs: number
  /** Driver milestone bonuses per week — lumpy and rate-less, held fixed in the sim. */
  weeklyDriverBonuses: number
  /** Discounts granted per week under the current tiers — held fixed unless a promo slider adds to it. */
  weeklyDiscounts: number
  availableCashNoBFR: number
  availableCashWithBFR: number
}

export interface FinanceSnapshot {
  period: EarningsPeriod
  earnings: EarningsSummary
  rates: FinanceRates
  pools: FinancePools
  treasury: FinanceTreasury
  growth: FinanceGrowth
  simBasis: FinanceSimBasis
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Sums unit_cost_price × quantity per order id in one grouped query. */
async function costOfGoodsByOrder(orderIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (orderIds.length === 0) return result
  const { data } = await supabaseAdmin.from('order_items').select('*').in('order_id', orderIds)
  for (const item of (data as OrderItem[]) ?? []) {
    result.set(item.order_id, (result.get(item.order_id) ?? 0) + item.unit_cost_price * item.quantity)
  }
  return result
}

export async function computeFinanceSnapshot(period: EarningsPeriod): Promise<FinanceSnapshot> {
  const start = getBrisbanePeriodStart(period)
  const windowStart = new Date(Date.now() - BURN_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const settings = await getSettings()

  // Right column: net-profit summary for the selected period, straight from the
  // existing single-source earnings computation.
  const earnings = await computeEarnings(start)

  const [
    driverPoolAgg,
    unpaidBonuses,
    unpaidCommissions,
    creditFloatRows,
    activeBatches,
    activePartners,
    allCommissions,
  ] = await Promise.all([
    supabaseAdmin.from('drivers').select('bonus_pool_balance'),
    supabaseAdmin.from('driver_bonuses').select('bonus_amount').eq('paid_out', false),
    supabaseAdmin.from('affiliate_commissions').select('commission_amount').eq('paid_out', false),
    supabaseAdmin.from('users').select('credit_balance'),
    supabaseAdmin.from('product_batches').select('quantity_remaining, cost_price').eq('is_active', true),
    supabaseAdmin
      .from('partners')
      .select('id, commission_rate, first_sale_bonus_amount, welcome_bonus_trigger_orders, first_sale_bonus_paid')
      .eq('is_active', true),
    supabaseAdmin.from('affiliate_commissions').select('partner_id'),
  ])

  const driverPoolSetAside = round2(
    (driverPoolAgg.data ?? []).reduce((s, d) => s + (d.bonus_pool_balance ?? 0), 0)
  )
  const driverBonusesOwed = round2((unpaidBonuses.data ?? []).reduce((s, b) => s + b.bonus_amount, 0))
  const commissionsOwed = round2((unpaidCommissions.data ?? []).reduce((s, c) => s + c.commission_amount, 0))
  const referralCreditFloat = round2((creditFloatRows.data ?? []).reduce((s, u) => s + (u.credit_balance ?? 0), 0))
  const stockValue = round2(
    (activeBatches.data ?? []).reduce((s, b) => s + b.quantity_remaining * b.cost_price, 0)
  )

  // Welcome bonuses: earned (commission count ≥ trigger) but not yet paid.
  const commissionCountByPartner = new Map<string, number>()
  for (const c of allCommissions.data ?? []) {
    commissionCountByPartner.set(c.partner_id, (commissionCountByPartner.get(c.partner_id) ?? 0) + 1)
  }
  let welcomeBonusesOwed = 0
  for (const p of activePartners.data ?? []) {
    const trigger = p.welcome_bonus_trigger_orders ?? 1
    const earned = (commissionCountByPartner.get(p.id) ?? 0) >= trigger
    if (earned && !(p.first_sale_bonus_paid ?? false)) welcomeBonusesOwed += p.first_sale_bonus_amount ?? 10
  }
  welcomeBonusesOwed = round2(welcomeBonusesOwed)

  const avgPartnerCommissionRate =
    (activePartners.data ?? []).length > 0
      ? (activePartners.data ?? []).reduce((s, p) => s + (p.commission_rate ?? 0), 0) / (activePartners.data ?? []).length
      : 0

  // COD in transit: delivered orders not covered by a driver settlement that
  // reached payment_received. Owner's share = total − driver payout.
  const codInTransit = await computeCodInTransit()

  const totalCommitted = round2(driverBonusesOwed + commissionsOwed + welcomeBonusesOwed)

  const startingCash = settings.startingCash
  const grossCash = round2(startingCash + codInTransit)
  const availableCashNoBFR = round2(grossCash - totalCommitted)
  const availableCashWithBFR = round2(availableCashNoBFR - stockValue)

  const pools: FinancePools = {
    driverPoolSetAside,
    driverBonusesOwed,
    commissionsOwed,
    welcomeBonusesOwed,
    referralCreditFloat,
    codInTransit,
    totalCommitted,
  }

  const treasury: FinanceTreasury = {
    startingCash,
    codInTransit,
    grossCash,
    committedOutflows: totalCommitted,
    availableCashNoBFR,
    stockValue,
    availableCashWithBFR,
    referralCreditFloat,
  }

  // Trailing-window burn + acquisition.
  const window = await computeWindow(windowStart, settings.bonusPoolRate)

  const weeklyBurn = round2(
    (window.referralCredits + window.driverBonuses + window.bonusPoolContributions + window.discountsGranted) /
      WEEKS_IN_WINDOW
  )

  const growth: FinanceGrowth = {
    windowDays: BURN_WINDOW_DAYS,
    newCustomers: window.newCustomers,
    activeBuyers: window.activeBuyers,
    weeklyBurn,
    burnBreakdown: {
      referralCredits: round2(window.referralCredits / WEEKS_IN_WINDOW),
      driverBonuses: round2(window.driverBonuses / WEEKS_IN_WINDOW),
      bonusPoolContributions: round2(window.bonusPoolContributions / WEEKS_IN_WINDOW),
      discountsGranted: round2(window.discountsGranted / WEEKS_IN_WINDOW),
    },
    runwayWeeksNoBFR: weeklyBurn > 0.01 ? round2(availableCashNoBFR / weeklyBurn) : null,
    runwayWeeksWithBFR: weeklyBurn > 0.01 ? round2(availableCashWithBFR / weeklyBurn) : null,
    costPerNewCustomer:
      window.newCustomers > 0
        ? round2(
            (window.referralCredits + window.driverBonuses + window.bonusPoolContributions + window.discountsGranted) /
              window.newCustomers
          )
        : null,
  }

  const simBasis: FinanceSimBasis = {
    weeklyRevenue: round2(window.grossRevenue / WEEKS_IN_WINDOW),
    weeklyPoolableOwnerNet: round2(window.poolableOwnerNet / WEEKS_IN_WINDOW),
    weeklyReferralPairs: round2(window.referralPairs / WEEKS_IN_WINDOW),
    weeklyDriverBonuses: round2(window.driverBonuses / WEEKS_IN_WINDOW),
    weeklyDiscounts: round2(window.discountsGranted / WEEKS_IN_WINDOW),
    availableCashNoBFR,
    availableCashWithBFR,
  }

  const rates: FinanceRates = {
    driverPayoutShare: DRIVER_PAYOUT_SHARE,
    ownerProfitShare: OWNER_PROFIT_SHARE,
    bonusPoolRate: settings.bonusPoolRate,
    referralRewardAmount: settings.referralRewardAmount,
    deliveryFee: settings.deliveryFee,
    freeDeliveryThreshold: settings.freeDeliveryThreshold,
    discountThreshold: settings.discountThreshold,
    discountRate: settings.discountRate,
    discountThreshold2: settings.discountThreshold2,
    discountRate2: settings.discountRate2,
    avgPartnerCommissionRate: round2(avgPartnerCommissionRate * 10000) / 10000,
  }

  return { period, earnings, rates, pools, treasury, growth, simBasis }
}

/** Owner's share (total − driver payout) of COD on delivered orders not yet settled to payment_received. */
async function computeCodInTransit(): Promise<number> {
  const { data: deliveredOrders } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('status', 'delivered')

  if (!deliveredOrders || deliveredOrders.length === 0) return 0

  // Orders already fully reconciled: covered by a driver settlement that
  // reached payment_received. Those are no longer "in transit".
  const { data: settledLinks } = await supabaseAdmin
    .from('settlement_orders')
    .select('order_id, settlements!inner(status, type)')
    .eq('settlements.type', 'driver')
    .eq('settlements.status', 'payment_received')

  const reconciled = new Set((settledLinks ?? []).map((l) => l.order_id))
  const outstanding = deliveredOrders.filter((o) => !reconciled.has(o.id))
  if (outstanding.length === 0) return 0

  const orderIds = outstanding.map((o) => o.id)
  const driverIds = [...new Set(outstanding.map((o) => o.driver_id).filter((id): id is string => Boolean(id)))]

  const [costMap, { data: drivers }, { data: commissions }] = await Promise.all([
    costOfGoodsByOrder(orderIds),
    driverIds.length
      ? supabaseAdmin.from('drivers').select('id, is_owner').in('id', driverIds)
      : Promise.resolve({ data: [] as { id: string; is_owner: boolean }[] }),
    supabaseAdmin.from('affiliate_commissions').select('order_id, commission_amount').in('order_id', orderIds),
  ])

  const ownerDriverIds = new Set((drivers ?? []).filter((d) => d.is_owner).map((d) => d.id))
  const commissionByOrder = new Map((commissions ?? []).map((c) => [c.order_id, c.commission_amount]))

  let ownerShare = 0
  for (const order of outstanding as Order[]) {
    const payout = calculatePayout({
      subtotal: order.subtotal,
      deliveryFee: order.delivery_fee,
      discount: order.discount,
      total: order.total,
      costOfGoods: costMap.get(order.id) ?? 0,
      driverIsOwner: order.driver_id ? ownerDriverIds.has(order.driver_id) : false,
      partnerCommissionRate: 0,
      affiliateCommissionOverride: commissionByOrder.get(order.id) ?? 0,
    })
    // If the owner delivered it themselves, driverPayout is 0 and the whole
    // total is already in the owner's hands.
    ownerShare += order.total - payout.driverPayout
  }

  return round2(ownerShare)
}

interface WindowFigures {
  grossRevenue: number
  /** Owner net on non-owner-driver deliveries — the exact base the pool rate is applied to (mirrors markDelivered). */
  poolableOwnerNet: number
  discountsGranted: number
  referralCredits: number
  referralPairs: number
  driverBonuses: number
  bonusPoolContributions: number
  newCustomers: number
  activeBuyers: number
}

/** All trailing-window aggregates used for burn, acquisition and simulator baselines. */
async function computeWindow(windowStart: Date, bonusPoolRate: number): Promise<WindowFigures> {
  const iso = windowStart.toISOString()

  const [{ data: orders }, { data: approvedReferrals }, { data: windowBonuses }, { count: newCustomers }] =
    await Promise.all([
      supabaseAdmin.from('orders').select('*').eq('status', 'delivered').gte('created_at', iso),
      supabaseAdmin.from('referrals').select('reward_amount').eq('status', 'approved').gte('reviewed_at', iso),
      supabaseAdmin.from('driver_bonuses').select('bonus_amount').gte('created_at', iso),
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).gte('created_at', iso),
    ])

  const deliveredOrders = (orders as Order[]) ?? []
  const orderIds = deliveredOrders.map((o) => o.id)
  const driverIds = [...new Set(deliveredOrders.map((o) => o.driver_id).filter((id): id is string => Boolean(id)))]

  const [costMap, { data: drivers }, { data: commissions }] = await Promise.all([
    costOfGoodsByOrder(orderIds),
    driverIds.length
      ? supabaseAdmin.from('drivers').select('id, is_owner').in('id', driverIds)
      : Promise.resolve({ data: [] as { id: string; is_owner: boolean }[] }),
    orderIds.length
      ? supabaseAdmin.from('affiliate_commissions').select('order_id, commission_amount').in('order_id', orderIds)
      : Promise.resolve({ data: [] as { order_id: string; commission_amount: number }[] }),
  ])

  const ownerDriverIds = new Set((drivers ?? []).filter((d) => d.is_owner).map((d) => d.id))
  const commissionByOrder = new Map((commissions ?? []).map((c) => [c.order_id, c.commission_amount]))

  let grossRevenue = 0
  let discountsGranted = 0
  let poolableOwnerNet = 0
  const buyerIds = new Set<string>()

  for (const order of deliveredOrders) {
    grossRevenue += order.total
    discountsGranted += order.discount
    buyerIds.add(order.user_id)

    // The pool is funded on every non-owner-driver delivery — same rule as
    // markDelivered — so accumulate owner net on exactly those orders.
    if (order.driver_id && !ownerDriverIds.has(order.driver_id)) {
      const payout = calculatePayout({
        subtotal: order.subtotal,
        deliveryFee: order.delivery_fee,
        discount: order.discount,
        total: order.total,
        costOfGoods: costMap.get(order.id) ?? 0,
        driverIsOwner: false,
        partnerCommissionRate: 0,
        affiliateCommissionOverride: commissionByOrder.get(order.id) ?? 0,
      })
      poolableOwnerNet += payout.ownerNet
    }
  }

  const referralPairs = (approvedReferrals ?? []).length
  // Both sides are credited, so cash committed = reward × 2 per approved pair.
  const referralCredits = (approvedReferrals ?? []).reduce((s, r) => s + r.reward_amount * 2, 0)
  const driverBonuses = (windowBonuses ?? []).reduce((s, b) => s + b.bonus_amount, 0)
  const bonusPoolContributions = Math.max(0, poolableOwnerNet) * bonusPoolRate

  return {
    grossRevenue: round2(grossRevenue),
    poolableOwnerNet: round2(poolableOwnerNet),
    discountsGranted: round2(discountsGranted),
    referralCredits: round2(referralCredits),
    referralPairs,
    driverBonuses: round2(driverBonuses),
    bonusPoolContributions: round2(bonusPoolContributions),
    newCustomers: newCustomers ?? 0,
    activeBuyers: buyerIds.size,
  }
}
