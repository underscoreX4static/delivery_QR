import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import type { Order, User } from '@/types/index'

export type LoyaltyTier = 'new' | 'regular' | 'vip' | 'diamond'

function loyaltyTier(orderCount: number): LoyaltyTier {
  if (orderCount >= 11) return 'diamond'
  if (orderCount >= 6) return 'vip'
  if (orderCount >= 2) return 'regular'
  return 'new'
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: users, error: usersError } = await supabaseAdmin.from('users').select('*')
  if (usersError || !users) return NextResponse.json({ error: 'Failed to load customers' }, { status: 500 })

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('user_id, total, status, created_at')

  const { data: qrCodes } = await supabaseAdmin.from('qr_codes').select('id, partner_id')
  const { data: partners } = await supabaseAdmin.from('partners').select('id, name')

  const partnerNameById = new Map((partners ?? []).map((p) => [p.id, p.name]))
  const partnerIdByQrCode = new Map((qrCodes ?? []).map((q) => [q.id, q.partner_id]))

  const statsByUser = new Map<string, { orderCount: number; totalSpent: number; lastOrderAt: string | null }>()
  for (const order of (orders ?? []) as Pick<Order, 'user_id' | 'total' | 'status' | 'created_at'>[]) {
    const stat = statsByUser.get(order.user_id) ?? { orderCount: 0, totalSpent: 0, lastOrderAt: null }
    if (order.status === 'delivered') {
      stat.orderCount += 1
      stat.totalSpent += order.total
    }
    if (!stat.lastOrderAt || order.created_at > stat.lastOrderAt) stat.lastOrderAt = order.created_at
    statsByUser.set(order.user_id, stat)
  }

  const customers = (users as User[]).map((user) => {
    const stat = statsByUser.get(user.id) ?? { orderCount: 0, totalSpent: 0, lastOrderAt: null }
    const partnerId = user.first_qr_source ? partnerIdByQrCode.get(user.first_qr_source) : null
    return {
      ...user,
      order_count: stat.orderCount,
      total_spent: Math.round(stat.totalSpent * 100) / 100,
      last_order_at: stat.lastOrderAt,
      qr_source_name: partnerId ? partnerNameById.get(partnerId) ?? null : null,
      loyalty_tier: loyaltyTier(stat.orderCount),
    }
  })

  customers.sort((a, b) => b.total_spent - a.total_spent)

  return NextResponse.json({ customers })
}
