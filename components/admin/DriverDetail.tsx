'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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

  if (!driver || !stats || !bonuses) return <p className="text-sm text-neutral-600">Loading…</p>

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/drivers" className="text-sm text-neutral-600">
          ← Drivers
        </Link>
        <h1 className="mt-1 text-xl font-semibold">
          {driver.first_name} {driver.last_name}
          {driver.is_owner && <span className="ml-2 rounded-full bg-black px-2 py-0.5 text-[10px] text-white">Owner</span>}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Delivered orders" value={stats.lifetime_delivered_orders} />
        <StatTile label="Active orders" value={stats.active_orders} />
        <StatTile label="Revenue handled" value={`$${stats.revenue_generated.toFixed(2)}`} />
        <StatTile label="Total payout earned" value={`$${stats.total_payout_earned.toFixed(2)}`} />
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Bonuses</h2>

        {driver.is_owner ? (
          <p className="text-sm text-neutral-600">
            The owner doesn&apos;t earn bonuses — self-delivered orders already keep 100% of the margin, so there&apos;s
            no separate payout to incentivize.
          </p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-neutral-600">Pool budget (shared)</p>
                <p className={`font-semibold ${bonuses.pool_balance < 0 ? 'text-red-600' : ''}`}>
                  ${bonuses.pool_balance.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-600">Unpaid bonuses (this driver)</p>
                <p className="font-semibold">${bonuses.unpaid_total.toFixed(2)}</p>
              </div>
            </div>

            <div className="mb-4 rounded-lg bg-neutral-50 p-3">
              <p className="mb-2 text-xs font-medium text-neutral-700">Grant a bonus from the pool</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Amount $"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:w-28 sm:text-xs"
                />
                <input
                  placeholder="Note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:flex-1 sm:text-xs"
                />
                <button
                  onClick={grant}
                  disabled={granting || !(Number(amount) > 0)}
                  className="rounded-lg bg-black px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  {granting ? 'Granting…' : 'Grant'}
                </button>
              </div>
              {grantError && <p className="mt-2 text-xs text-red-600">{grantError}</p>}
              <p className="mt-2 text-[11px] text-neutral-500">
                Paid with the driver&apos;s next settlement. Draws from the shared pool budget (can go negative — that&apos;s
                you committing more than you&apos;ve set aside).
              </p>
            </div>

            <div className="flex flex-col gap-2 text-xs">
              {bonuses.granted.map((g) => (
                <div key={g.id} className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <div>
                    <p className="font-medium">{g.note || 'Bonus'}</p>
                    <p className="text-neutral-600">
                      Granted {new Date(g.created_at).toLocaleDateString()}
                      {g.paid_out && g.paid_out_at ? ` · paid ${new Date(g.paid_out_at).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">${g.amount.toFixed(2)}</p>
                    {g.paid_out ? (
                      <span className="rounded-full bg-green-100 px-2 py-1 text-[10px] font-medium text-green-800">Paid</span>
                    ) : g.settlement_id ? (
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-medium text-blue-800">In settlement</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-medium text-amber-800">Pending</span>
                    )}
                  </div>
                </div>
              ))}
              {bonuses.granted.length === 0 && <p className="text-neutral-600">No bonuses granted yet.</p>}
            </div>
          </>
        )}
      </div>

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
              <p>${o.total.toFixed(2)}</p>
            </div>
          ))}
          {orders.length === 0 && <p className="text-neutral-600">No orders yet.</p>}
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
