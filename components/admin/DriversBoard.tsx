'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Leaderboard } from '@/components/admin/Leaderboard'
import type { Driver } from '@/types/index'

interface AdminDriver extends Driver {
  active_orders: number
  lifetime_delivered_orders: number
}

function DriverPoolPanel({
  balance,
  drivers,
  onGranted,
}: {
  balance: number | null
  drivers: AdminDriver[]
  onGranted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [granting, setGranting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allSelected = drivers.length > 0 && selected.size === drivers.length
  const selectAll = () => setSelected(allSelected ? new Set() : new Set(drivers.map((d) => d.id)))

  const grant = async () => {
    setGranting(true)
    setError(null)
    setDone(null)
    try {
      const res = await fetch('/api/admin/driver-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_ids: [...selected], amount: Number(amount), note }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to grant')
      setDone(`Granted $${Number(amount).toFixed(2)} to ${data.granted} driver(s) — $${data.total.toFixed(2)} from the pool.`)
      setAmount('')
      setNote('')
      setSelected(new Set())
      onGranted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant')
    } finally {
      setGranting(false)
    }
  }

  const total = Number(amount) > 0 ? Number(amount) * selected.size : 0

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted">Driver bonus pool budget</p>
          <p className={`text-2xl font-semibold ${balance !== null && balance < 0 ? 'text-danger' : 'text-foreground'}`}>
            {balance === null ? '…' : `$${balance.toFixed(2)}`}
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {open ? 'Close' : 'Grant bonus'}
        </button>
      </div>

      {open && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="number"
              step="0.01"
              placeholder="Amount $ / driver"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none sm:w-40 sm:text-xs"
            />
            <input
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none sm:flex-1 sm:text-xs"
            />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs font-medium text-muted">Recipients</p>
            <button onClick={selectAll} className="text-xs text-primary">
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {drivers.map((d) => (
              <button
                key={d.id}
                onClick={() => toggle(d.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  selected.has(d.id) ? 'bg-primary text-primary-foreground' : 'bg-border text-foreground hover:bg-border/70'
                }`}
              >
                {d.first_name} {d.last_name ?? ''}
              </button>
            ))}
            {drivers.length === 0 && <p className="text-xs text-muted">No non-owner drivers yet.</p>}
          </div>

          {error && <p className="mt-3 text-xs text-danger">{error}</p>}
          {done && <p className="mt-3 text-xs text-success">{done}</p>}

          <button
            onClick={grant}
            disabled={granting || selected.size === 0 || !(Number(amount) > 0)}
            className="mt-3 w-full rounded-lg bg-primary py-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto sm:px-4"
          >
            {granting
              ? 'Granting…'
              : `Grant${total > 0 ? ` $${total.toFixed(2)} total (${selected.size})` : ''}`}
          </button>
        </div>
      )}
    </div>
  )
}

export function DriversBoard() {
  const [drivers, setDrivers] = useState<AdminDriver[]>([])
  const [poolBalance, setPoolBalance] = useState<number | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [telegramId, setTelegramId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    fetch('/api/admin/drivers').then((r) => r.json()).then((d) => setDrivers(d.drivers ?? []))
    fetch('/api/admin/driver-pool').then((r) => r.json()).then((d) => setPoolBalance(d.balance ?? 0))
  }

  useEffect(() => {
    load()
  }, [])

  const toggleActive = async (driver: AdminDriver) => {
    await fetch(`/api/admin/drivers/${driver.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !driver.is_active }),
    })
    load()
  }

  const create = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_id: telegramId, first_name: firstName, last_name: lastName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create driver')
      setTelegramId('')
      setFirstName('')
      setLastName('')
      setShowNewForm(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create driver')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DriverPoolPanel balance={poolBalance} drivers={drivers} onGranted={load} />

      <Leaderboard
        title="Top drivers"
        countLabel="deliveries"
        detailHref={(id) => `/admin/drivers/${id}`}
        entries={drivers
          .filter((d) => !d.is_owner)
          .map((d) => ({
            id: d.id,
            name: `${d.first_name} ${d.last_name ?? ''}`.trim(),
            count: d.lifetime_delivered_orders,
            joinedAt: d.created_at,
          }))}
      />

      <div className="flex justify-end">
        <button
          onClick={() => setShowNewForm((v) => !v)}
          className="rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:py-1.5 sm:text-xs"
        >
          {showNewForm ? 'Close' : 'New driver'}
        </button>
      </div>

      {showNewForm && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 font-serif text-base font-semibold text-foreground">New driver</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <input
              placeholder="Telegram ID"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-xs"
            />
            <input
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-xs"
            />
            <input
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-xs"
            />
          </div>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <button
            onClick={create}
            disabled={submitting || !telegramId || !firstName}
            className="mt-3 w-full rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto sm:px-3 sm:py-1.5 sm:text-xs"
          >
            Create driver
          </button>
        </div>
      )}

      {/* Mobile: card list */}
      <div className="flex flex-col gap-2 sm:hidden">
        {drivers.map((d) => (
          <div key={d.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                {d.first_name} {d.last_name}
                {d.is_owner && (
                  <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">Owner</span>
                )}
              </p>
              <span className="text-xs text-muted">{d.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{d.telegram_id}</p>
            <p className="text-xs text-muted">{d.active_orders} active orders</p>
            <div className="mt-2 flex gap-2">
              <Link href={`/admin/drivers/${d.id}`} className="flex-1 rounded-lg bg-foreground py-2 text-center text-xs font-medium text-background">
                View stats →
              </Link>
              {!d.is_owner && (
                <button onClick={() => toggleActive(d)} className="flex-1 rounded-lg bg-border py-2 text-xs font-medium text-foreground hover:bg-border/70">
                  {d.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>
          </div>
        ))}
        {drivers.length === 0 && <p className="text-sm text-muted">No drivers yet.</p>}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface shadow-sm sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-page-bg text-xs text-muted">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Telegram ID</th>
              <th className="px-3 py-2">Active orders</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className="border-t border-border transition-colors hover:bg-page-bg/60">
                <td className="px-3 py-2 text-foreground">
                  {d.first_name} {d.last_name}
                  {d.is_owner && (
                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">Owner</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted">{d.telegram_id}</td>
                <td className="px-3 py-2 text-foreground">{d.active_orders}</td>
                <td className="px-3 py-2 text-foreground">{d.is_active ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/drivers/${d.id}`} className="mr-3 text-xs text-primary">
                    View stats →
                  </Link>
                  {!d.is_owner && (
                    <button onClick={() => toggleActive(d)} className="text-xs text-primary">
                      {d.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {drivers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted">
                  No drivers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
