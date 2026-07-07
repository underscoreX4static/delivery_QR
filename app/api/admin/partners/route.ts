import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import type { Partner } from '@/types/index'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partners, error } = await supabaseAdmin
    .from('partners')
    .select('*')
    .order('name', { ascending: true })

  if (error || !partners) return NextResponse.json({ error: 'Failed to load partners' }, { status: 500 })

  const [{ data: commissions }, { data: qrCodes }] = await Promise.all([
    supabaseAdmin.from('affiliate_commissions').select('partner_id, commission_amount').eq('paid_out', false),
    supabaseAdmin.from('qr_codes').select('id, partner_id'),
  ])

  const owedByPartner = new Map<string, number>()
  for (const c of commissions ?? []) {
    owedByPartner.set(c.partner_id, (owedByPartner.get(c.partner_id) ?? 0) + c.commission_amount)
  }

  const partnerIdByQrCode = new Map((qrCodes ?? []).map((q) => [q.id, q.partner_id]))
  const qrIds = (qrCodes ?? []).map((q) => q.id)

  const { data: scans } = qrIds.length
    ? await supabaseAdmin.from('qr_scans').select('qr_code_id, user_id').in('qr_code_id', qrIds).not('user_id', 'is', null)
    : { data: [] as { qr_code_id: string; user_id: string }[] }

  const uniqueUsersByPartner = new Map<string, Set<string>>()
  for (const scan of scans ?? []) {
    const partnerId = partnerIdByQrCode.get(scan.qr_code_id)
    if (!partnerId) continue
    const set = uniqueUsersByPartner.get(partnerId) ?? new Set<string>()
    set.add(scan.user_id)
    uniqueUsersByPartner.set(partnerId, set)
  }

  const result = (partners as Partner[]).map((p) => ({
    ...p,
    commission_owed: Math.round((owedByPartner.get(p.id) ?? 0) * 100) / 100,
    unique_customers_scanned: uniqueUsersByPartner.get(p.id)?.size ?? 0,
  }))

  return NextResponse.json({ partners: result })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const commissionRate = Number(body?.commission_rate ?? 0)
  const firstSaleBonusAmount = Number(body?.first_sale_bonus_amount ?? 10)
  const welcomeBonusTriggerOrders = [1, 2, 3].includes(Number(body?.welcome_bonus_trigger_orders))
    ? Number(body.welcome_bonus_trigger_orders)
    : 1

  const { data: partner, error } = await supabaseAdmin
    .from('partners')
    .insert({
      name,
      address: body?.address || null,
      contact_name: body?.contact_name || null,
      contact_phone: body?.contact_phone || null,
      commission_rate: commissionRate,
      first_sale_bonus_amount: firstSaleBonusAmount,
      welcome_bonus_trigger_orders: welcomeBonusTriggerOrders,
    })
    .select('*')
    .single()

  if (error || !partner) return NextResponse.json({ error: 'Failed to create partner' }, { status: 500 })
  return NextResponse.json({ partner })
}
