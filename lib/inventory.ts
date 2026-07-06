import { supabaseAdmin } from '@/lib/supabase'
import type { CartLineItem, ConsumptionPlan, BatchConsumption, ProductBatch, OrderItem } from '@/types/index'

// ⚠️ CRITICAL: This is the ONLY file allowed to read or write product_batches
// stock levels. Never decrement/increment quantity_remaining anywhere else.
// products.stock_qty is kept in sync automatically by the DB trigger
// trg_sync_product_stock — do not write to it directly either.

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
 * Recomputes the FIFO plan fresh (to avoid acting on stale reads) and
 * atomically decrements each batch's quantity_remaining. Throws if stock is
 * insufficient or if a concurrent write raced us — callers should surface
 * the error to the user and let them retry.
 */
export async function commitConsumption(items: CartLineItem[]): Promise<ConsumptionPlan> {
  const plan = await planConsumption(items)

  if (plan.insufficient_stock.length > 0) {
    throw new Error(
      `Insufficient stock for: ${plan.insufficient_stock
        .map((s) => `${s.product_id} (wanted ${s.requested}, have ${s.available})`)
        .join(', ')}`
    )
  }

  const committed: BatchConsumption[] = []

  try {
    for (const line of plan.items) {
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

  return plan
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

async function incrementBatch(batchId: string, quantity: number): Promise<void> {
  const { data: batch, error: readError } = await supabaseAdmin
    .from('product_batches')
    .select('quantity_remaining')
    .eq('id', batchId)
    .single()

  if (readError || !batch) throw new Error(`Batch ${batchId} not found`)

  const { error: writeError } = await supabaseAdmin
    .from('product_batches')
    .update({ quantity_remaining: batch.quantity_remaining + quantity })
    .eq('id', batchId)

  if (writeError) throw new Error(`Failed to refund batch ${batchId}: ${writeError.message}`)
}

/**
 * Returns the current live display price for a product — the sell price of
 * its oldest active batch with remaining stock. There is no cached price
 * column on `products`; this is always computed from batch state so it can
 * never drift out of sync.
 */
export async function refreshProductPrice(productId: string): Promise<number | null> {
  const batches = await activeBatchesForProduct(productId)
  return batches.length > 0 ? batches[0].sell_price : null
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
