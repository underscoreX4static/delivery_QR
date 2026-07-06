import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getSettings, updateSetting } from '@/lib/settings'
import { supabaseAdmin } from '@/lib/supabase'
import { sendMessage } from '@/lib/telegram'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await getSettings()
  return NextResponse.json({ settings })
}

const FIELD_TO_KEY: Record<string, string> = {
  openTime: 'open_time',
  closeTime: 'close_time',
  isManuallyClosed: 'is_manually_closed',
  deliveryFee: 'delivery_fee',
  freeDeliveryThreshold: 'free_delivery_threshold',
  discountThreshold: 'discount_threshold',
  discountRate: 'discount_rate',
  reorderDaysDefault: 'reorder_days_default',
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const updatedBy = admin.email ?? admin.id
  const before = await getSettings()

  for (const [field, key] of Object.entries(FIELD_TO_KEY)) {
    if (field in body) {
      await updateSetting(key, String(body[field]), updatedBy)
    }
  }

  const wasClosed = before.isManuallyClosed
  const isNowClosed = 'isManuallyClosed' in body ? Boolean(body.isManuallyClosed) : wasClosed

  if (body.broadcast && wasClosed !== isNowClosed) {
    const message = isNowClosed
      ? "🔴 We're closed for now — orders will resume once we're back open."
      : "🟢 We're back open and taking orders!"

    const { data: users } = await supabaseAdmin.from('users').select('telegram_id')
    for (const user of users ?? []) {
      await sendMessage(user.telegram_id, message).catch(() => {})
    }
  }

  const settings = await getSettings()
  return NextResponse.json({ settings })
}
