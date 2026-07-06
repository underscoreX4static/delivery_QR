import { NextRequest, NextResponse } from 'next/server'
import { requireTelegramUser } from '@/lib/client-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { notifyOwner, sendMessage } from '@/lib/telegram'

async function verifyOwnership(orderId: string, telegramId: string) {
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, driver_id, users!inner(telegram_id), drivers(telegram_id)')
    .eq('id', orderId)
    .single()

  if (!order || (order.users as unknown as { telegram_id: string }).telegram_id !== telegramId) return null
  return order
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const telegramUser = requireTelegramUser(request)
  if (!telegramUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId } = await context.params
  const order = await verifyOwnership(orderId, telegramUser.telegram_id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const { data: messages, error } = await supabaseAdmin
    .from('order_messages')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  return NextResponse.json({ messages })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const telegramUser = requireTelegramUser(request)
  if (!telegramUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId } = await context.params
  const order = await verifyOwnership(orderId, telegramUser.telegram_id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })

  const { data: message, error } = await supabaseAdmin
    .from('order_messages')
    .insert({ order_id: orderId, sender_role: 'customer', sender_id: telegramUser.telegram_id, content })
    .select('*')
    .single()

  if (error || !message) return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })

  const preview = `💬 New message on order #${orderId.slice(0, 8)}: ${content}`
  await notifyOwner(preview)
  const driverTelegramId = (order.drivers as unknown as { telegram_id: string } | null)?.telegram_id
  if (driverTelegramId) await sendMessage(driverTelegramId, preview)

  return NextResponse.json({ message })
}
