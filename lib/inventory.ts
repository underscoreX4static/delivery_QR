import { supabaseAdmin } from '@/lib/supabase'
import type { CartLineItem, ConsumptionPlan, BatchConsumption, ProductBatch, OrderItem } from '@/types/index'

// ⚠️ CRITICAL: This is the ONLY file allowed to read or write product_batches
// stock levels. Never decrement/increment quantity_remaining anywhere else.
// products.stock_qty is kept in sync automatically by the DB trigger
// trg_sync_product_stock — do not write to it directly either.

const MAX_LINE_ITEMS = 30
const MAX_QUANTITY_PER_ITEM = 99

/**
 * Validates raw client JSON into well-formed cart items before it ever
 * reaches planConsumption — this is the public entry point for both order
 * creation and cart preview, so it can't trust quantity, shape, or bounds.
 * Rejects (returns null) on: non-integer/out-of-range quantity, a repeated
 * product_id (which would otherwise silently plan the same stock twice),
 * or more line items than a real cart could plausibly have.
 */
export function validateCartItems(items: unknown): CartLineItem[] | null {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_LINE_ITEMS) return null

  const seen = new Set<string>()
  const result: CartLineItem[] = []

  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) return null
    const { product_id: productId, quantity } = raw as Record<string, unknown>

    if (typeof productId !== 'string' || !productId || seen.has(productId)) return null
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > MAX_QUANTITY_PER_ITEM) {
      return null
    }

    seen.add(productId)
    result.push({ product_id: productId, quantity: quantity as number })
  }

  return result
}

async function activeBatchesForProduct(productId: string): Promise<ProductBatch[]> {
  const { data, error } = await supabaseAdmin
    .from('product_batches')
    .select('*')
    .eq('product_id', productId)
    .eq('is_active', true)
    .gt('quantity_remaining', 0)
    .order('received_at', { ascending: true })

  if (error) throw new Error(`Failed to load batches for product ${productId}: ${error.message}`)
  return data as ProductBatch[]
}

/**
 * Dry-run FIFO consumption plan. Reads current batch state but performs no
 * writes. Safe to call repeatedly (e.g. for cart preview).
 */
export async function planConsumption(items: CartLineItem[]): Promise<ConsumptionPlan> {
  const plan: BatchConsumption[] = []
  const insufficient_stock: ConsumptionPlan['insufficient_stock'] = []
  const productBatchCounts = new Map<string, number>()

  for (const item of items) {
    if (item.quantity <= 0) continue

    const batches = await activeBatchesForProduct(item.product_id)
    let remainingToConsume = item.quantity
    let batchesUsed = 0

    for (const batch of batches) {
      if (remainingToConsume <= 0) break

      const takeFromBatch = Math.min(batch.quantity_remaining, remainingToConsume)
      if (takeFromBatch <= 0) continue

      plan.push({
        batch_id: batch.id,
        product_id: item.product_id,
        quantity: takeFromBatch,
        unit_sell_price: batch.sell_price,
        unit_cost_price: batch.cost_price,
        line_total: round2(takeFromBatch * batch.sell_price),
      })

      remainingToConsume -= takeFromBatch
      batchesUsed += 1
    }

    productBatchCounts.set(item.product_id, batchesUsed)

    if (remainingToConsume > 0) {
      const available = item.quantity - remainingToConsume
      insufficient_stock.push({
        product_id: item.product_id,
        requested: item.quantity,
        available,
      })
    }
  }

  const split_batch_products = [...productBatchCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([productId]) => productId)

  const subtotal = round2(plan.reduce((sum, line) => sum + line.line_total, 0))

  return { items: plan, subtotal, split_batch_products, insufficient_stock }
}

/**
 * Batch assignment happens once, at order creation (via planConsumption),
 * and is stored on order_items.batch_id — it never gets re-planned. This
 * commits that already-decided consumption by decrementing exactly those
 * batch/quantity pairs, called when the owner confirms the order. Throws if
 * a concurrent write raced us (e.g. another order drained the batch first)
 * — callers should surface the error and let staff resolve it manually.
 */
