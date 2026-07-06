import crypto from 'crypto'
import type { InlineKeyboardMarkup } from 'node-telegram-bot-api'
import { getAppUrl } from '@/lib/env'

const token = process.env.TELEGRAM_BOT_TOKEN!
const API_BASE = `https://api.telegram.org/bot${token}`

export const OWNER_TELEGRAM_ID = '8376671012'

interface SendMessageOptions {
  reply_markup?: InlineKeyboardMarkup | { force_reply: true }
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML'
}

/**
 * Thin fetch wrapper around the Telegram Bot HTTP API. Deliberately avoids
 * the node-telegram-bot-api client library — it shells out to the long-
 * deprecated `request` package, which fails silently in some serverless
 * Node runtimes (confirmed in production: sendMessage calls never reached
 * Telegram even though the surrounding handler completed without error).
 */
async function telegramRequest<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  const data = await res.json()
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram API ${method} failed: ${data.description ?? res.statusText}`)
  }
  return data.result as T
}

export async function sendMessage(chatId: string | number, text: string, options?: SendMessageOptions) {
  return telegramRequest('sendMessage', { chat_id: chatId, text, ...options })
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return telegramRequest('answerCallbackQuery', { callback_query_id: callbackQueryId, text })
}

export async function editMessageReplyMarkup(
  chatId: string | number,
  messageId: number,
  replyMarkup?: InlineKeyboardMarkup
) {
  return telegramRequest('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup ?? { inline_keyboard: [] },
  })
}

export async function notifyOwner(text: string, replyMarkup?: InlineKeyboardMarkup) {
  return sendMessage(OWNER_TELEGRAM_ID, text, replyMarkup ? { reply_markup: replyMarkup } : undefined)
}

/** Sends the "Open HAZE Delivery" Mini App launch button to a customer chat. */
export async function sendOrderButton(chatId: string | number, qrSlug?: string) {
  const appUrl = getAppUrl()
  const url = qrSlug ? `${appUrl}/order?qr=${encodeURIComponent(qrSlug)}` : `${appUrl}/order`

  return sendMessage(chatId, 'Welcome to HAZE Delivery 🛵\nTap below to browse the catalogue.', {
    reply_markup: {
      inline_keyboard: [[{ text: '🛒 Open HAZE Delivery', web_app: { url } }]],
    },
  })
}

export function orderActionButtons(orderId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Confirm', callback_data: `confirm_order:${orderId}` },
        { text: '🙋 I’ll handle it', callback_data: `self_handle:${orderId}` },
      ],
      [{ text: '❌ Cancel', callback_data: `cancel_order:${orderId}` }],
    ],
  }
}

export function driverActionButtons(orderId: string, deliveryAddress?: string): InlineKeyboardMarkup {
  const wazeRow = deliveryAddress
    ? [{ text: '🗺️ Open in Waze', url: `https://waze.com/ul?q=${encodeURIComponent(deliveryAddress)}&navigate=yes` }]
    : null

  return {
    inline_keyboard: [
      ...(wazeRow ? [wazeRow] : []),
      [{ text: '🚗 On the way', callback_data: `on_the_way:${orderId}` }],
      [{ text: '📦 Delivered', callback_data: `delivered:${orderId}` }],
      [{ text: '❌ Cancel', callback_data: `cancel_order:${orderId}` }],
    ],
  }
}

export async function sendNewOrderNotification(orderId: string, summary: string) {
  await notifyOwner(`🆕 New order #${orderId.slice(0, 8)}\n\n${summary}`, orderActionButtons(orderId))
}

/**
 * Validates the `initData` string passed by the Telegram Mini App client per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Returns the parsed user info if the signature checks out, otherwise null.
 */
export function validateTelegramInitData(
  initData: string
): { telegram_id: string; first_name: string; last_name: string | null } | null {
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return null
    params.delete('hash')

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest()
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    if (computedHash !== hash) return null

    const userJson = params.get('user')
    if (!userJson) return null
    const user = JSON.parse(userJson)

    return {
      telegram_id: String(user.id),
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
    }
  } catch {
    return null
  }
}
