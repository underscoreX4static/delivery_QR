import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: drivers, error } = await supabaseAdmin
    .from('drivers')
    .select('*')
    .order('is_owner', { ascending: false })
    .order('first_name', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to load drivers' }, { status: 500 })

  return NextResponse.json({ drivers })
}