export async function commitConsumption(
  items: { batch_id: string; quantity: number }[]
): Promise<void> {
  const committed: { batch_id: string; quantity: number }[] = []

  try {
    for (const line of items) {
      const { data: batch, error: readError } = await supabaseAdmin
        .from('product_batches')
        .select('quantity_remaining')
        .eq('id', line.batch_id)
        .single()

      if (readError || !batch) throw new Error(`Batch ${line.batch_id} not found`)

      const newQuantity = batch.quantity_remaining - line.quantity
      if (newQuantity < 0) {
        throw new Error(`Batch ${line.batch_id} stock changed concurrently, retry the order`)
      }

      const { error: writeError, count } = await supabaseAdmin
        .from('product_batches')
        .update({ quantity_remaining: newQuantity }, { count: 'exact' })
        .eq('id', line.batch_id)
        .eq('quantity_remaining', batch.quantity_remaining)

      if (writeError || !count) {
        throw new Error(`Batch ${line.batch_id} stock changed concurrently, retry the order`)
      }

      committed.push(line)
    }
  } catch (err) {
    // Best-effort rollback of whatever we already committed in this call.
    for (const line of committed) {
      await incrementBatch(line.batch_id, line.quantity)
    }
    throw err
  }
}

/**
 * Reverses stock consumption for a cancelled order — puts quantity back on
 * the exact batches it was originally taken from.
 */
export async function refundConsumption(orderItems: OrderItem[]): Promise<void> {
  for (const item of orderItems) {
    await incrementBatch(item.batch_id, item.quantity)
  }
}

const INCREMENT_RETRY_ATTEMPTS = 5

/**
 * Adds `quantity` back onto a batch (refunds, commit rollback). Uses the
 * same optimistic-concurrency pattern as commitConsumption's decrement —
 * without it, a refund landing at the same instant as another order's
 * commit could read-then-write over each other and lose one side's update.
 * Unlike a decrement, an increment has no legitimate reason to ever fail
 * (there's no "insufficient stock" concept when giving stock back), so this
 * retries against fresh state instead of surfacing a transient race to staff.
 */
async function incrementBatch(batchId: string, quantity: number): Promise<void> {
  for (let attempt = 0; attempt < INCREMENT_RETRY_ATTEMPTS; attempt++) {
    const { data: batch, error: readError } = await supabaseAdmin
      .from('product_batches')
      .select('quantity_remaining')
      .eq('id', batchId)
      .single()

    if (readError || !batch) throw new Error(`Batch ${batchId} not found`)

    const { error: writeError, count } = await supabaseAdmin
      .from('product_batches')
      .update({ quantity_remaining: batch.quantity_remaining + quantity }, { count: 'exact' })
      .eq('id', batchId)
      .eq('quantity_remaining', batch.quantity_remaining)

    if (!writeError && count) return
  }

  throw new Error(`Failed to refund batch ${batchId}: too much concurrent contention`)
}

/**
 * Batched version of refreshProductPrice for many products at once — the
 * catalogue endpoint is the single most-called route in the app and grows
 * linearly with the number of products, so pricing every product with its
 * own query (N+1) doesn't scale the way a one-off admin lookup can afford to.
 */
export async function getCurrentPrices(productIds: string[]): Promise<Map<string, number | null>> {
  const priceByProduct = new Map<string, number | null>()
  if (productIds.length === 0) return priceByProduct

  const { data, error } = await supabaseAdmin
    .from('product_batches')
    .select('product_id, sell_price, received_at')
    .in('product_id', productIds)
    .eq('is_active', true)
    .gt('quantity_remaining', 0)
    .order('received_at', { ascending: true })

  if (error) throw new Error(`Failed to load batch prices: ${error.message}`)

  for (const row of data ?? []) {
    // First row per product (received_at ascending) is the FIFO-oldest
    // active batch — same precedence activeBatchesForProduct() uses.
    if (!priceByProduct.has(row.product_id)) priceByProduct.set(row.product_id, row.sell_price)
  }
  for (const id of productIds) {
    if (!priceByProduct.has(id)) priceByProduct.set(id, null)
  }

  return priceByProduct
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
