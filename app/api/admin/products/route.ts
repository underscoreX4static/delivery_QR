import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentPrices } from '@/lib/inventory'
import type { Product } from '@/types/index'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: products, error } = await supabaseAdmin
    .from('products')
    .select('*, categories(name), product_batches(id, quantity_remaining, is_active)')
    .order('name', { ascending: true })

  if (error || !products) return NextResponse.json({ error: 'Failed to load products' }, { status: 500 })

  const typedProducts = products as (Product & {
    categories: { name: string } | null
    product_batches: { id: string; quantity_remaining: number; is_active: boolean }[]
  })[]

  const priceByProduct = await getCurrentPrices(typedProducts.map((p) => p.id))
  const withPrice = typedProducts.map((product) => ({
    ...product,
    current_price: priceByProduct.get(product.id) ?? null,
    batch_count: product.product_batches.filter((b) => b.is_active).length,
  }))

  return NextResponse.json({ products: withPrice })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const categoryId = typeof body?.category_id === 'string' ? body.category_id : ''
  const targetMargin = Number(body?.target_margin ?? 0.55)

  if (!name || !categoryId) {
    return NextResponse.json({ error: 'name and category_id are required' }, { status: 400 })
  }

  const { data: product, error } = await supabaseAdmin
    .from('products')
    .insert({
      name,
      category_id: categoryId,
      brand: body?.brand ?? null,
      subcategory: body?.subcategory ?? null,
      description: body?.description ?? null,
      image_url: body?.image_url ?? null,
      target_margin: targetMargin,
    })
    .select('*')
    .single()

  if (error || !product) return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  return NextResponse.json({ product })
}
