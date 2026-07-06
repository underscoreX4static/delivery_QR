import { NextRequest, NextResponse } from 'next/server'
import { requireTelegramUser } from '@/lib/client-auth'
import { planConsumption } from '@/lib/inventory'
import { calculateOrderPricing } from '@/lib/calculations'
import { getSettings } from '@/lib/settings'
import type { CartLineItem, CartPreview } from '@/types/index'

export async function POST(request: NextRequest) {
  const telegramUser = requireTelegramUser(request)
  if (!telegramUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const items = body?.items as CartLineItem[] | undefined

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  }

  try {
    const plan = await planConsumption(items)
    const settings = await getSettings()
    const pricing = calculateOrderPricing(plan.subtotal, settings)

    const preview: CartPreview = {
      plan,
      subtotal: pricing.subtotal,
      delivery_fee: pricing.deliveryFee,
      discount: pricing.discount,
      discount_rate: pricing.discountRate,
      total: pricing.total,
    }

    return NextResponse.json(preview)
  } catch (err) {
    console.error('cart preview error', err)
    return NextResponse.json({ error: 'Failed to compute cart preview' }, { status: 500 })
  }
}
