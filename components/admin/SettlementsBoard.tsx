'use client'

import { useEffect, useState } from 'react'
import { Badge, type BadgeVariant } from '@/components/admin/Badge'
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

const STATUS_VARIANTS: Record<Settlement['status'], BadgeVariant> = {
  proposed: 'warning',
  confirmed: 'info',
  paid: 'info',
  payment_received: 'success',
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

  const cancelSettlement = async (id: string) => {
    if (!confirm('Cancel this settlement? Its deliveries and bonuses become available to settle again. Only do this for one created by mistake.')) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/settlements/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to cancel settlement')
      }
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel settlement')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 font-serif text-base font-semibold text-foreground">Driver settlement (today)</h2>
          <div className="flex flex-wrap gap-2">
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none">
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
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Create settlement
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 font-serif text-base font-semibold text-foreground">Commercial settlement (on-demand)</h2>
          <div className="flex flex-wrap gap-2">
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none">
              <option value="">Select commercial…</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none" />
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none" />
            <button
              onClick={createPartnerSettlement}
              disabled={busy || !partnerId || !periodStart || !periodEnd}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Create settlement
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex flex-col gap-2">
        {settlements.map((s) => (
          <div key={s.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {s.type === 'driver' ? `${s.drivers?.first_name ?? 'Driver'} ${s.drivers?.last_name ?? ''}` : s.partner_name ?? 'Commercial'}
                </p>
                <p className="text-xs text-muted">
                  {s.period_start} → {s.period_end}
                </p>
              </div>
              <Badge variant={STATUS_VARIANTS[s.status]}>{STATUS_LABELS[s.status]}</Badge>
            </div>
            <div className="mt-2 text-xs text-muted">
              Total: ${s.total_cash.toFixed(2)} · Payout: ${s.payout_amount.toFixed(2)}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {s.status === 'confirmed' && (
                <button
                  onClick={() => markPaid(s.id)}
                  disabled={busy}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Mark paid
                </button>
              )}
              {(s.status === 'proposed' || s.status === 'confirmed') && (
                <button
                  onClick={() => cancelSettlement(s.id)}
                  disabled={busy}
                  className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))}
        {settlements.length === 0 && <p className="text-sm text-muted">No settlements yet.</p>}
      </div>
    </div>
  )
}
