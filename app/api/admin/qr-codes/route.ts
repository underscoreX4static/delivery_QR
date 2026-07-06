import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import type { QrCode } from '@/types/index'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: qrCodes, error } = await supabaseAdmin
    .from('qr_codes')
    .select('*, partners(name)')
    .order('created_at', { ascending: false })

  if (error || !qrCodes) return NextResponse.json({ error: 'Failed to load QR codes' }, { status: 500 })

  const withStats = await Promise.all(
    (qrCodes as (QrCode & { partners: { name: string } | null })[]).map(async (qr) => {
      const [{ data: scans }, { count: orderCount }] = await Promise.all([
        supabaseAdmin.from('qr_scans').select('user_id').eq('qr_code_id', qr.id),
        supabaseAdmin.from('orders').select('id', { count: 'exact', head: true }).eq('qr_code_id', qr.id),
      ])

      const totalScans = scans?.length ?? 0
      const uniqueUsers = new Set((scans ?? []).map((s) => s.user_id).filter(Boolean)).size
      const ordersGenerated = orderCount ?? 0
      const conversionRate = totalScans > 0 ? ordersGenerated / totalScans : 0

      return {
        ...qr,
        total_scans: totalScans,
        unique_users: uniqueUsers,
        orders_generated: ordersGenerated,
        conversion_rate: conversionRate,
      }
    })
  )

  return NextResponse.json({ qr_codes: withStats })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const partnerId = typeof body?.partner_id === 'string' ? body.partner_id : ''
  const label = typeof body?.label === 'string' ? body.label.trim() || null : null

  if (!partnerId) return NextResponse.json({ error: 'partner_id is required' }, { status: 400 })

  const slug = nanoid(10)

  const { data: qrCode, error } = await supabaseAdmin
    .from('qr_codes')
    .insert({ partner_id: partnerId, slug, label })
    .select('*')
    .single()

  if (error || !qrCode) return NextResponse.json({ error: 'Failed to create QR code' }, { status: 500 })
  return NextResponse.json({ qr_code: qrCode })
}
