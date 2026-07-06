import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

interface ImportRow {
  category_name: string
  subcategory?: string
  brand?: string
  product_name: string
  variant_size?: string
  description?: string
  price_sell: number | string
  price_cost: number | string
  stock_qty: number | string
  image_url?: string
  is_active?: string | boolean
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const rows = body?.rows as ImportRow[] | undefined
  if (!rows?.length) return NextResponse.json({ error: 'No rows to import' }, { status: 400 })

  const categoryCache = new Map<string, string>()
  let createdCategories = 0
  let createdProducts = 0
  let updatedProducts = 0
  const errors: { row: number; error: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    try {
      const categoryName = String(row.category_name ?? '').trim()
      const productName = String(row.product_name ?? '').trim()
      const variantSize = String(row.variant_size ?? '').trim()
      const priceSell = Number(row.price_sell)
      const priceCost = Number(row.price_cost)
      const stockQty = Number(row.stock_qty)
      const isActive =
        typeof row.is_active === 'boolean' ? row.is_active : String(row.is_active ?? 'true').toLowerCase() !== 'false'

      if (!categoryName || !productName) throw new Error('category_name and product_name are required')
      if (!Number.isFinite(priceSell) || priceSell <= 0) throw new Error('price_sell must be a positive number')
      if (!Number.isFinite(priceCost) || priceCost < 0) throw new Error('price_cost must be a non-negative number')
      if (!Number.isFinite(stockQty) || stockQty < 0) throw new Error('stock_qty must be a non-negative number')

      const categoryId = await resolveCategory(categoryName, categoryCache, () => createdCategories++)
      const displayName = variantSize ? `${productName} - ${variantSize}` : productName
      const targetMargin = priceSell > 0 ? round4(1 - priceCost / priceSell) : 0.55

      const { data: existing } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('category_id', categoryId)
        .eq('name', displayName)
        .maybeSingle()

      let productId: string

      if (existing) {
        await supabaseAdmin
          .from('products')
          .update({
            brand: row.brand || null,
            subcategory: row.subcategory || null,
            description: row.description || null,
            image_url: row.image_url || null,
            is_active: isActive,
            target_margin: targetMargin,
          })
          .eq('id', existing.id)
        productId = existing.id
        updatedProducts++
      } else {
        const { data: created, error } = await supabaseAdmin
          .from('products')
          .insert({
            category_id: categoryId,
            name: displayName,
            brand: row.brand || null,
            subcategory: row.subcategory || null,
            description: row.description || null,
            image_url: row.image_url || null,
            is_active: isActive,
            target_margin: targetMargin,
          })
          .select('id')
          .single()

        if (error || !created) throw new Error(error?.message ?? 'Failed to create product')
        productId = created.id
        createdProducts++
      }

      const { error: batchError } = await supabaseAdmin.from('product_batches').insert({
        product_id: productId,
        quantity_total: stockQty,
        quantity_remaining: stockQty,
        cost_price: priceCost,
        sell_price: priceSell,
        is_active: isActive,
      })

      if (batchError) throw new Error(batchError.message)
    } catch (err) {
      errors.push({ row: i + 1, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return NextResponse.json({
    imported: rows.length - errors.length,
    created_products: createdProducts,
    updated_products: updatedProducts,
    created_categories: createdCategories,
    errors,
  })
}

async function resolveCategory(
  name: string,
  cache: Map<string, string>,
  onCreate: () => void
): Promise<string> {
  const key = name.toLowerCase()
  const cached = cache.get(key)
  if (cached) return cached

  const { data: existing } = await supabaseAdmin
    .from('categories')
    .select('id')
    .ilike('name', name)
    .maybeSingle()

  if (existing) {
    cache.set(key, existing.id)
    return existing.id
  }

  const { data: created, error } = await supabaseAdmin
    .from('categories')
    .insert({ name })
    .select('id')
    .single()

  if (error || !created) throw new Error(`Failed to create category "${name}": ${error?.message}`)
  onCreate()
  cache.set(key, created.id)
  return created.id
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
