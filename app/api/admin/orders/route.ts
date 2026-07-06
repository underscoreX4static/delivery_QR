import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select(
      '*, users(first_name, last_name, phone, telegram_id), drivers(id, first_name, last_name), order_items(*)'
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })

  return NextResponse.json({ orders })
}
