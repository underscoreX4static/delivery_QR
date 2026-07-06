import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  const { data: user, error: userError } = await supabaseAdmin.from('users').select('*').eq('id', id).single()
  if (userError || !user) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('*, order_items(product_id, quantity)')
    .eq('user_id', id)
    .order('created_at', { ascending: false })

  const productQuantity = new Map<string, number>()
  for (const order of orders ?? []) {
    for (const item of order.order_items ?? []) {
      productQuantity.set(item.product_id, (productQuantity.get(item.product_id) ?? 0) + item.quantity)
    }
  }

  const topProductIds = [...productQuantity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const { data: products } =
    topProductIds.length > 0
      ? await supabaseAdmin
          .from('products')
          .select('id, name')
          .in(
            'id',
            topProductIds.map(([id]) => id)
          )
      : { data: [] }

  const favouriteProducts = topProductIds.map(([productId, quantity]) => ({
    product_id: productId,
    name: (products ?? []).find((p) => p.id === productId)?.name ?? 'Unknown product',
    quantity,
  }))

  return NextResponse.json({ user, orders, favourite_products: favouriteProducts })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const notes = typeof body?.notes === 'string' ? body.notes : null

  const { data: user, error } = await supabaseAdmin.from('users').update({ notes }).eq('id', id).select('*').single()

  if (error || !user) {
    const hint = error?.message?.includes('column')
      ? 'Run: alter table users add column if not exists notes text; in the Supabase SQL editor first.'
      : undefined
    return NextResponse.json({ error: 'Failed to save notes', hint }, { status: 500 })
  }

  return NextResponse.json({ user })
}
