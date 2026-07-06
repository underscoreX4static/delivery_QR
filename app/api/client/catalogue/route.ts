import { NextRequest, NextResponse } from 'next/server'
import { requireTelegramUser } from '@/lib/client-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { refreshProductPrice } from '@/lib/inventory'
import type { Category, Product } from '@/types/index'

export async function GET(request: NextRequest) {
  const telegramUser = requireTelegramUser(request)
  if (!telegramUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: categories, error: catError } = await supabaseAdmin
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const { data: products, error: prodError } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('is_active', true)

  if (catError || prodError || !categories || !products) {
    return NextResponse.json({ error: 'Failed to load catalogue' }, { status: 500 })
  }

  const productsWithPrice = await Promise.all(
    (products as Product[]).map(async (product) => ({
      ...product,
      current_price: await refreshProductPrice(product.id),
    }))
  )

  const result = (categories as Category[]).map((category) => ({
    ...category,
    products: productsWithPrice
      .filter((p) => p.category_id === category.id && p.current_price !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }))

  return NextResponse.json({ categories: result })
}
