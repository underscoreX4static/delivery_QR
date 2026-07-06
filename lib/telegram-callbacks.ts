import type { CallbackQuery, Message } from 'node-telegram-bot-api'
import { supabaseAdmin } from '@/lib/supabase'
import { answerCallbackQuery, OWNER_TELEGRAM_ID, sendMessage } from '@/lib/telegram'
import { assignDriver, confirmOrder as confirmOrderTransition } from '@/lib/orders'
import type { Order } from '@/types/index'

type Action = 'confirm_order' | 'self_handle' | 'on_the_way' | 'delivered' | 'cancel_order'

export async function handleCallbackQuery(query: CallbackQuery) {
  const data = query.data ?? ''
  const [action, orderId] = data.split(':') as [Action, string]
  const fromTelegramId = String(query.from.id)

  if (!orderId) {
    await answerCallbackQuery(query.id)
    return
  }

  switch (action) {
    case 'confirm_order':
      await confirmOrder(query, orderId, fromTelegramId)
      break
    case 'self_handle':
      await selfHandle(query, orderId, fromTelegramId)
      break
    case 'on_the_way':
    case 'delivered':
    case 'cancel_order':
      // Implemented in Step 9 (driver bot flows).
      await answerCallbackQuery(query.id)
      break
    default:
      await answerCallbackQuery(query.id)
  }
}

/** Placeholder — cancellation reason capture is wired up in Step 9. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleReplyMessage(_message: Message) {
  return
}

async function requireOwner(query: CallbackQuery, fromTelegramId: string): Promise<boolean> {
  if (fromTelegramId !== OWNER_TELEGRAM_ID) {
    await answerCallbackQuery(query.id, 'Only the owner can do that.')
    return false
  }
  return true
}

async function getOrderWithCustomer(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('*, users(telegram_id)')
    .eq('id', orderId)
    .single()
  return order as (Order & { users: { telegram_id: string } | null }) | null
}

async function confirmOrder(query: CallbackQuery, orderId: string, fromTelegramId: string) {
  if (!(await requireOwner(query, fromTelegramId))) return

  const result = await confirmOrderTransition(orderId, fromTelegramId)
  if (!result.ok) {
    await answerCallbackQuery(query.id, `Could not confirm: ${result.error}`)
    return
  }

  await answerCallbackQuery(query.id, 'Order confirmed')

  const order = await getOrderWithCustomer(orderId)
  if (order?.users?.telegram_id) {
    await sendMessage(
      order.users.telegram_id,
      `✅ Your order #${orderId.slice(0, 8)} has been confirmed and is being prepared.`
    )
  }
}

async function selfHandle(query: CallbackQuery, orderId: string, fromTelegramId: string) {
  if (!(await requireOwner(query, fromTelegramId))) return

  const { data: ownerDriver } = await supabaseAdmin
    .from('drivers')
    .select('id')
    .eq('is_owner', true)
    .single()

  if (!ownerDriver) {
    await answerCallbackQuery(query.id, 'Owner driver record not found.')
    return
  }

  const result = await confirmOrderTransition(orderId, fromTelegramId)
  if (!result.ok) {
    await answerCallbackQuery(query.id, `Could not confirm: ${result.error}`)
    return
  }

  await assignDriver(orderId, ownerDriver.id)
  await answerCallbackQuery(query.id, 'You are now handling this order')

  const order = await getOrderWithCustomer(orderId)
  if (order?.users?.telegram_id) {
    await sendMessage(
      order.users.telegram_id,
      `✅ Your order #${orderId.slice(0, 8)} has been confirmed. HAZE will personally deliver it.`
    )
  }
}
