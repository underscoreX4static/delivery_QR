'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTelegram } from '@/components/client/TelegramProvider'
import type { Order } from '@/types/index'

export function OrderConfirmation({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const { apiFetch } = useTelegram()
  const [order, setOrder] = useState<Order | null>(null)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      const res = await apiFetch(`/api/orders/${orderId}`)
      if (!res.ok || cancelled) return
      const data = await res.json()
      if (!cancelled) setOrder(data.order)
    }
    poll()
    const interval = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [orderId, apiFetch])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-4xl">✅</div>
      <h1 className="text-xl font-semibold">Order placed!</h1>
      <p className="text-sm text-neutral-600">
        Order #{orderId.slice(0, 8)} — status: <strong>{order?.status ?? 'pending'}</strong>
      </p>
      <p className="text-sm text-neutral-600">
        We&apos;ll notify you here as your order is confirmed and on its way.
      </p>
      <Link
        href={`/chat?order=${orderId}`}
        className="mt-2 rounded-xl border border-neutral-300 px-6 py-3 font-medium text-neutral-900"
      >
        💬 Chat about this order
      </Link>
      <button onClick={onDone} className="rounded-xl bg-black px-6 py-3 font-medium text-white">
        Back to catalogue
      </button>
    </div>
  )
}
