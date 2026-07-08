'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/admin/Badge'
import type { Driver, DriverBonusGrant } from '@/types/index'

interface Stats {
  lifetime_delivered_orders: number
  active_orders: number
  revenue_generated: number
  total_payout_earned: number
}

interface OrderRow {
  order_id: string
  created_at: string
  customer_name: string
  total: number
  status: string
}

interface BonusData {
  pool_balance: number
  granted: DriverBonusGrant[]
  unpaid_total: number
}

export function DriverDetail({ driverId }: { driverId: string }) {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [bonuses, setBonuses] = useState<BonusData | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [granting, setGranting] = useState(false)
  const [grantError, setGrantError] = useState<string | null>(null)

  const load = () => {
    fetch(`/api/admin/drivers/${driverId}`)
      .then((r) => r.json())
      .then((d) => {
        setDriver(d.driver)
        setStats(d.stats ?? null)
        setOrders(d.orders ?? [])
        setBonuses(d.bonuses ?? null)
      })
  }

  useEffect(load, [driverId])

  const grant = async () => {
    setGranting(true)
    setGrantError(null)
    try {
      const res = await fetch('/api/admin/driver-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_ids: [driverId], amount: Number(amount), note }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to grant bonus')
      setAmount('')
      setNote('')
      load()
    } catch (err) {
      setGrantError(err instanceof Error ? err.message : 'Failed to grant bonus')
    } finally {
      setGranting(false)
    }
  }

  if (!driver || !stats || !bonuses) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/drivers" className="text-sm text-muted hover:text-foreground">
          ← Drivers
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          {driver.first_name} {driver.last_name}
          {driver.is_owner && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">Owner</span>
          )}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Delivered orders" value={stats.lifetime_delivered_orders} />
        <StatTile label="Active orders" value={stats.active_orders} />
        <StatTile label="Revenue handled" value={`$${stats.revenue_generated.toFixed(2)}`} />
        <StatTile label="Total payout earned" value={`$${stats.total_payout_earned.toFixed(2)}`} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Bonuses</h2>

        <>
          {driver.is_owner && (
            <p className="mb-3 text-xs text-muted">
              You already keep 100% of the margin on your own deliveries — granting yourself a bonus just moves pool
              money into a payable to yourself, but it&apos;s available if you want it.
            </p>
          )}
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted">Pool budget (shared)</p>
              <p className={`font-semibold ${bonuses.pool_balance < 0 ? 'text-danger' : 'text-foreground'}`}>
                ${bonuses.pool_balance.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Unpaid bonuses (this driver)</p>
              <p className="font-semibold text-foreground">${bonuses.unpaid_total.toFixed(2)}</p>
            </div>
          </div>

          <div className="mb-4 rounded-lg bg-page-bg p-3">
            <p className="mb-2 text-xs font-medium text-muted">Grant a bonus from the pool</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="number"
                step="0.01"
                placeholder="Amount $"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none sm:w-28 sm:text-xs"
              />
              <input
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none sm:flex-1 sm:text-xs"
              />
              <button
                onClick={grant}
                disabled={granting || !(Number(amount) > 0)}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {granting ? 'Granting…' : 'Grant'}
              </button>
            </div>
            {grantError && <p className="mt-2 text-xs text-danger">{grantError}</p>}
            <p className="mt-2 text-[11px] text-muted">
              Paid with the driver&apos;s next settlement. Draws from the shared pool budget (can go negative — that&apos;s
              you committing more than you&apos;ve set aside).
            </p>
          </div>

          <div className="flex flex-col gap-2 text-xs">
            {bonuses.granted.map((g) => (
              <div key={g.id} className="flex items-center justify-between border-b border-border pb-2">
                <div>
                  <p className="font-medium text-foreground">{g.note || 'Bonus'}</p>
                  <p className="text-muted">
                    Granted {new Date(g.created_at).toLocaleDateString()}
                    {g.paid_out && g.paid_out_at ? ` · paid ${new Date(g.paid_out_at).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">${g.amount.toFixed(2)}</p>
                  {g.paid_out ? (
                    <Badge variant="success">Paid</Badge>
                  ) : g.settlement_id ? (
                    <Badge variant="info">In settlement</Badge>
                  ) : (
                    <Badge variant="warning">Pending</Badge>
                  )}
                </div>
              </div>
            ))}
            {bonuses.granted.length === 0 && <p className="text-muted">No bonuses granted yet.</p>}
          </div>
        </>
      </div>

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
              <p className="text-foreground">${o.total.toFixed(2)}</p>
            </div>
          ))}
          {orders.length === 0 && <p className="text-muted">No orders yet.</p>}
        </div>
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold text-foreground">{value}</p>
    </div>
  )
}
