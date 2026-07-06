import { NextRequest, NextResponse } from 'next/server'
import { requireTelegramUser } from '@/lib/client-auth'
import { getSettings } from '@/lib/settings'
import { getScheduledSlots, isStoreOpenNow } from '@/lib/store-hours'

export async function GET(request: NextRequest) {
  const telegramUser = requireTelegramUser(request)
  if (!telegramUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await getSettings()

  return NextResponse.json({
    is_open: isStoreOpenNow(settings),
    slots: getScheduledSlots(settings),
    delivery_fee: settings.deliveryFee,
    free_delivery_threshold: settings.freeDeliveryThreshold,
    discount_threshold: settings.discountThreshold,
    discount_rate: settings.discountRate,
  })
}
