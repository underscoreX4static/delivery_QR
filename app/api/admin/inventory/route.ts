import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getInventoryDashboard } from '@/lib/inventory-intelligence'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await getInventoryDashboard()
  const { data: categories } = await supabaseAdmin.from('categories').select('id, name')

  const stats = {
    total_skus: rows.length,
    needing_restock: rows.filter((r) => r.status === 'restock').length,
    order_soon: rows.filter((r) => r.status === 'soon').length,
    ok: rows.filter((r) => r.status === 'ok').length,
  }

  return NextResponse.json({ rows, stats, categories: categories ?? [] })
}
