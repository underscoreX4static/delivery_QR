import { NextRequest, NextResponse } from 'next/server'
import { requireTelegramUser } from '@/lib/client-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { cancelOrder } from '@/lib/orders'
import { notifyOwner, sendMessage } from '@/lib/telegram'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const telegramUser = requireTelegramUser(request)
  if (!telegramUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('*, users!inner(telegram_id), order_items(*)')
    .eq('id', id)
    .single()

  if (error || !order || order.users.telegram_id !== telegramUser.telegram_id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  return NextResponse.json({ order })
}

// Once the driver has started preparing the order, it's too late for the
// customer to back out on their own — from here on, cancelling means
// calling support so someone actually stops the physical prep/delivery.
const CUSTOMER_CANCELLABLE_STATUSES = ['pending', 'confirmed']

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const telegramUser = requireTelegramUser(request)
  if (!telegramUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (body?.action !== 'cancel') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const { id } = await context.params

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('*, users!inner(telegram_id), drivers(telegram_id)')
    .eq('id', id)
    .single()

  if (error || !order || order.users.telegram_id !== telegramUser.telegram_id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
    return NextResponse.json(
      { error: 'This order is already being prepared and can no longer be cancelled — message support if you need help.' },
      { status: 400 }
    )
  }

  const result = await cancelOrder(id, 'Cancelled by customer', telegramUser.telegram_id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })

  await notifyOwner(`❌ Order #${id.slice(0, 8)} was cancelled by the customer.`)
  if (order.drivers?.telegram_id) {
    await sendMessage(order.drivers.telegram_id, `❌ Order #${id.slice(0, 8)} was cancelled by the customer.`).catch(() => {})
  }

  const { data: updatedOrder } = await supabaseAdmin.from('orders').select('*').eq('id', id).single()
  return NextResponse.json({ order: updatedOrder })
}
