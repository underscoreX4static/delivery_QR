import { NextRequest, NextResponse } from 'next/server'
import type { Message, Update } from 'node-telegram-bot-api'
import QRCode from 'qrcode'
import { supabaseAdmin } from '@/lib/supabase'
import { escapeMarkdown, sendMessage, sendOrderButton, sendPhoto } from '@/lib/telegram'
import { handleCallbackQuery, handleReplyMessage } from '@/lib/telegram-callbacks'
import { DRIVER_BONUS_MILESTONES } from '@/lib/calculations'
import { createPendingReferral, getOrCreateReferralCode } from '@/lib/referrals'
import { getSettings } from '@/lib/settings'

// Telegram redelivers an update if the webhook doesn't respond quickly
// enough — order-status transitions are idempotent against that already,
// but outbound notifications aren't, so a redelivery can send a customer the
// same "your order is on the way" message twice. Module-level state persists
// across warm invocations of the same serverless instance, which covers the
// timescale (seconds) Telegram actually redelivers on; a cold start losing
// this history is an acceptable degradation for what's a politeness fix, not
// a correctness one.
const MAX_TRACKED_UPDATE_IDS = 500
const processedUpdateIds = new Set<number>()

function alreadyProcessed(updateId: number): boolean {
  if (processedUpdateIds.has(updateId)) return true

  processedUpdateIds.add(updateId)
  if (processedUpdateIds.size > MAX_TRACKED_UPDATE_IDS) {
    const oldest = processedUpdateIds.values().next().value
    if (oldest !== undefined) processedUpdateIds.delete(oldest)
  }
  return false
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const update: Update = await request.json()

  if (alreadyProcessed(update.update_id)) {
    return NextResponse.json({ ok: true })
  }

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
  } else if (command === '/mybonus') {
    await handleMyBonus(message)
  } else if (command === '/invite') {
    await handleInvite(message)
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

  let referrerUserId: string | null = null
  if (payload.startsWith('ref_')) {
    const { data: referrer } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('referral_code', payload.slice(4))
      .maybeSingle()
    referrerUserId = referrer?.id ?? null
  }

  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('telegram_id', telegramId)
    .maybeSingle()

  let userId: string
  const isNewUser = !existingUser

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

  // Only a genuinely new signup can be referred — an existing customer
  // opening an old referral link again must not retroactively attach a
  // referrer or spawn a duplicate pending review.
  if (isNewUser && referrerUserId) {
    await createPendingReferral(referrerUserId, userId).catch((err) => {
      console.error('Failed to create pending referral:', err)
    })
  }

  await sendOrderButton(chatId, qrSlug ?? undefined)
}

/** Self-serve referral link for customers — credit for both sides once HAZE approves the referral. */
async function handleInvite(message: Message) {
  const chatId = message.chat.id
  const telegramId = String(message.from!.id)

  const { data: user } = await supabaseAdmin.from('users').select('id').eq('telegram_id', telegramId).maybeSingle()
  if (!user) {
    await sendMessage(chatId, 'Open the app once first (tap the menu button) so we know who you are, then try /invite again.')
    return
  }

  const [code, settings] = await Promise.all([getOrCreateReferralCode(user.id), getSettings()])
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
  const link = `https://t.me/${botUsername}?start=ref_${code}`

  // A QR code is easier to actually use in person (show a friend your phone,
  // they scan it) than a text link they'd have to select and forward.
  const qrBuffer = await QRCode.toBuffer(link, { type: 'png', width: 512, margin: 2 })

  await sendPhoto(
    chatId,
    qrBuffer,
    `🎁 Invite a friend, you both get $${settings.referralRewardAmount.toFixed(2)}!\n\nHave them scan this, or share your link:\n${link}\n\nOnce they place their first order and HAZE approves it, you'll both get credited automatically.`
  )
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

/** Self-serve milestone bonus progress for drivers — matched by drivers.telegram_id. */
async function handleMyBonus(message: Message) {
  const chatId = message.chat.id
  const telegramId = String(message.from!.id)

  const { data: driver } = await supabaseAdmin
    .from('drivers')
    .select('id, first_name, bonus_pool_balance')
    .eq('telegram_id', telegramId)
    .maybeSingle()

  if (!driver) {
    await sendMessage(chatId, "❌ You're not registered as a driver. Contact HAZE to get set up.")
    return
  }

  const { count: deliveredCount } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('driver_id', driver.id)
    .eq('status', 'delivered')

  const lifetimeOrders = deliveredCount ?? 0
  const nextMilestone = DRIVER_BONUS_MILESTONES.find((m) => m.orders > lifetimeOrders) ?? null
  const progressLine = nextMilestone
    ? `🎯 *Next bonus:* ${lifetimeOrders}/${nextMilestone.orders} deliveries → $${nextMilestone.bonus.toFixed(2)}`
    : `🏆 All milestones reached!`

  const msg = `
📊 *Your bonus progress — HAZE Delivery*

👋 Hey ${escapeMarkdown(driver.first_name)}!

📦 *Deliveries made:* ${lifetimeOrders}
${progressLine}
💰 *Bonus pool balance:* $${(driver.bonus_pool_balance ?? 0).toFixed(2)}

Keep it up! 🚗
  `.trim()

  await sendMessage(chatId, msg, { parse_mode: 'Markdown' })
}

/** Self-serve referral stats for commercials — matched by partners.telegram_id. */
async function handleMyStats(message: Message) {
  const chatId = message.chat.id
  const telegramId = String(message.from!.id)

  const { data: partner } = await supabaseAdmin
    .from('partners')
    .select('id, name, commission_rate, first_sale_bonus_amount, first_sale_bonus_paid, welcome_bonus_trigger_orders')
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

  const bonusAmount = partner.first_sale_bonus_amount ?? 10
  const triggerOrders = partner.welcome_bonus_trigger_orders ?? 1
  const ord = triggerOrders === 1 ? '1st' : triggerOrders === 2 ? '2nd' : triggerOrders === 3 ? '3rd' : `${triggerOrders}th`
  const bonusSection =
    totalOrders < triggerOrders
      ? `\n🎁 *Welcome bonus:* $${bonusAmount.toFixed(2)} — unlocks on your ${ord} delivered order (${totalOrders}/${triggerOrders})\n`
      : partner.first_sale_bonus_paid
        ? `\n🎁 *Welcome bonus:* $${bonusAmount.toFixed(2)} — paid ✅\n`
        : `\n🎁 *Welcome bonus:* $${bonusAmount.toFixed(2)} — earned, awaiting payment\n`

  const msg = `
📊 *Your stats — HAZE Delivery*

👋 Hey ${escapeMarkdown(partner.name)}!

🔗 *Scans:* ${totalScans ?? 0} total, ${uniqueUserCount} unique users
🛒 *Orders generated:* ${totalOrders}
💰 *Revenue brought:* $${totalRevenue.toFixed(2)}
📈 *Your commission rate:* ${(partner.commission_rate * 100).toFixed(1)}%

💵 *Total earned:* $${totalEarned.toFixed(2)}
✅ *Paid out:* $${totalPaid.toFixed(2)}
⏳ *Pending:* $${pending.toFixed(2)}
${bonusSection}
Keep spreading! 🔥
  `.trim()

  await sendMessage(chatId, msg, { parse_mode: 'Markdown' })
}
