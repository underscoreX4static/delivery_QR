import { supabaseAdmin } from '@/lib/supabase'
import { getSettings } from '@/lib/settings'
import { notifyOwner } from '@/lib/telegram'
import type { Product, VelocityTier } from '@/types/index'

const WINDOW_DAYS = 30

const TIER_MULTIPLIER: Record<VelocityTier, number> = {
  bestseller: 1.5,
  normal: 1.0,
  slow_mover: 0.5,
}

const TIER_EMOJI: Record<VelocityTier, string> = {
  bestseller: '🔥 Bestseller',
  normal: '📦 Normal',
  slow_mover: '🐌 Slow mover',
}

interface ProductMetrics {
  productId: string
  unitsSold: number
  revenue: number
  grossProfit: number
}

/** Sums delivered order_items for every active product over the trailing WINDOW_DAYS. */
async function computeMetricsForActiveProducts(): Promise<Map<string, ProductMetrics>> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: deliveredOrders } = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('status', 'delivered')
    .gte('created_at', cutoff)

  const orderIds = (deliveredOrders ?? []).map((o) => o.id)
  const metrics = new Map<string, ProductMetrics>()
  if (orderIds.length === 0) return metrics

  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('product_id, quantity, unit_sell_price, unit_cost_price')
    .in('order_id', orderIds)

  for (const item of items ?? []) {
    const existing = metrics.get(item.product_id) ?? { productId: item.product_id, unitsSold: 0, revenue: 0, grossProfit: 0 }
    existing.unitsSold += item.quantity
    existing.revenue += item.quantity * item.unit_sell_price
    existing.grossProfit += item.quantity * (item.unit_sell_price - item.unit_cost_price)
    metrics.set(item.product_id, existing)
  }

  return metrics
}

function assignTiers(productIds: string[], metrics: Map<string, ProductMetrics>): Map<string, VelocityTier> {
  const ranked = [...productIds].sort(
    (a, b) => (metrics.get(b)?.grossProfit ?? 0) - (metrics.get(a)?.grossProfit ?? 0)
  )

  const tiers = new Map<string, VelocityTier>()
  const bestsellerCutoff = Math.ceil(ranked.length * 0.2)
  const slowMoverCutoff = Math.floor(ranked.length * 0.8)

  ranked.forEach((productId, index) => {
    if (index < bestsellerCutoff) tiers.set(productId, 'bestseller')
    else if (index >= slowMoverCutoff) tiers.set(productId, 'slow_mover')
    else tiers.set(productId, 'normal')
  })

  return tiers
}

/**
 * Nightly cron body: recomputes velocity tiers + avg_daily_units for every
 * active product, persists them, and sends deduplicated restock alerts.
 */
export async function refreshInventoryIntelligence(): Promise<{ productsUpdated: number; alertsSent: number }> {
  const { data: products } = await supabaseAdmin.from('products').select('*').eq('is_active', true)
  if (!products || products.length === 0) return { productsUpdated: 0, alertsSent: 0 }

  const metrics = await computeMetricsForActiveProducts()
  const productIds = products.map((p) => p.id)
  const tiers = assignTiers(productIds, metrics)
  const settings = await getSettings()

  let alertsSent = 0

  for (const product of products as Product[]) {
    const tier = tiers.get(product.id) ?? 'normal'
    const avgDailyUnits = (metrics.get(product.id)?.unitsSold ?? 0) / WINDOW_DAYS

    await supabaseAdmin
      .from('products')
      .update({ velocity_tier: tier, avg_daily_units: avgDailyUnits })
      .eq('id', product.id)

    if (avgDailyUnits === 0) continue // never sold — nothing meaningful to alert on

    const daysRemaining = product.stock_qty / avgDailyUnits
    const effectiveThreshold = settings.reorderDaysDefault * TIER_MULTIPLIER[tier]

    if (daysRemaining < effectiveThreshold) {
      const sent = await maybeSendRestockAlert(product, tier, avgDailyUnits, daysRemaining)
      if (sent) alertsSent++
    }
  }

  return { productsUpdated: products.length, alertsSent }
}

async function maybeSendRestockAlert(
  product: Product,
  tier: VelocityTier,
  avgDailyUnits: number,
  daysRemaining: number
): Promise<boolean> {
  const dedupeKey = `last_restock_alert:${product.id}`
  const { data: existing } = await supabaseAdmin.from('settings').select('value').eq('key', dedupeKey).maybeSingle()

  if (existing) {
    const lastSent = new Date(existing.value).getTime()
    if (Date.now() - lastSent < 24 * 60 * 60 * 1000) return false
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  await notifyOwner(
    `⚠️ Restock alert — ${product.name}\n` +
      `Stock: ${product.stock_qty} units (~${daysRemaining.toFixed(1)} days remaining)\n` +
      `Avg sales: ${avgDailyUnits.toFixed(2)} units/day\n` +
      `Tier: ${TIER_EMOJI[tier]}\n\n` +
      `Tap below to create a new batch.`,
    { inline_keyboard: [[{ text: '➕ Add batch', url: `${appUrl}/admin/products` }]] }
  )

  await supabaseAdmin
    .from('settings')
    .upsert({ key: dedupeKey, value: new Date().toISOString() }, { onConflict: 'key' })

  return true
}

export interface InventoryRow extends Product {
  days_remaining: number | null
  profit_30d: number
  revenue_30d: number
  status: 'restock' | 'soon' | 'ok'
}

/** Live view for the /admin/inventory dashboard — reads persisted tiers, computes display-only figures fresh. */
export async function getInventoryDashboard(): Promise<InventoryRow[]> {
  const { data: products } = await supabaseAdmin.from('products').select('*').eq('is_active', true)
  if (!products) return []

  const metrics = await computeMetricsForActiveProducts()
  const settings = await getSettings()

  return (products as Product[]).map((product) => {
    const m = metrics.get(product.id)
    const daysRemaining = product.avg_daily_units > 0 ? product.stock_qty / product.avg_daily_units : null
    const effectiveThreshold = settings.reorderDaysDefault * TIER_MULTIPLIER[product.velocity_tier]

    let status: InventoryRow['status'] = 'ok'
    if (daysRemaining !== null) {
      if (daysRemaining < effectiveThreshold) status = 'restock'
      else if (daysRemaining < effectiveThreshold * 1.5) status = 'soon'
    }

    return {
      ...product,
      days_remaining: daysRemaining,
      profit_30d: m?.grossProfit ?? 0,
      revenue_30d: m?.revenue ?? 0,
      status,
    }
  })
}
