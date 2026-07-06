'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTelegram } from '@/components/client/TelegramProvider'
import type { Order, OrderStatus } from '@/types/index'

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  on_the_way: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export function OrderHistory({ onBack }: { onBack: () => void }) {
  const { apiFetch } = useTelegram()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/orders')
      .then((r) => r.json())
      .then((d) => setOrders(d.orders ?? []))
      .finally(() => setLoading(false))
  }, [apiFetch])

  return (
    <div className="flex min-h-dvh flex-col p-4">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-neutral-600">
          ← Back
        </button>
        <h1 className="text-lg font-semibold">My orders</h1>
      </div>

      {loading && <p className="text-sm text-neutral-600">Loading…</p>}
      {!loading && orders.length === 0 && <p className="text-sm text-neutral-600">No orders yet.</p>}

      <div className="flex flex-col gap-2">
        {orders.map((order) => (
          <div key={order.id} className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">#{order.id.slice(0, 8)}</p>
                <p className="text-xs text-neutral-600">{new Date(order.created_at).toLocaleString()}</p>
              </div>
              <span className="text-xs font-medium">{STATUS_LABELS[order.status]}</span>
            </div>
            <p className="mt-1 text-sm">${order.total.toFixed(2)}</p>
            <Link
              href={`/chat?order=${order.id}`}
              className="mt-2 block rounded-lg bg-neutral-100 py-2 text-center text-xs font-medium text-neutral-900"
            >
              💬 Chat about this order
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
