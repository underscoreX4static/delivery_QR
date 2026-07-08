'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Partner } from '@/types/index'

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

interface FirstSaleBonus {
  amount: number
  trigger_orders: number
  earned: boolean
  paid: boolean
}

function ordinal(n: number): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
}

export function PartnerDetail({ partnerId }: { partnerId: string }) {
  const [partner, setPartner] = useState<Partner | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [firstSaleBonus, setFirstSaleBonus] = useState<FirstSaleBonus | null>(null)
  const [bonusAmountInput, setBonusAmountInput] = useState('')
  const [triggerOrdersInput, setTriggerOrdersInput] = useState('1')
  const [commissionInput, setCommissionInput] = useState('')
  const [savingCommission, setSavingCommission] = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)

  const load = () => {
    fetch(`/api/admin/partners/${partnerId}`)
      .then((r) => r.json())
      .then((d) => {
        setPartner(d.partner)
        setStats(d.stats)
        setOrders(d.orders ?? [])
        setCustomers(d.customers ?? [])
        setFirstSaleBonus(d.first_sale_bonus ?? null)
        setBonusAmountInput(String(d.first_sale_bonus?.amount ?? 10))
        setTriggerOrdersInput(String(d.first_sale_bonus?.trigger_orders ?? 1))
        setCommissionInput(String(Math.round((d.stats?.commission_rate ?? 0) * 1000) / 10))
      })
  }

  useEffect(load, [partnerId])

  const saveCommission = async () => {
    const percent = Number(commissionInput)
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return
    setSavingCommission(true)
    try {
      await fetch(`/api/admin/partners/${partnerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commission_rate: percent / 100 }),
      })
      load()
    } finally {
      setSavingCommission(false)
    }
  }

  const saveBonusAmount = async () => {
    await fetch(`/api/admin/partners/${partnerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_sale_bonus_amount: Number(bonusAmountInput) }),
    })
    load()
  }

  const saveTriggerOrders = async (value: string) => {
    setTriggerOrdersInput(value)
    await fetch(`/api/admin/partners/${partnerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ welcome_bonus_trigger_orders: Number(value) }),
    })
    load()
  }

  const markPaid = async () => {
    setMarkingPaid(true)
    try {
      await fetch(`/api/admin/partners/${partnerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_sale_bonus_paid: true }),
      })
      load()
    } finally {
      setMarkingPaid(false)
    }
  }

  if (!partner || !stats) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/partners" className="text-sm text-muted hover:text-foreground">
          ← Commercials
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{partner.name}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Scans" value={stats.total_scans} />
        <StatTile label="Unique customers" value={stats.unique_users} />
        <StatTile label="Orders" value={stats.orders_generated} />
        <StatTile label="Revenue generated" value={`$${stats.revenue_generated.toFixed(2)}`} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Financial summary</h2>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted">Commission rate</p>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.1"
                min={0}
                max={100}
                value={commissionInput}
                onChange={(e) => setCommissionInput(e.target.value)}
                onBlur={saveCommission}
                disabled={savingCommission}
                className="w-16 rounded border border-border bg-surface px-2 py-1 font-semibold text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
              />
              <span className="font-semibold text-foreground">%</span>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted">Total earned</p>
            <p className="font-semibold text-foreground">${stats.total_earned.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Paid out</p>
            <p className="font-semibold text-foreground">${stats.total_paid.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Pending</p>
            <p className="font-semibold text-foreground">${stats.pending.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {firstSaleBonus && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Welcome bonus</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[10px] font-medium uppercase text-muted">
              Bonus amount ($)
              <input
                type="number"
                step="0.01"
                value={bonusAmountInput}
                onChange={(e) => setBonusAmountInput(e.target.value)}
                onBlur={saveBonusAmount}
                className="w-24 rounded border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium uppercase text-muted">
              Unlocks on
              <select
                value={triggerOrdersInput}
                onChange={(e) => saveTriggerOrders(e.target.value)}
                className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                <option value="1">1st sale</option>
                <option value="2">2nd sale</option>
                <option value="3">3rd sale</option>
              </select>
            </label>
            <p className="text-xs text-muted">Modulable per commercial — some get more, some less.</p>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm">
            <div>
              {!firstSaleBonus.earned && (
                <p className="text-muted">
                  Not earned yet — awarded on their {ordinal(firstSaleBonus.trigger_orders)} delivered referral.
                </p>
              )}
              {firstSaleBonus.earned && firstSaleBonus.paid && (
                <p className="font-medium text-success">✅ Earned and paid</p>
              )}
              {firstSaleBonus.earned && !firstSaleBonus.paid && (
                <p className="font-medium text-warning">🎁 Earned — awaiting payment</p>
              )}
            </div>
            {firstSaleBonus.earned && !firstSaleBonus.paid && (
              <button
                disabled={markingPaid}
                onClick={markPaid}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {markingPaid ? 'Marking…' : 'Mark paid'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Orders</h2>
        <div className="flex flex-col gap-2 text-xs">
          {orders.map((o) => (
            <div key={o.order_id} className="flex items-center justify-between border-b border-border pb-2">
              <div>
                <p className="font-medium text-foreground">{o.customer_name}</p>
                <p className="text-muted">
                  {new Date(o.created_at).toLocaleDateString()} · {o.status}
                </p>
              </div>
              <div className="text-right">
                <p className="text-foreground">${o.total.toFixed(2)}</p>
                {o.commission_amount !== null && (
                  <p className="text-muted">
                    ${o.commission_amount.toFixed(2)} {o.commission_paid_out ? '(paid)' : '(pending)'}
                  </p>
                )}
              </div>
            </div>
          ))}
          {orders.length === 0 && <p className="text-muted">No orders yet.</p>}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Customers brought</h2>
        <div className="flex flex-col gap-2 text-xs">
          {customers.map((c) => (
            <div key={c.user_id} className="flex items-center justify-between border-b border-border pb-2">
              <div>
                <p className="font-medium text-foreground">{c.name}</p>
                <p className="text-muted">First order {new Date(c.first_order_at).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="text-foreground">{c.order_count} orders</p>
                <p className="text-muted">${c.total_spent.toFixed(2)}</p>
              </div>
            </div>
          ))}
          {customers.length === 0 && <p className="text-muted">No customers yet.</p>}
        </div>
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">{value}</p>
    </div>
  )
}
