import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

// is_owner is intentionally not editable here — there must always be exactly
// one owner driver (seeded at telegram_id 8376671012), so it's read-only in
// the admin UI to avoid accidentally creating a second one or clearing it.
const ALLOWED_FIELDS = ['first_name', 'last_name', 'telegram_id', 'is_active']

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

  const { data: driver, error } = await supabaseAdmin
    .from('drivers')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !driver) return NextResponse.json({ error: 'Failed to update driver' }, { status: 500 })
  return NextResponse.json({ driver })
}
