'use client'

import { useEffect, useState } from 'react'
import type { Driver, Partner, Settlement } from '@/types/index'

interface AdminSettlement extends Settlement {
  drivers: { first_name: string; last_name: string | null } | null
  partner_name: string | null
}

const STATUS_LABELS: Record<Settlement['status'], string> = {
  proposed: 'Awaiting driver confirmation',
  confirmed: 'Confirmed — ready to pay',
  paid: 'Paid — awaiting receipt confirmation',
  payment_received: 'Locked',
}

export function SettlementsBoard() {
  const [settlements, setSettlements] = useState<AdminSettlement[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [driverId, setDriverId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => fetch('/api/admin/settlements').then((r) => r.json()).then((d) => setSettlements(d.settlements ?? []))

  useEffect(() => {
    load()
    fetch('/api/admin/drivers').then((r) => r.json()).then((d) => setDrivers((d.drivers ?? []).filter((x: Driver) => !x.is_owner)))
    fetch('/api/admin/partners').then((r) => r.json()).then((d) => setPartners(d.partners ?? []))
  }, [])

  const createDriverSettlement = async () => {
    if (!driverId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'driver', driver_id: driverId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create settlement')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create settlement')
    } finally {
      setBusy(false)
    }
  }

  const createPartnerSettlement = async () => {
    if (!partnerId || !periodStart || !periodEnd) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'partner', partner_id: partnerId, period_start: periodStart, period_end: periodEnd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create settlement')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create settlement')
    } finally {
      setBusy(false)
    }
  }

  const markPaid = async (id: string) => {
    setBusy(true)
    try {
      await fetch(`/api/admin/settlements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_paid' }),
      })
      load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Driver settlement (today)</h2>
          <div className="flex flex-wrap gap-2">
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs">
              <option value="">Select driver…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.first_name} {d.last_name}
                </option>
              ))}
            </select>
            <button
              onClick={createDriverSettlement}
              disabled={busy || !driverId}
              className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Create settlement
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Partner settlement (on-demand)</h2>
          <div className="flex flex-wrap gap-2">
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs">
              <option value="">Select partner…</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs" />
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs" />
            <button
              onClick={createPartnerSettlement}
              disabled={busy || !partnerId || !periodStart || !periodEnd}
              className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Create settlement
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex flex-col gap-2">
        {settlements.map((s) => (
          <div key={s.id} className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">
                  {s.type === 'driver' ? `${s.drivers?.first_name ?? 'Driver'} ${s.drivers?.last_name ?? ''}` : s.partner_name ?? 'Partner'}
                </p>
                <p className="text-xs text-neutral-600">
                  {s.period_start} → {s.period_end}
                </p>
              </div>
              <span className="text-xs font-medium text-neutral-600">{STATUS_LABELS[s.status]}</span>
            </div>
            <div className="mt-2 text-xs text-neutral-600">
              Total: ${s.total_cash.toFixed(2)} · Payout: ${s.payout_amount.toFixed(2)}
            </div>
            {s.status === 'confirmed' && (
              <button
                onClick={() => markPaid(s.id)}
                disabled={busy}
                className="mt-2 rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Mark paid
              </button>
            )}
          </div>
        ))}
        {settlements.length === 0 && <p className="text-sm text-neutral-600">No settlements yet.</p>}
      </div>
    </div>
  )
}
