import { NextRequest, NextResponse } from 'next/server'
import type { Message, Update } from 'node-telegram-bot-api'
import { supabaseAdmin } from '@/lib/supabase'
import { sendMessage, sendOrderButton } from '@/lib/telegram'
import { handleCallbackQuery, handleReplyMessage } from '@/lib/telegram-callbacks'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const update: Update = await request.json()

  try {
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query)
    } else if (update.message?.text?.startsWith('/')) {
      await handleCommand(update.message)
    } else if (update.message?.text && update.message.reply_to_message) {
      await handleReplyMessage(update.message)
    }
  } catch (err) {
    console.error('telegram webhook error', err)
    await reportErrorToOwner(err)
  }

  // Always return 200 immediately so Telegram doesn't retry the update.
  return NextResponse.json({ ok: true })
}

/**
 * Reports webhook handler errors to the owner so failures never go
 * completely silent (the webhook always returns 200 to Telegram regardless,
 * so Telegram's own delivery diagnostics never show these). Uses a direct
 * fetch rather than lib/telegram.ts so a bug there can't also swallow this.
 */
async function reportErrorToOwner(err: unknown) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN!
    const text = `⚠️ Webhook error:\n${err instanceof Error ? `${err.message}\n${err.stack?.slice(0, 500)}` : String(err)}`
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: '8376671012', text }),
    })
  } catch {
    // last resort — nothing more we can do here
  }
}

async function handleCommand(message: Message) {
  const text = message.text ?? ''
  const [command, ...rest] = text.trim().split(/\s+/)
  const payload = rest.join(' ')

  if (command === '/start') {
    await handleStart(message, payload)
  } else if (command === '/orders') {
    await handleDriverOrders(message)
  } else if (command === '/mystats') {
    await handleMyStats(message)
  }
}

async function handleStart(message: Message, payload: string) {
  const chatId = message.chat.id
  const telegramId = String(message.from!.id)
  const firstName = message.from?.first_name ?? null
  const lastName = message.from?.last_name ?? null

  let qrSlug: string | null = null
  let qrCodeId: string | null = null

  if (payload.startsWith('qr_')) {
    qrSlug = payload.slice(3)
    const { data: qrCode } = await supabaseAdmin
      .from('qr_codes')
      .select('id, is_active')
      .eq('slug', qrSlug)
      .maybeSingle()

    if (qrCode?.is_active) qrCodeId = qrCode.id
  }

  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('telegram_id', telegramId)
    .maybeSingle()

  let userId: string

  if (existingUser) {
    userId = existingUser.id
  } else {
    const { data: newUser, error } = await supabaseAdmin
      .from('users')
      .insert({
        telegram_id: telegramId,
        first_name: firstName,
        last_name: lastName,
        first_qr_source: qrCodeId,
      })
      .select('id')
      .single()

    if (error || !newUser) {
      console.error('failed to create user', error)
      await sendMessage(chatId, 'Something went wrong, please try again.')
      return
    }
    userId = newUser.id
  }

  if (qrCodeId) {
    await supabaseAdmin.from('qr_scans').insert({
      qr_code_id: qrCodeId,
      user_id: userId,
      telegram_user_id: telegramId,
    })
  }

  await sendOrderButton(chatId, qrSlug ?? undefined)
}

async function handleDriverOrders(message: Message) {
  const chatId = message.chat.id
  const telegramId = String(message.from!.id)

  const { data: driver } = await supabaseAdmin
    .from('drivers')
    .select('id, is_active')
    .eq('telegram_id', telegramId)
    .maybeSingle()

  if (!driver || !driver.is_active) {
    await sendMessage(chatId, 'This command is for active drivers only.')
    return
  }

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, delivery_address, total, created_at')
    .eq('status', 'confirmed')
    .is('driver_id', null)
    .order('created_at', { ascending: true })

  if (!orders || orders.length === 0) {
    await sendMessage(chatId, 'No unassigned confirmed orders right now.')
    return
  }

  const lines = orders.map(
    (o) => `#${o.id.slice(0, 8)} — $${o.total} — ${o.delivery_address}`
  )
  await sendMessage(chatId, `Unassigned confirmed orders:\n\n${lines.join('\n')}`)
}

/** Self-serve referral stats for commercials — matched by partners.telegram_id. */
async function handleMyStats(message: Message) {
  const chatId = message.chat.id
  const telegramId = String(message.from!.id)

  const { data: partner } = await supabaseAdmin
    .from('partners')
    .select('id, name, commission_rate')
    .eq('telegram_id', telegramId)
    .maybeSingle()

  if (!partner) {
    await sendMessage(chatId, "❌ You're not registered as a commercial. Contact HAZE to get set up.")
    return
  }

  const { data: qrCodes } = await supabaseAdmin.from('qr_codes').select('id').eq('partner_id', partner.id)
  const qrIds = (qrCodes ?? []).map((q) => q.id)

  const [{ count: totalScans }, { data: uniqueScanUsers }, { data: orders }, { data: commissions }] =
    await Promise.all([
      qrIds.length
        ? supabaseAdmin.from('qr_scans').select('*', { count: 'exact', head: true }).in('qr_code_id', qrIds)
        : Promise.resolve({ count: 0 }),
      qrIds.length
        ? supabaseAdmin.from('qr_scans').select('user_id').in('qr_code_id', qrIds).not('user_id', 'is', null)
        : Promise.resolve({ data: [] as { user_id: string }[] }),
      qrIds.length
        ? supabaseAdmin.from('orders').select('total').in('qr_code_id', qrIds).eq('status', 'delivered')
        : Promise.resolve({ data: [] as { total: number }[] }),
      supabaseAdmin.from('affiliate_commissions').select('commission_amount, paid_out').eq('partner_id', partner.id),
    ])

  const uniqueUserCount = new Set((uniqueScanUsers ?? []).map((u) => u.user_id)).size
  const totalOrders = orders?.length ?? 0
  const totalRevenue = (orders ?? []).reduce((sum, o) => sum + Number(o.total), 0)

  const totalEarned = (commissions ?? []).reduce((sum, c) => sum + Number(c.commission_amount), 0)
  const totalPaid = (commissions ?? [])
    .filter((c) => c.paid_out)
    .reduce((sum, c) => sum + Number(c.commission_amount), 0)
  const pending = totalEarned - totalPaid

  const msg = `
📊 *Your stats — HAZE Delivery*

👋 Hey ${partner.name}!

🔗 *Scans:* ${totalScans ?? 0} total, ${uniqueUserCount} unique users
🛒 *Orders generated:* ${totalOrders}
💰 *Revenue brought:* $${totalRevenue.toFixed(2)}
📈 *Your commission rate:* ${(partner.commission_rate * 100).toFixed(1)}%

💵 *Total earned:* $${totalEarned.toFixed(2)}
✅ *Paid out:* $${totalPaid.toFixed(2)}
⏳ *Pending:* $${pending.toFixed(2)}

Keep spreading! 🔥
  `.trim()

  await sendMessage(chatId, msg, { parse_mode: 'Markdown' })
}
