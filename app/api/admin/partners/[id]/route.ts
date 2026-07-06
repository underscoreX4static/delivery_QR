import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

const ALLOWED_FIELDS = ['name', 'address', 'contact_name', 'contact_phone', 'commission_rate', 'is_active']

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const update: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (key in body) update[key] = body[key]
  }

  const { data: partner, error } = await supabaseAdmin
    .from('partners')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !partner) return NextResponse.json({ error: 'Failed to update partner' }, { status: 500 })
  return NextResponse.json({ partner })
}
