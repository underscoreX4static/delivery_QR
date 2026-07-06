import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const allowed = ['name', 'brand', 'subcategory', 'description', 'image_url', 'category_id', 'target_margin', 'is_active']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  const { data: product, error } = await supabaseAdmin
    .from('products')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !product) return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  return NextResponse.json({ product })
}
