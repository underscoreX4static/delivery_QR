import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: categories, error } = await supabaseAdmin
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 })
  return NextResponse.json({ categories })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data: category, error } = await supabaseAdmin
    .from('categories')
    .insert({ name, image_url: body?.image_url ?? null, sort_order: body?.sort_order ?? 0 })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  return NextResponse.json({ category })
}
