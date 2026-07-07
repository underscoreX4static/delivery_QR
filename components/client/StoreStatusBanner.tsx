'use client'

import { useEffect, useState } from 'react'
import { useTelegram } from '@/components/client/TelegramProvider'

interface StatusData {
  is_open: boolean
  next_open: string | null
  minutes_until_close: number | null
  minutes_until_open: number | null
  forced: 'open' | 'closed' | null
}

const FETCH_POLL_MS = 60_000

export function StoreStatusBanner() {
  const { apiFetch } = useTelegram()
  const [data, setData] = useState<StatusData | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      const res = await apiFetch(`/api/client/store-status?t=${Date.now()}`)
      const json = await res.json()
      if (cancelled) return
      const fetchTime = Date.now()
      setData(json)
      setFetchedAt(fetchTime)
      setNow(fetchTime)
    }
    poll()
    const interval = setInterval(poll, FETCH_POLL_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') poll()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [apiFetch])

  const hasCloseCountdown =
    !!data && !data.forced && data.is_open && data.minutes_until_close !== null && data.minutes_until_close <= 30
  const hasOpenCountdown =
    !!data && !data.forced && !data.is_open && data.minutes_until_open !== null && data.minutes_until_open <= 60
  const showsCountdown = hasCloseCountdown || hasOpenCountdown

  // Only ticks while a countdown is actually on screen — no point spending
  // CPU on a 1s interval once the store settles into a steady state.
  useEffect(() => {
    if (!showsCountdown) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [showsCountdown])

  if (!data || fetchedAt === null) return null

  const elapsedMinutes = Math.floor(((now ?? fetchedAt) - fetchedAt) / 60_000)

  if (data.forced === 'closed') {
    return <Banner tone="amber">We&apos;re closed right now.</Banner>
  }
  if (data.forced === 'open') return null

  if (data.is_open) {
    if (data.minutes_until_close === null || data.minutes_until_close > 30) return null
    const remaining = Math.max(0, data.minutes_until_close - elapsedMinutes)
    return (
      <Banner tone="orange">⏰ Closing soon — {remaining <= 0 ? 'closing now' : `${remaining} min left to order`}</Banner>
    )
  }

  if (data.minutes_until_open !== null && data.minutes_until_open <= 60) {
    const remaining = Math.max(0, data.minutes_until_open - elapsedMinutes)
    return <Banner tone="green">{remaining <= 0 ? '🟢 Opening now!' : `🟢 Opening soon — back in ${remaining} min`}</Banner>
  }

  return <Banner tone="amber">We&apos;re closed{data.next_open ? ` · opens ${data.next_open}` : ''}</Banner>
}

function Banner({ tone, children }: { tone: 'orange' | 'green' | 'amber'; children: React.ReactNode }) {
  const styles = {
    orange: 'bg-orange-50 text-orange-800',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-800',
  }[tone]

  return <div className={`px-4 py-2 text-center text-xs font-medium ${styles}`}>{children}</div>
}
