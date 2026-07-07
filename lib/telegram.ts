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
 * Escapes legacy Telegram Markdown's special characters (parse_mode:
 * 'Markdown', not MarkdownV2) in untrusted text — e.g. a commercial's own
 * name — before interpolating it into a formatted message. Without this, a
 * name containing `_`, `*`, `` ` `` or `[` breaks the intended formatting or
 * can fail the send outright.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*`[])/g, '\\$1')
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

/**
 * Uploads an image buffer directly to Telegram (multipart/form-data) rather
 * than requiring a public URL — used for QR codes generated on the fly,
 * which have nowhere to be hosted.
 */
export async function sendPhoto(chatId: string | number, photo: Buffer, caption?: string) {
  const form = new FormData()
  form.append('chat_id', String(chatId))
  if (caption) form.append('caption', caption)
  form.append('photo', new Blob([new Uint8Array(photo)], { type: 'image/png' }), 'qr.png')

  const res = await fetch(`${API_BASE}/sendPhoto`, { method: 'POST', body: form })
  const data = await res.json()
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram API sendPhoto failed: ${data.description ?? res.statusText}`)
  }
  return data.result
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

/**
 * The default command menu, visible to every user regardless of role.
 * Role-specific commands (/orders for drivers, /mystats for commercials,
 * /mybonus for drivers) are added per-chat via Telegram's chat-scoped
 * command menus instead, so regular customers never see commands meant for
 * someone else. Not called automatically anywhere — Telegram remembers this
 * server-side once set, so it only needs to run again if the default set
 * changes (re-run manually, or via a one-off script).
 */
export async function setDefaultCommands() {
  return telegramRequest('setMyCommands', {
    commands: [
      { command: 'start', description: 'Start ordering' },
      { command: 'invite', description: 'Invite a friend, you both get credit' },
    ],
  })
}

async function setChatCommands(chatId: string | number, commands: { command: string; description: string }[]) {
  return telegramRequest('setMyCommands', { scope: { type: 'chat', chat_id: chatId }, commands })
}

async function clearChatCommands(chatId: string | number) {
  return telegramRequest('deleteMyCommands', { scope: { type: 'chat', chat_id: chatId } })
}

export async function setCommercialCommands(chatId: string | number) {
  return setChatCommands(chatId, [
    { command: 'start', description: 'Start ordering' },
    { command: 'mystats', description: 'View your referral stats' },
  ])
}

export async function clearCommercialCommands(chatId: string | number) {
  return clearChatCommands(chatId)
}

export async function setDriverCommands(chatId: string | number) {
  return setChatCommands(chatId, [
    { command: 'start', description: 'Start ordering' },
    { command: 'orders', description: 'View available orders' },
    { command: 'mybonus', description: 'View your milestone bonus progress' },
  ])
}

export async function clearDriverCommands(chatId: string | number) {
  return clearChatCommands(chatId)
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

export function arrivedButton(orderId: string): InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: '📍 I’ve arrived', callback_data: `driver_arrived:${orderId}` }]] }
}

export async function sendNewOrderNotification(orderId: string, summary: string) {
  await notifyOwner(`🆕 New order #${orderId.slice(0, 8)}\n\n${summary}`, orderActionButtons(orderId))
}

/**
 * Shared by both the Telegram bot's "On the way" button and the admin
 * dashboard's "Mark on the way" action, so the driver always gets asked for
 * an ETA regardless of which surface triggered the status change.
 */
export async function sendOnTheWayNotifications(
  customerTelegramId: string | null,
  driverTelegramId: string | null,
  orderId: string
) {
  if (customerTelegramId) {
    await sendMessage(customerTelegramId, `🚗 Your driver is on the way!\nThey'll confirm the ETA shortly.`)
  }

  if (driverTelegramId) {
    await sendMessage(driverTelegramId, '⏱️ How many minutes until delivery?', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '10 min', callback_data: `eta:${orderId}:10` },
            { text: '15 min', callback_data: `eta:${orderId}:15` },
            { text: '20 min', callback_data: `eta:${orderId}:20` },
            { text: '30 min', callback_data: `eta:${orderId}:30` },
          ],
          [{ text: 'Custom…', callback_data: `eta_custom:${orderId}` }],
        ],
      },
    })
  }
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

    // A valid signature only proves Telegram issued this initData at some
    // point — not that it's still the current session. Without an expiry, a
    // captured initData (proxy logs, a compromised device) would let someone
    // impersonate that customer forever. The Mini App gets a fresh initData
    // every time it's opened from Telegram, so legitimate use is unaffected.
    const authDate = Number(params.get('auth_date'))
    const MAX_AGE_SECONDS = 24 * 60 * 60
    if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return null

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
