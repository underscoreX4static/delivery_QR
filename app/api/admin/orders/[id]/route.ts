import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { advanceStatus, assignDriver, cancelOrder, confirmOrder, getOrder, markDelivered } from '@/lib/orders'
import { driverActionButtons, sendMessage } from '@/lib/telegram'

type ActionBody =
  | { action: 'confirm' }
  | { action: 'assign_driver'; driver_id: string }
  | { action: 'advance'; status: 'preparing' | 'on_the_way' }
  | { action: 'deliver' }
  | { action: 'cancel'; reason: string }

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId } = await context.params
  const body = (await request.json().catch(() => null)) as ActionBody | null
  if (!body?.action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })

  const changedBy = admin.email ?? admin.id

  try {
    switch (body.action) {
      case 'confirm': {
        const result = await confirmOrder(orderId, changedBy)
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
        await notifyCustomer(orderId, `✅ Your order #${orderId.slice(0, 8)} has been confirmed and is being prepared.`)
        break
      }
      case 'assign_driver': {
        if (!body.driver_id) return NextResponse.json({ error: 'driver_id is required' }, { status: 400 })
        await assignDriver(orderId, body.driver_id)
        const { data: driver } = await supabaseAdmin
          .from('drivers')
          .select('telegram_id')
          .eq('id', body.driver_id)
          .single()
        if (driver?.telegram_id) {
          await sendMessage(
            driver.telegram_id,
            `🚗 You've been assigned order #${orderId.slice(0, 8)}.`,
            { reply_markup: driverActionButtons(orderId) }
          )
        }
        break
      }
      case 'advance': {
        const result = await advanceStatus(orderId, body.status, changedBy)
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
        if (body.status === 'on_the_way') {
          await notifyCustomer(orderId, `🚗 Your order #${orderId.slice(0, 8)} is on the way!`)
        }
        break
      }
      case 'deliver': {
        const result = await markDelivered(orderId, changedBy)
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
        await notifyCustomer(orderId, `📦 Your order #${orderId.slice(0, 8)} has been delivered. Enjoy!`)
        break
      }
      case 'cancel': {
        if (!body.reason?.trim()) return NextResponse.json({ error: 'A cancellation reason is required' }, { status: 400 })
        const result = await cancelOrder(orderId, body.reason.trim(), changedBy)
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
        await notifyCustomer(orderId, `❌ Your order #${orderId.slice(0, 8)} was cancelled: ${body.reason.trim()}`)
        break
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    const order = await getOrder(orderId)
    return NextResponse.json({ order })
  } catch (err) {
    console.error('admin order action error', err)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}

async function notifyCustomer(orderId: string, text: string) {
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('users(telegram_id)')
    .eq('id', orderId)
    .single()

  const telegramId = (order?.users as unknown as { telegram_id: string } | null)?.telegram_id
  if (telegramId) await sendMessage(telegramId, text)
}
