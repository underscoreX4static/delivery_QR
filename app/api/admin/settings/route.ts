import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getSettings, updateSetting } from '@/lib/settings'
import { getSlotSettings, invalidateSlotSettingsCache, type WeekHours } from '@/lib/slots'
import { supabaseAdmin } from '@/lib/supabase'
import { sendMessage } from '@/lib/telegram'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [settings, slotSettings] = await Promise.all([getSettings(), getSlotSettings()])
  return NextResponse.json({
    settings: { ...settings, weekHours: slotSettings.weekHours, forceStatus: slotSettings.forceStatus },
  })
}

const FIELD_TO_KEY: Record<string, string> = {
  deliveryFee: 'delivery_fee',
  freeDeliveryThreshold: 'free_delivery_threshold',
  discountThreshold: 'discount_threshold',
  discountRate: 'discount_rate',
  discountThreshold2: 'discount_threshold_2',
  discountRate2: 'discount_rate_2',
  reorderDaysDefault: 'reorder_days_default',
  bonusPoolRate: 'bonus_pool_rate',
  referralRewardAmount: 'referral_reward_amount',
  startingCash: 'starting_cash',
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const updatedBy = admin.email ?? admin.id

  for (const [field, key] of Object.entries(FIELD_TO_KEY)) {
    if (field in body) {
      await updateSetting(key, String(body[field]), updatedBy)
    }
  }

  const before = await getSlotSettings()

  if ('weekHours' in body) {
    await updateSetting('store_hours', JSON.stringify(body.weekHours as WeekHours), updatedBy)
  }
  if ('forceStatus' in body) {
    await updateSetting('store_force_status', body.forceStatus ?? '', updatedBy)
  }
  invalidateSlotSettingsCache()

  const after = await getSlotSettings()

  if (body.broadcast && before.forceStatus !== after.forceStatus) {
    const message =
      after.forceStatus === 'closed'
        ? "🔴 We're closed for now — orders will resume once we're back open."
        : after.forceStatus === 'open'
          ? "🟢 We're open and taking orders!"
          : "🟢 We're back to normal hours."

    const { data: users } = await supabaseAdmin.from('users').select('telegram_id')
    for (const user of users ?? []) {
      await sendMessage(user.telegram_id, message).catch(() => {})
    }
  }

  const settings = await getSettings()
  return NextResponse.json({ settings: { ...settings, weekHours: after.weekHours, forceStatus: after.forceStatus } })
}
