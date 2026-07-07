import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateUser, requireTelegramUser } from '@/lib/client-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { planConsumption, validateCartItems } from '@/lib/inventory'
import { calculateOrderPricing } from '@/lib/calculations'
import { getSettings } from '@/lib/settings'
import { getSlotSettings, isStoreOpenNow, normalizeSlotIso } from '@/lib/slots'
import { isAddressInDeliveryZone } from '@/lib/zones'
import { sendMessage, sendNewOrderNotification } from '@/lib/telegram'

const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'on_the_way']
const MAX_ACTIVE_ORDERS_PER_USER = 3

export async function GET(request: NextRequest) {
  const telegramUser = requireTelegramUser(request)
  if (!telegramUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await getOrCreateUser(telegramUser)

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })

  return NextResponse.json({ orders })
}

export async function POST(request: NextRequest) {
  const telegramUser = requireTelegramUser(request)
  if (!telegramUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const items = validateCartItems(body?.items)
  const deliveryAddress = typeof body?.delivery_address === 'string' ? body.delivery_address.trim() : ''
  const scheduledAt = typeof body?.scheduled_at === 'string' ? normalizeSlotIso(body.scheduled_at) : null
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : null
  const qrSlug = typeof body?.qr_slug === 'string' ? body.qr_slug : null
  const confirmedCod = body?.confirmed_cod === true

  if (!items) return NextResponse.json({ error: 'Cart is empty or invalid' }, { status: 400 })
  if (!deliveryAddress) return NextResponse.json({ error: 'Delivery address is required' }, { status: 400 })
  if (!confirmedCod) {
    return NextResponse.json({ error: 'Cash-on-delivery must be confirmed' }, { status: 400 })
  }

  // Postcode validated SERVER-SIDE only — never trust the client for this.
  if (!isAddressInDeliveryZone(deliveryAddress)) {
    return NextResponse.json(
      { error: 'Sorry, we do not deliver to that address. We cover Brisbane CBD and inner suburbs only.' },
      { status: 400 }
    )
  }

  const settings = await getSettings()
  const slotSettings = await getSlotSettings()

  if (!scheduledAt && !isStoreOpenNow(slotSettings)) {
    return NextResponse.json(
      { error: 'Store is currently closed — please pick a scheduled time slot' },
      { status: 400 }
    )
  }

  try {
    const user = await getOrCreateUser(telegramUser)

    // Caps a single customer's in-flight orders — without this, a confused
    // customer double-tapping checkout (or a stolen/replayed initData, see
    // the auth_date expiry above) can spam the owner's Telegram with
    // duplicate order notifications and, for scheduled orders, occupy every
    // remaining slot for the day.
    const { count: activeOrderCount } = await supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ACTIVE_ORDER_STATUSES)

    if ((activeOrderCount ?? 0) >= MAX_ACTIVE_ORDERS_PER_USER) {
      return NextResponse.json(
        { error: 'You already have several orders in progress — please wait for one to complete before placing another.' },
        { status: 429 }
      )
    }

    let qrCodeId: string | null = null
    if (qrSlug) {
      const { data: qrCode } = await supabaseAdmin
        .from('qr_codes')
        .select('id, is_active')
        .eq('slug', qrSlug)
        .maybeSingle()
      if (qrCode?.is_active) qrCodeId = qrCode.id
    }

    const plan = await planConsumption(items)

    if (plan.insufficient_stock.length > 0) {
      return NextResponse.json(
        {
          error: 'Some items no longer have enough stock',
          insufficient_stock: plan.insufficient_stock,
        },
        { status: 409 }
      )
    }

    // Anti-double-booking: re-verify the exact slot is still free right before
    // insert. Not fully atomic without a DB-level constraint (see the partial
    // unique index noted alongside this route), but this closes the window
    // that would otherwise let two customers both land on the same slot.
    if (scheduledAt) {
      const { count } = await supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('scheduled_at', scheduledAt)
        .not('status', 'eq', 'cancelled')

      if (count && count > 0) {
        return NextResponse.json(
          { error: 'That time slot was just taken — please pick another.' },
          { status: 409 }
        )
      }
    }

    const pricing = calculateOrderPricing(plan.subtotal, settings)

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id: user.id,
        qr_code_id: qrCodeId,
        status: 'pending',
        delivery_address: deliveryAddress,
        delivery_fee: pricing.deliveryFee,
        subtotal: pricing.subtotal,
        discount: pricing.discount,
        total: pricing.total,
        notes,
        scheduled_at: scheduledAt,
      })
      .select('*')
      .single()

    if (orderError?.code === '23505') {
      // Belt-and-suspenders: the app-level check above closes almost all of
      // the race window, but the DB's partial unique index on
      // (scheduled_at) WHERE status <> 'cancelled' is the actual guarantee —
      // this is what catches the rare case where two requests passed that
      // check at the same instant.
      return NextResponse.json(
        { error: 'That time slot was just taken — please pick another.' },
        { status: 409 }
      )
    }

    if (orderError || !order) throw new Error(orderError?.message ?? 'Order insert failed')

    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(
      plan.items.map((line) => ({
        order_id: order.id,
        product_id: line.product_id,
        batch_id: line.batch_id,
        quantity: line.quantity,
        unit_sell_price: line.unit_sell_price,
        unit_cost_price: line.unit_cost_price,
        line_total: line.line_total,
      }))
    )

    if (itemsError) throw new Error(itemsError.message)

    await supabaseAdmin.from('order_status_history').insert({
      order_id: order.id,
      status: 'pending',
      changed_by: telegramUser.telegram_id,
    })

    const summary = [
      `Customer: ${user.first_name ?? 'Unknown'} (${user.telegram_id})`,
      `Address: ${deliveryAddress}`,
      `Subtotal: $${pricing.subtotal.toFixed(2)} · Delivery: $${pricing.deliveryFee.toFixed(2)} · Discount: $${pricing.discount.toFixed(2)}`,
      `Total: $${pricing.total.toFixed(2)}`,
      scheduledAt ? `Scheduled: ${scheduledAt}` : 'ASAP',
    ].join('\n')

    await sendNewOrderNotification(order.id, summary)
    await sendMessage(
      telegramUser.telegram_id,
      `✅ Your order #${order.id.slice(0, 8)} has been received!\nWe'll confirm it in just a moment.`
    )

    return NextResponse.json({ order })
  } catch (err) {
    console.error('order creation error', err)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}
