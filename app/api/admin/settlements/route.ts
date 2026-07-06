import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { createDriverSettlement, createPartnerSettlement, parsePartnerIdFromNotes } from '@/lib/settlements'
import type { Settlement } from '@/types/index'

type CreateBody =
  | { type: 'driver'; driver_id: string }
  | { type: 'partner'; partner_id: string; period_start: string; period_end: string }

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: settlements, error } = await supabaseAdmin
    .from('settlements')
    .select('*, drivers(first_name, last_name)')
    .order('proposed_at', { ascending: false })

  if (error || !settlements) return NextResponse.json({ error: 'Failed to load settlements' }, { status: 500 })

  const partnerIds = (settlements as Settlement[])
    .map((s) => parsePartnerIdFromNotes(s.notes))
    .filter((id): id is string => Boolean(id))

  const { data: partners } = partnerIds.length
    ? await supabaseAdmin.from('partners').select('id, name').in('id', partnerIds)
    : { data: [] }

  const partnerNameById = new Map((partners ?? []).map((p) => [p.id, p.name]))

  const result = settlements.map((s: Settlement) => {
    const partnerId = parsePartnerIdFromNotes(s.notes)
    return { ...s, partner_name: partnerId ? partnerNameById.get(partnerId) ?? null : null }
  })

  return NextResponse.json({ settlements: result })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as CreateBody | null
  if (!body?.type) return NextResponse.json({ error: 'Missing type' }, { status: 400 })

  const proposedBy = admin.email ?? admin.id

  const result =
    body.type === 'driver'
      ? await createDriverSettlement(body.driver_id, proposedBy)
      : await createPartnerSettlement(body.partner_id, body.period_start, body.period_end, proposedBy)

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ settlement: result.settlement })
}
