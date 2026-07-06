import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateUser, requireTelegramUser } from '@/lib/client-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const telegramUser = requireTelegramUser(request)
  if (!telegramUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getOrCreateUser(telegramUser)
    return NextResponse.json({
      user,
      needs_onboarding: !user.phone || !user.default_address,
    })
  } catch (err) {
    console.error('client/me GET error', err)
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const telegramUser = requireTelegramUser(request)
  if (!telegramUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : null
  const defaultAddress = typeof body?.default_address === 'string' ? body.default_address.trim() : null

  if (!phone || !defaultAddress) {
    return NextResponse.json({ error: 'phone and default_address are required' }, { status: 400 })
  }

  try {
    const user = await getOrCreateUser(telegramUser)
    const { data: updated, error } = await supabaseAdmin
      .from('users')
      .update({ phone, default_address: defaultAddress })
      .eq('id', user.id)
      .select('*')
      .single()

    if (error || !updated) throw new Error(error?.message)

    return NextResponse.json({ user: updated })
  } catch (err) {
    console.error('client/me POST error', err)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
