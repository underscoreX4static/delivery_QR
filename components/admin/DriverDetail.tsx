'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Driver, DriverBonus } from '@/types/index'

interface BonusData {
  pool_balance: number
  lifetime_delivered_orders: number
  next_milestone: { orders: number; bonus: number } | null
  awarded: DriverBonus[]
}

export function DriverDetail({ driverId }: { driverId: string }) {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [bonuses, setBonuses] = useState<BonusData | null>(null)
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null)

  const load = () => {
    fetch(`/api/admin/drivers/${driverId}`)
      .then((r) => r.json())
      .then((d) => {
        setDriver(d.driver)
        setBonuses(d.bonuses ?? null)
      })
  }

  useEffect(load, [driverId])

  const markPaid = async (bonusId: string) => {
    setMarkingPaidId(bonusId)
    try {
      const res = await fetch(`/api/admin/driver-bonuses/${bonusId}`, { method: 'PATCH' })
      if (res.ok) load()
    } finally {
      setMarkingPaidId(null)
    }
  }

  if (!driver || !bonuses) return <p className="text-sm text-neutral-600">Loading…</p>

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
    </div>
  )
}
