import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { sendMessage } from '@/lib/telegram'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId } = await context.params
  const { data: messages, error } = await supabaseAdmin
    .from('order_messages')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  return NextResponse.json({ messages })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId } = await context.params
  const body = await request.json().catch(() => null)
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })

  const senderId = admin.email ?? admin.id

  const { data: message, error } = await supabaseAdmin
    .from('order_messages')
    .insert({ order_id: orderId, sender_role: 'owner', sender_id: senderId, content })
    .select('*')
    .single()

  if (error || !message) return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('users(telegram_id)')
    .eq('id', orderId)
    .single()

  const telegramId = (order?.users as unknown as { telegram_id: string } | null)?.telegram_id
  if (telegramId) await sendMessage(telegramId, `💬 Message about order #${orderId.slice(0, 8)}: ${content}`)

  return NextResponse.json({ message })
}
