import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const body = await request.json().catch(() => null)

  const update: Record<string, unknown> = {}
  if (typeof body?.is_active === 'boolean') update.is_active = body.is_active
  if (typeof body?.label === 'string') update.label = body.label.trim() || null

  const { data: qrCode, error } = await supabaseAdmin
    .from('qr_codes')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !qrCode) return NextResponse.json({ error: 'Failed to update QR code' }, { status: 500 })
  return NextResponse.json({ qr_code: qrCode })
}
