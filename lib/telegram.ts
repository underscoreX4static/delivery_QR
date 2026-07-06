import crypto from 'crypto'
import TelegramBot, { InlineKeyboardMarkup } from 'node-telegram-bot-api'

type SendMessageOptions = NonNullable<Parameters<InstanceType<typeof TelegramBot>['sendMessage']>[2]>

const token = process.env.TELEGRAM_BOT_TOKEN!

// polling/webHook both false — this instance is only ever used to call the
// HTTP API directly (sendMessage, answerCallbackQuery, ...). The actual
// webhook is handled by app/api/telegram/route.ts.
export const bot = new TelegramBot(token, { polling: false })

export const OWNER_TELEGRAM_ID = '8376671012'

export async function sendMessage(
  chatId: string | number,
  text: string,
  options?: SendMessageOptions
) {
  return bot.sendMessage(chatId, text, options)
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return bot.answerCallbackQuery(callbackQueryId, text ? { text } : undefined)
}

export async function editMessageReplyMarkup(
  chatId: string | number,
  messageId: number,
  replyMarkup?: InlineKeyboardMarkup
) {
  return bot.editMessageReplyMarkup(replyMarkup ?? { inline_keyboard: [] }, {
    chat_id: chatId,
    message_id: messageId,
  })
}

export async function notifyOwner(text: string, replyMarkup?: InlineKeyboardMarkup) {
  return sendMessage(OWNER_TELEGRAM_ID, text, replyMarkup ? { reply_markup: replyMarkup } : undefined)
}

/** Sends the "Open HAZE Delivery" Mini App launch button to a customer chat. */
export async function sendOrderButton(chatId: string | number, qrSlug?: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
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

export function driverActionButtons(orderId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
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
