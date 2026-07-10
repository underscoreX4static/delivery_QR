import { supabaseAdmin } from '@/lib/supabase'
import { calculatePayout, calculateBonusPoolContribution } from '@/lib/calculations'
import { getSettings, type StoreSettings } from '@/lib/settings'
import { getBrisbaneDateString } from '@/lib/store-hours'
import type { Order, OrderItem } from '@/types/index'

export interface EarningsSummary {
  orderCount: number
  grossRevenue: number
  grossProfit: number
  driverPayouts: number
  affiliateCommissions: number
  /** grossProfit × 0.62 − commissions — the owner's share BEFORE the driver bonus pool is funded. */
  ownerNet: number
  /**
   * Slice of ownerNet set aside into driver bonus pools on non-owner-driver
   * deliveries (ownerNet × bonusPoolRate). Estimated at the CURRENT pool rate,
   * so a historical period reflects today's rate, not whatever was live then.
   */
  bonusPoolContributions: number
  /** ownerNet − bonusPoolContributions — what the owner actually keeps after funding the pool. */
  ownerTakeHome: number
}

const EMPTY_SUMMARY: EarningsSummary = {
  orderCount: 0,
  grossRevenue: 0,
  grossProfit: 0,
  driverPayouts: 0,
  affiliateCommissions: 0,
  ownerNet: 0,
  bonusPoolContributions: 0,
  ownerTakeHome: 0,
}

/** Computes the full financial summary for all delivered orders in [start, now). start=null means all-time. */
export async function computeEarnings(start: Date | null): Promise<EarningsSummary> {
  let query = supabaseAdmin.from('orders').select('*').eq('status', 'delivered')
  if (start) query = query.gte('created_at', start.toISOString())
  const { data: orders } = await query

  if (!orders || orders.length === 0) return { ...EMPTY_SUMMARY }

  const orderIds = orders.map((o) => o.id)
  const driverIds = [...new Set(orders.map((o) => o.driver_id).filter((id): id is string => Boolean(id)))]

  const [{ data: items }, { data: drivers }, { data: commissions }] = await Promise.all([
    supabaseAdmin.from('order_items').select('*').in('order_id', orderIds),
    driverIds.length
      ? supabaseAdmin.from('drivers').select('id, is_owner').in('id', driverIds)
      : Promise.resolve({ data: [] as { id: string; is_owner: boolean }[] }),
    // Read the frozen commission per order rather than recomputing from the
    // partner's current commission_rate — see calculatePayout's
    // affiliateCommissionOverride doc for why.
    supabaseAdmin.from('affiliate_commissions').select('order_id, commission_amount').in('order_id', orderIds),
  ])

  const itemsByOrder = new Map<string, OrderItem[]>()
  for (const item of (items as OrderItem[]) ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? []
    list.push(item)
    itemsByOrder.set(item.order_id, list)
  }

  const ownerDriverIds = new Set((drivers ?? []).filter((d) => d.is_owner).map((d) => d.id))
  const commissionByOrder = new Map((commissions ?? []).map((c) => [c.order_id, c.commission_amount]))

  const settings = await getSettings()
  const { bonusPoolRate } = settings

  const summary: EarningsSummary = { ...EMPTY_SUMMARY, orderCount: orders.length }

  for (const order of orders as Order[]) {
    const commission = commissionByOrder.get(order.id) ?? 0
    const driverIsOwner = order.driver_id ? ownerDriverIds.has(order.driver_id) : false
    const costOfGoods = (itemsByOrder.get(order.id) ?? []).reduce((sum, i) => sum + i.unit_cost_price * i.quantity, 0)
    const { margin, driverPayout, ownerNet } = resolvePayout(order, costOfGoods, driverIsOwner, commission, settings)

    summary.grossRevenue += order.total
    summary.grossProfit += margin
    summary.driverPayouts += driverPayout
    summary.affiliateCommissions += commission
    summary.ownerNet += ownerNet

    // The pool is funded on every non-owner-driver delivery (see markDelivered
    // in lib/orders.ts) — mirror that exactly so the finance view reconciles
    // with what actually lands in driver pool balances.
    if (order.driver_id && !driverIsOwner) {
      summary.bonusPoolContributions += calculateBonusPoolContribution(ownerNet, bonusPoolRate)
    }
  }

  summary.ownerTakeHome = summary.ownerNet - summary.bonusPoolContributions

  return round(summary)
}

/**
 * Payout for a delivered order, preferring the snapshot frozen at delivery
 * (decision D5) and falling back to a fresh calculatePayout only when the
 * snapshot is missing (order delivered before migration 009 / its backfill).
 * The commission is always the frozen snapshot amount.
 */
export function resolvePayout(
  order: Order,
  costOfGoods: number,
  driverIsOwner: boolean,
  commissionSnapshot: number,
  settings: StoreSettings
): { margin: number; driverPayout: number; ownerNet: number } {
  if (order.margin != null && order.driver_payout != null && order.owner_net != null) {
    return { margin: order.margin, driverPayout: order.driver_payout, ownerNet: order.owner_net }
  }
  const creditApplied = Math.round((order.subtotal + order.delivery_fee - order.discount - order.total) * 100) / 100
  const payout = calculatePayout({
    subtotal: order.subtotal,
    discount: order.discount,
    deliveryFee: order.delivery_fee,
    creditApplied,
    costOfGoods,
    driverIsOwner,
    partnerCommissionRate: 0,
    affiliateCommissionOverride: commissionSnapshot,
    driverShare: settings.driverShare,
    ownerFloor: settings.ownerFloor,
  })
  return { margin: payout.margin, driverPayout: payout.driverPayout, ownerNet: payout.ownerNet }
}

export interface DailyRevenuePoint {
  date: string // YYYY-MM-DD (Brisbane)
  revenue: number
}

/** Daily gross revenue for the trailing N days (Brisbane calendar days), for the earnings chart. */
export async function getDailyRevenueSeries(days = 14): Promise<DailyRevenuePoint[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('total, created_at')
    .eq('status', 'delivered')
    .gte('created_at', since.toISOString())

  const byDate = new Map<string, number>()
  for (const order of orders ?? []) {
    const dateKey = getBrisbaneDateString(new Date(order.created_at))
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + order.total)
  }

  const series: DailyRevenuePoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = getBrisbaneDateString(new Date(Date.now() - i * 24 * 60 * 60 * 1000))
    series.push({ date, revenue: Math.round((byDate.get(date) ?? 0) * 100) / 100 })
  }
  return series
}

function round(summary: EarningsSummary): EarningsSummary {
  const r = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
  return {
    orderCount: summary.orderCount,
    grossRevenue: r(summary.grossRevenue),
    grossProfit: r(summary.grossProfit),
    driverPayouts: r(summary.driverPayouts),
    affiliateCommissions: r(summary.affiliateCommissions),
    ownerNet: r(summary.ownerNet),
    bonusPoolContributions: r(summary.bonusPoolContributions),
    ownerTakeHome: r(summary.ownerTakeHome),
  }
}
