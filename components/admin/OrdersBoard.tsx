'use client'

import { useEffect, useState } from 'react'
import { AdminChatPanel } from '@/components/admin/AdminChatPanel'
import type { Driver, Order, OrderItem, OrderStatus } from '@/types/index'

interface AdminOrder extends Order {
  users: { first_name: string | null; last_name: string | null; phone: string | null; telegram_id: string } | null
  drivers: { id: string; first_name: string; last_name: string | null } | null
  order_items: OrderItem[]
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  on_the_way: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  preparing: 'bg-indigo-100 text-indigo-800',
  on_the_way: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-neutral-200 text-neutral-600',
}

export function OrdersBoard() {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [chatOpenId, setChatOpenId] = useState<string | null>(null)

  useEffect(() => {
    const loadOrders = () => fetch('/api/admin/orders').then((r) => r.json()).then((d) => setOrders(d.orders ?? []))
    loadOrders()
    const interval = setInterval(loadOrders, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetch('/api/admin/drivers').then((r) => r.json()).then((d) => setDrivers(d.drivers ?? []))
  }, [])

  const runAction = async (orderId: string, body: object) => {
    setBusyId(orderId)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'Action failed')
        return
      }
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...data.order } : o)))
    } finally {
      setBusyId(null)
    }
  }

  const submitCancel = async (orderId: string) => {
    if (!cancelReason.trim()) return
    await runAction(orderId, { action: 'cancel', reason: cancelReason.trim() })
    setCancellingId(null)
    setCancelReason('')
  }

  return (
    <div className="flex flex-col gap-3">
      {orders.length === 0 && <p className="text-sm text-neutral-600">No orders yet.</p>}

      {orders.map((order) => (
        <div key={order.id} className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">
                #{order.id.slice(0, 8)} · {order.users?.first_name ?? 'Unknown'} {order.users?.last_name ?? ''}
              </p>
              <p className="text-xs text-neutral-600">{order.users?.phone ?? 'No phone'}</p>
              <a
                href={`https://waze.com/ul?q=${encodeURIComponent(order.delivery_address)}&navigate=yes`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 underline"
              >
                {order.delivery_address}
              </a>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[order.status]}`}>
              {STATUS_LABELS[order.status]}
            </span>
          </div>

          <div className="mt-2 text-xs text-neutral-600">
            {order.order_items.length} item{order.order_items.length !== 1 ? 's' : ''} · $
            {order.total.toFixed(2)} · {order.scheduled_at ? `Scheduled ${new Date(order.scheduled_at).toLocaleString()}` : 'ASAP'}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={`https://waze.com/ul?q=${encodeURIComponent(order.delivery_address)}&navigate=yes`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700"
            >
              🗺️ Waze
            </a>
            <select
              value={order.drivers?.id ?? ''}
              onChange={(e) => runAction(order.id, { action: 'assign_driver', driver_id: e.target.value })}
              disabled={busyId === order.id}
              className="rounded-lg border border-neutral-300 px-2 py-1 text-xs"
            >
              <option value="">Assign driver…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.first_name} {d.is_owner ? '(owner)' : ''}
                </option>
              ))}
            </select>

            {order.status === 'pending' && (
              <ActionButton onClick={() => runAction(order.id, { action: 'confirm' })} busy={busyId === order.id}>
                Confirm
              </ActionButton>
            )}
            {order.status === 'confirmed' && (
              <ActionButton
                onClick={() => runAction(order.id, { action: 'advance', status: 'preparing' })}
                busy={busyId === order.id}
              >
                Mark preparing
              </ActionButton>
            )}
            {order.status === 'preparing' && (
              <ActionButton
                onClick={() => runAction(order.id, { action: 'advance', status: 'on_the_way' })}
                busy={busyId === order.id}
              >
                Mark on the way
              </ActionButton>
            )}
            {order.status === 'on_the_way' && (
              <ActionButton onClick={() => runAction(order.id, { action: 'deliver' })} busy={busyId === order.id}>
                Mark delivered
              </ActionButton>
            )}
            {order.status !== 'delivered' && order.status !== 'cancelled' && (
              <ActionButton
                variant="danger"
                onClick={() => setCancellingId(cancellingId === order.id ? null : order.id)}
                busy={busyId === order.id}
              >
                Cancel
              </ActionButton>
            )}
            <button
              onClick={() => setChatOpenId(chatOpenId === order.id ? null : order.id)}
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700"
            >
              💬 {chatOpenId === order.id ? 'Hide chat' : 'Chat'}
            </button>
          </div>

          {chatOpenId === order.id && <AdminChatPanel orderId={order.id} />}

          {cancellingId === order.id && (
            <div className="mt-3 flex gap-2">
              <input
                autoFocus
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Cancellation reason…"
                className="flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-xs"
              />
              <ActionButton variant="danger" onClick={() => submitCancel(order.id)} busy={busyId === order.id}>
                Confirm cancel
              </ActionButton>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  busy,
  variant = 'default',
}: {
  children: React.ReactNode
  onClick: () => void
  busy: boolean
  variant?: 'default' | 'danger'
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
        variant === 'danger' ? 'bg-red-50 text-red-700' : 'bg-black text-white'
      }`}
    >
      {children}
    </button>
  )
}
