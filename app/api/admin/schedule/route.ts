import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getBrisbaneHourAndWeekday } from '@/lib/store-hours'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('created_at')
    .gte('created_at', since.toISOString())

  // heatmap[weekday][hour] = count, weekday 0=Sunday .. 6=Saturday
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  const byHour = Array(24).fill(0)
  const byWeekday = Array(7).fill(0)

  for (const order of orders ?? []) {
    const { hour, weekday } = getBrisbaneHourAndWeekday(order.created_at)
    heatmap[weekday][hour]++
    byHour[hour]++
    byWeekday[weekday]++
  }

  return NextResponse.json({ heatmap, by_hour: byHour, by_weekday: byWeekday, total: orders?.length ?? 0 })
}
