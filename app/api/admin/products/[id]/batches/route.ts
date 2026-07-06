import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { suggestSellPrice } from '@/lib/calculations'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: productId } = await context.params
  const { data: batches, error } = await supabaseAdmin
    .from('product_batches')
    .select('*')
    .eq('product_id', productId)
    .order('received_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to load batches' }, { status: 500 })
  return NextResponse.json({ batches })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: productId } = await context.params
  const body = await request.json().catch(() => null)

  const quantity = Number(body?.quantity)
  const costPrice = Number(body?.cost_price)
  const supplier = typeof body?.supplier === 'string' ? body.supplier.trim() || null : null

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 })
  }
  if (!Number.isFinite(costPrice) || costPrice < 0) {
    return NextResponse.json({ error: 'cost_price must be a non-negative number' }, { status: 400 })
  }

  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('target_margin')
    .eq('id', productId)
    .single()

  if (productError || !product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const sellPrice =
    body?.sell_price !== undefined && body?.sell_price !== null
      ? Number(body.sell_price)
      : suggestSellPrice(costPrice, product.target_margin)

  const { data: batch, error } = await supabaseAdmin
    .from('product_batches')
    .insert({
      product_id: productId,
      quantity_total: quantity,
      quantity_remaining: quantity,
      cost_price: costPrice,
      sell_price: sellPrice,
      supplier,
    })
    .select('*')
    .single()

  if (error || !batch) return NextResponse.json({ error: 'Failed to create batch' }, { status: 500 })
  return NextResponse.json({ batch })
}
