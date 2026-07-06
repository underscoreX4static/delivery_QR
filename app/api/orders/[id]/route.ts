import { NextRequest, NextResponse } from 'next/server'
import { requireTelegramUser } from '@/lib/client-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const telegramUser = requireTelegramUser(request)
  if (!telegramUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('*, users!inner(telegram_id), order_items(*)')
    .eq('id', id)
    .single()

  if (error || !order || order.users.telegram_id !== telegramUser.telegram_id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  return NextResponse.json({ order })
}
