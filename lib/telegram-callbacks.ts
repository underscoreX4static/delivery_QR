import type { CallbackQuery, Message } from 'node-telegram-bot-api'
import { supabaseAdmin } from '@/lib/supabase'
import { answerCallbackQuery, driverActionButtons, OWNER_TELEGRAM_ID, sendMessage } from '@/lib/telegram'
import {
  advanceStatus,
  assignDriver,
  cancelOrder as cancelOrderTransition,
  confirmOrder as confirmOrderTransition,
  markDelivered,
} from '@/lib/orders'
import type { Order } from '@/types/index'

type Action = 'confirm_order' | 'self_handle' | 'on_the_way' | 'delivered' | 'cancel_order'

type OrderWithRelations = Order & {
  users: { telegram_id: string } | null
  drivers: { telegram_id: string } | null
}

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
      await onTheWay(query, orderId, fromTelegramId)
      break
    case 'delivered':
      await delivered(query, orderId, fromTelegramId)
      break
    case 'cancel_order':
      await startCancelFlow(query, orderId, fromTelegramId)
      break
    default:
      await answerCallbackQuery(query.id)
  }
}

/**
 * Cancellation reasons are captured via Telegram's force-reply: startCancelFlow
 * sends a force-reply prompt with the order id embedded in its text, and this
 * handler recovers the order id from `reply_to_message.text` — no server-side
 * state needed between the two messages.
 */
export async function handleReplyMessage(message: Message) {
  const promptText = message.reply_to_message?.text ?? ''
  const match = promptText.match(/order ([0-9a-f-]{36})/i)
  if (!match) return

  const orderId = match[1]
  const fromTelegramId = String(message.from!.id)
  const reason = message.text?.trim()
  if (!reason) return

  const order = await getOrderWithRelations(orderId)
  if (!order || !isAuthorizedForOrder(order, fromTelegramId)) return

  const result = await cancelOrderTransition(orderId, reason, fromTelegramId)
  if (!result.ok) {
    await sendMessage(fromTelegramId, `Could not cancel: ${result.error}`)
    return
  }

  await sendMessage(fromTelegramId, `Order #${orderId.slice(0, 8)} cancelled.`)
  if (order.users?.telegram_id) {
    await sendMessage(order.users.telegram_id, `❌ Your order #${orderId.slice(0, 8)} was cancelled: ${reason}`)
  }
  if (order.drivers?.telegram_id && order.drivers.telegram_id !== fromTelegramId) {
    await sendMessage(order.drivers.telegram_id, `❌ Order #${orderId.slice(0, 8)} was cancelled: ${reason}`)
  }
}

async function requireOwner(query: CallbackQuery, fromTelegramId: string): Promise<boolean> {
  if (fromTelegramId !== OWNER_TELEGRAM_ID) {
    await answerCallbackQuery(query.id, 'Only the owner can do that.')
    return false
  }
  return true
}

function isAuthorizedForOrder(order: OrderWithRelations, fromTelegramId: string): boolean {
  return fromTelegramId === OWNER_TELEGRAM_ID || order.drivers?.telegram_id === fromTelegramId
}

async function getOrderWithRelations(orderId: string): Promise<OrderWithRelations | null> {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('*, users(telegram_id), drivers(telegram_id)')
    .eq('id', orderId)
    .single()
  return data as OrderWithRelations | null
}

async function confirmOrder(query: CallbackQuery, orderId: string, fromTelegramId: string) {
  if (!(await requireOwner(query, fromTelegramId))) return

  const result = await confirmOrderTransition(orderId, fromTelegramId)
  if (!result.ok) {
    await answerCallbackQuery(query.id, `Could not confirm: ${result.error}`)
    return
  }

  await answerCallbackQuery(query.id, 'Order confirmed')

  const order = await getOrderWithRelations(orderId)
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
  await sendMessage(fromTelegramId, `Manage order #${orderId.slice(0, 8)}:`, {
    reply_markup: driverActionButtons(orderId),
  })

  const order = await getOrderWithRelations(orderId)
  if (order?.users?.telegram_id) {
    await sendMessage(
      order.users.telegram_id,
      `✅ Your order #${orderId.slice(0, 8)} has been confirmed. HAZE will personally deliver it.`
    )
  }
}

async function onTheWay(query: CallbackQuery, orderId: string, fromTelegramId: string) {
  const order = await getOrderWithRelations(orderId)
  if (!order || !isAuthorizedForOrder(order, fromTelegramId)) {
    await answerCallbackQuery(query.id, 'Only the assigned driver or owner can do that.')
    return
  }

  const result = await advanceStatus(orderId, 'on_the_way', fromTelegramId)
  if (!result.ok) {
    await answerCallbackQuery(query.id, `Could not update: ${result.error}`)
    return
  }

  await answerCallbackQuery(query.id, 'Marked on the way')
  if (order.users?.telegram_id) {
    await sendMessage(order.users.telegram_id, `🚗 Your order #${orderId.slice(0, 8)} is on the way!`)
  }
}

async function delivered(query: CallbackQuery, orderId: string, fromTelegramId: string) {
  const order = await getOrderWithRelations(orderId)
  if (!order || !isAuthorizedForOrder(order, fromTelegramId)) {
    await answerCallbackQuery(query.id, 'Only the assigned driver or owner can do that.')
    return
  }

  const result = await markDelivered(orderId, fromTelegramId)
  if (!result.ok) {
    await answerCallbackQuery(query.id, `Could not update: ${result.error}`)
    return
  }

  await answerCallbackQuery(query.id, 'Marked delivered')

  if (order.users?.telegram_id) {
    await sendMessage(order.users.telegram_id, `📦 Your order #${orderId.slice(0, 8)} has been delivered. Enjoy!`)
  }
  if (fromTelegramId !== OWNER_TELEGRAM_ID) {
    await sendMessage(OWNER_TELEGRAM_ID, `📦 Order #${orderId.slice(0, 8)} was delivered.`)
  }
}

async function startCancelFlow(query: CallbackQuery, orderId: string, fromTelegramId: string) {
  const order = await getOrderWithRelations(orderId)
  if (!order || !isAuthorizedForOrder(order, fromTelegramId)) {
    await answerCallbackQuery(query.id, 'Only the assigned driver or owner can do that.')
    return
  }
  if (order.status === 'delivered' || order.status === 'cancelled') {
    await answerCallbackQuery(query.id, `Order is already ${order.status}.`)
    return
  }

  await answerCallbackQuery(query.id)
  await sendMessage(fromTelegramId, `Please reply with the cancellation reason for order ${orderId}.`, {
    reply_markup: { force_reply: true },
  })
}
