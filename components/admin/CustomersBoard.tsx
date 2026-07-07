'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/admin/Modal'
import type { LoyaltyTier } from '@/app/api/admin/customers/route'
import type { Order, User } from '@/types/index'

interface AdminCustomer extends User {
  order_count: number
  total_spent: number
  last_order_at: string | null
  qr_source_name: string | null
  loyalty_tier: LoyaltyTier
}

const LOYALTY_BADGE: Record<LoyaltyTier, string> = {
  new: '🆕 New',
  regular: '🔄 Regular',
  vip: '⭐ VIP',
  diamond: '💎 Diamond',
}

type SortKey = 'most_orders' | 'most_spent' | 'most_recent'

export function CustomersBoard() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([])
  const [selected, setSelected] = useState<AdminCustomer | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('most_spent')

  const load = () => fetch('/api/admin/customers').then((r) => r.json()).then((d) => setCustomers(d.customers ?? []))

  useEffect(() => {
    load()
  }, [])

  const visibleCustomers = useMemo(() => {
    const query = search.trim().toLowerCase()
    let result = customers
    if (query) {
      result = result.filter((c) => {
        const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase()
        return name.includes(query) || (c.phone ?? '').toLowerCase().includes(query)
      })
    }

    return [...result].sort((a, b) => {
      if (sortKey === 'most_orders') return b.order_count - a.order_count
      if (sortKey === 'most_recent') return (b.last_order_at ?? '').localeCompare(a.last_order_at ?? '')
      return b.total_spent - a.total_spent
    })
  }, [customers, search, sortKey])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-sm"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="most_spent">Most spent</option>
          <option value="most_orders">Most orders</option>
          <option value="most_recent">Most recent</option>
        </select>
      </div>

      {visibleCustomers.map((customer) => (
        <button
          key={customer.id}
          onClick={() => setSelected(customer)}
          className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 text-left"
        >
          <div>
            <p className="text-sm font-semibold">
              {customer.first_name} {customer.last_name}{' '}
              <span className="ml-1 text-xs font-normal">{LOYALTY_BADGE[customer.loyalty_tier]}</span>
            </p>
            <p className="text-xs text-neutral-600">{customer.phone ?? 'No phone'}</p>
            {customer.qr_source_name && <p className="text-xs text-neutral-600">via {customer.qr_source_name}</p>}
          </div>
          <div className="text-right text-xs">
            <p className="font-medium">${customer.total_spent.toFixed(2)}</p>
            <p className="text-neutral-600">{customer.order_count} orders</p>
          </div>
        </button>
      ))}
      {visibleCustomers.length === 0 && <p className="text-sm text-neutral-600">No customers match.</p>}

      {selected && <CustomerDetail customer={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function CustomerDetail({ customer, onClose }: { customer: AdminCustomer; onClose: () => void }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [favourites, setFavourites] = useState<{ product_id: string; name: string; quantity: number }[]>([])
  const [notes, setNotes] = useState(customer.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/customers/${customer.id}`)
      .then((r) => r.json())
      .then((d) => {
        setOrders(d.orders ?? [])
        setFavourites(d.favourite_products ?? [])
      })
  }, [customer.id])

  const saveNotes = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.hint ?? data.error ?? 'Failed to save notes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`${customer.first_name} ${customer.last_name ?? ''}`} onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Total spent" value={`$${customer.total_spent.toFixed(2)}`} />
          <Stat label="Orders" value={String(customer.order_count)} />
          <Stat label="Phone" value={customer.phone ?? '—'} />
          <Stat label="QR source" value={customer.qr_source_name ?? 'Direct'} />
          <Stat label="Referral credit" value={`$${(customer.credit_balance ?? 0).toFixed(2)}`} />
        </div>

        {favourites.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-neutral-600">Favourite products</p>
            <ul className="text-xs">
              {favourites.map((f) => (
                <li key={f.product_id}>
                  {f.name} × {f.quantity}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-semibold text-neutral-600">Order history</p>
          <ul className="flex flex-col gap-1 text-xs">
            {orders.map((o) => (
              <li key={o.id} className="flex justify-between border-b border-neutral-100 pb-1">
                <span>#{o.id.slice(0, 8)} · {o.status}</span>
                <span>${o.total.toFixed(2)}</span>
              </li>
            ))}
            {orders.length === 0 && <li className="text-neutral-600">No orders yet.</li>}
          </ul>
        </div>

        <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-600">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-normal text-neutral-900"
          />
        </label>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button onClick={saveNotes} disabled={saving} className="rounded-lg bg-black py-2 text-xs font-medium text-white disabled:opacity-50">
          Save notes
        </button>
      </div>
    </Modal>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 p-2">
      <p className="text-neutral-600">{label}</p>
      <p className="font-semibold text-neutral-900">{value}</p>
    </div>
  )
}
