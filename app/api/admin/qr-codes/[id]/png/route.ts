import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const { data: qrCode, error } = await supabaseAdmin.from('qr_codes').select('slug').eq('id', id).single()
  if (error || !qrCode) return NextResponse.json({ error: 'QR code not found' }, { status: 404 })

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
  const url = `https://t.me/${botUsername}?start=qr_${qrCode.slug}`

  const buffer = await QRCode.toBuffer(url, { type: 'png', width: 512, margin: 2 })

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="qr-${qrCode.slug}.png"`,
    },
  })
}
