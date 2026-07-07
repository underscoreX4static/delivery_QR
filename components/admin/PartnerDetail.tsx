'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Partner, PartnerBonus } from '@/types/index'

interface Stats {
  total_scans: number
  unique_users: number
  orders_generated: number
  revenue_generated: number
  commission_rate: number
  total_earned: number
  total_paid: number
  pending: number
}

interface OrderRow {
  order_id: string
  created_at: string
  customer_name: string
  total: number
  status: string
  commission_amount: number | null
  commission_paid_out: boolean | null
}

interface CustomerRow {
  user_id: string
  name: string
  first_order_at: string
  order_count: number
  total_spent: number
}

interface BonusData {
  pool_balance: number
  lifetime_delivered_orders: number
  next_milestone: { orders: number; bonus: number } | null
  awarded: PartnerBonus[]
}

export function PartnerDetail({ partnerId }: { partnerId: string }) {
  const [partner, setPartner] = useState<Partner | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [bonuses, setBonuses] = useState<BonusData | null>(null)
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null)

  const load = () => {
    fetch(`/api/admin/partners/${partnerId}`)
      .then((r) => r.json())
      .then((d) => {
        setPartner(d.partner)
        setStats(d.stats)
        setOrders(d.orders ?? [])
        setCustomers(d.customers ?? [])
        setBonuses(d.bonuses ?? null)
      })
  }

  useEffect(load, [partnerId])

  const markPaid = async (bonusId: string) => {
    setMarkingPaidId(bonusId)
    try {
      const res = await fetch(`/api/admin/partner-bonuses/${bonusId}`, { method: 'PATCH' })
      if (res.ok) load()
    } finally {
      setMarkingPaidId(null)
    }
  }

  if (!partner || !stats) return <p className="text-sm text-neutral-600">Loading…</p>

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/partners" className="text-sm text-neutral-600">
          ← Commercials
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{partner.name}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Scans" value={stats.total_scans} />
        <StatTile label="Unique customers" value={stats.unique_users} />
        <StatTile label="Orders" value={stats.orders_generated} />
        <StatTile label="Revenue generated" value={`$${stats.revenue_generated.toFixed(2)}`} />
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Financial summary</h2>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-neutral-600">Commission rate</p>
            <p className="font-semibold">{(stats.commission_rate * 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-neutral-600">Total earned</p>
            <p className="font-semibold">${stats.total_earned.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-600">Paid out</p>
            <p className="font-semibold">${stats.total_paid.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-600">Pending</p>
            <p className="font-semibold">${stats.pending.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {bonuses && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Milestone bonuses</h2>
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-neutral-600">Bonus pool balance</p>
              <p className="font-semibold">${bonuses.pool_balance.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-600">Lifetime delivered orders</p>
              <p className="font-semibold">{bonuses.lifetime_delivered_orders}</p>
            </div>
            {bonuses.next_milestone && (
              <div>
                <p className="text-xs text-neutral-600">Next milestone</p>
                <p className="font-semibold">
                  {bonuses.next_milestone.orders} orders → ${bonuses.next_milestone.bonus.toFixed(2)}
                </p>
              </div>
            )}
          </div>

          {bonuses.next_milestone && (
            <div className="mb-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-black transition-all"
                  style={{ width: `${Math.min((bonuses.lifetime_delivered_orders / bonuses.next_milestone.orders) * 100, 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-neutral-600">
                {bonuses.lifetime_delivered_orders} / {bonuses.next_milestone.orders} orders
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 text-xs">
            {bonuses.awarded.map((b) => (
              <div key={b.id} className="flex items-center justify-between border-b border-neutral-100 pb-2">
                <div>
                  <p className="font-medium">{b.milestone_orders} orders milestone</p>
                  <p className="text-neutral-600">
                    Earned {new Date(b.created_at).toLocaleDateString()}
                    {b.paid_out && b.paid_out_at ? ` · paid ${new Date(b.paid_out_at).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold">${b.bonus_amount.toFixed(2)}</p>
                  {b.paid_out ? (
                    <span className="rounded-full bg-green-100 px-2 py-1 text-[10px] font-medium text-green-800">Paid</span>
                  ) : (
                    <button
                      disabled={markingPaidId === b.id}
                      onClick={() => markPaid(b.id)}
                      className="rounded-lg bg-black px-3 py-1.5 text-[10px] font-medium text-white disabled:opacity-50"
                    >
                      {markingPaidId === b.id ? 'Marking…' : 'Mark paid'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {bonuses.awarded.length === 0 && <p className="text-neutral-600">No milestones reached yet.</p>}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Orders</h2>
        <div className="flex flex-col gap-2 text-xs">
          {orders.map((o) => (
            <div key={o.order_id} className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <div>
                <p className="font-medium">{o.customer_name}</p>
                <p className="text-neutral-600">
                  {new Date(o.created_at).toLocaleDateString()} · {o.status}
                </p>
              </div>
              <div className="text-right">
                <p>${o.total.toFixed(2)}</p>
                {o.commission_amount !== null && (
                  <p className="text-neutral-600">
                    ${o.commission_amount.toFixed(2)} {o.commission_paid_out ? '(paid)' : '(pending)'}
                  </p>
                )}
              </div>
            </div>
          ))}
          {orders.length === 0 && <p className="text-neutral-600">No orders yet.</p>}
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Customers brought</h2>
        <div className="flex flex-col gap-2 text-xs">
          {customers.map((c) => (
            <div key={c.user_id} className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-neutral-600">First order {new Date(c.first_order_at).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p>{c.order_count} orders</p>
                <p className="text-neutral-600">${c.total_spent.toFixed(2)}</p>
              </div>
            </div>
          ))}
          {customers.length === 0 && <p className="text-neutral-600">No customers yet.</p>}
        </div>
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs text-neutral-600">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  )
}
