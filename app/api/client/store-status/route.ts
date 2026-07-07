import { NextRequest, NextResponse } from 'next/server'
import { requireTelegramUser } from '@/lib/client-auth'
import { getSettings } from '@/lib/settings'
import {
  buildSlots,
  getMinutesUntilClose,
  getMinutesUntilOpen,
  getNextOpenLabel,
  getSlotSettings,
  isStoreOpenNow,
} from '@/lib/slots'
import { supabaseAdmin } from '@/lib/supabase'

// Telegram's in-app WebViews (iOS especially, but Safari too) cache GET
// responses aggressively even when the client fetch call itself says
// cache: 'no-store' — the server has to refuse caching explicitly, on every
// layer, or a customer can see a stale "slot available" long after it's taken.
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const ACTIVE_SCHEDULED_STATUSES = ['pending', 'confirmed', 'preparing', 'on_the_way']

export async function GET(request: NextRequest) {
  const telegramUser = requireTelegramUser(request)
  if (!telegramUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()

  const [settings, slotSettings, { data: activeOrders }] = await Promise.all([
    getSettings(),
    getSlotSettings(),
    supabaseAdmin.from('orders').select('scheduled_at').in('status', ACTIVE_SCHEDULED_STATUSES).not('scheduled_at', 'is', null),
  ])

  const takenIsos = (activeOrders ?? []).map((o) => o.scheduled_at as string)
  const slots = buildSlots(now, slotSettings.weekHours, takenIsos)
  const open = isStoreOpenNow(slotSettings, now)

  return NextResponse.json(
    {
      is_open: open,
      next_open: open ? null : getNextOpenLabel(slotSettings, now),
      slots,
      minutes_until_close: getMinutesUntilClose(slotSettings, now),
      minutes_until_open: getMinutesUntilOpen(slotSettings, now),
      forced: slotSettings.forceStatus,
      delivery_fee: settings.deliveryFee,
      free_delivery_threshold: settings.freeDeliveryThreshold,
      discount_threshold: settings.discountThreshold,
      discount_rate: settings.discountRate,
      discount_threshold_2: settings.discountThreshold2,
      discount_rate_2: settings.discountRate2,
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
