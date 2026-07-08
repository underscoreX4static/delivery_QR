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
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-neutral-600">Driver bonus pool budget</p>
          <p className={`text-2xl font-semibold ${balance !== null && balance < 0 ? 'text-red-600' : ''}`}>
            {balance === null ? '…' : `$${balance.toFixed(2)}`}
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg bg-black px-4 py-2 text-xs font-medium text-white"
        >
          {open ? 'Close' : 'Grant bonus'}
        </button>
      </div>

      {open && (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="number"
              step="0.01"
              placeholder="Amount $ / driver"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:w-40 sm:text-xs"
            />
            <input
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:flex-1 sm:text-xs"
            />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs font-medium text-neutral-700">Recipients</p>
            <button onClick={selectAll} className="text-xs text-blue-600">
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {drivers.map((d) => (
              <button
                key={d.id}
                onClick={() => toggle(d.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  selected.has(d.id) ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-700'
                }`}
              >
                {d.first_name} {d.last_name ?? ''}
              </button>
            ))}
            {drivers.length === 0 && <p className="text-xs text-neutral-600">No non-owner drivers yet.</p>}
          </div>

          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
          {done && <p className="mt-3 text-xs text-green-700">{done}</p>}

          <button
            onClick={grant}
            disabled={granting || selected.size === 0 || !(Number(amount) > 0)}
            className="mt-3 w-full rounded-lg bg-black py-2.5 text-xs font-medium text-white disabled:opacity-50 sm:w-auto sm:px-4"
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
          className="rounded-lg bg-black px-4 py-3 text-sm font-medium text-white sm:py-1.5 sm:text-xs"
        >
          {showNewForm ? 'Close' : 'New driver'}
        </button>
      </div>

      {showNewForm && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">New driver</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <input
              placeholder="Telegram ID"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-xs"
            />
            <input
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-xs"
            />
            <input
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-xs"
            />
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <button
            onClick={create}
            disabled={submitting || !telegramId || !firstName}
            className="mt-3 w-full rounded-lg bg-black py-3 text-sm font-medium text-white disabled:opacity-50 sm:w-auto sm:px-3 sm:py-1.5 sm:text-xs"
          >
            Create driver
          </button>
        </div>
      )}

      {/* Mobile: card list */}
      <div className="flex flex-col gap-2 sm:hidden">
        {drivers.map((d) => (
          <div key={d.id} className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {d.first_name} {d.last_name}
                {d.is_owner && <span className="ml-2 rounded-full bg-black px-2 py-0.5 text-[10px] text-white">Owner</span>}
              </p>
              <span className="text-xs">{d.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <p className="mt-1 text-xs text-neutral-600">{d.telegram_id}</p>
            <p className="text-xs text-neutral-600">{d.active_orders} active orders</p>
            <div className="mt-2 flex gap-2">
              <Link href={`/admin/drivers/${d.id}`} className="flex-1 rounded-lg bg-neutral-900 py-2 text-center text-xs font-medium text-white">
                View stats →
              </Link>
              {!d.is_owner && (
                <button onClick={() => toggleActive(d)} className="flex-1 rounded-lg bg-neutral-100 py-2 text-xs font-medium text-neutral-700">
                  {d.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>
          </div>
        ))}
        {drivers.length === 0 && <p className="text-sm text-neutral-600">No drivers yet.</p>}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-neutral-200 bg-white sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-600">
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
              <tr key={d.id} className="border-t border-neutral-100">
                <td className="px-3 py-2">
                  {d.first_name} {d.last_name}
                  {d.is_owner && <span className="ml-2 rounded-full bg-black px-2 py-0.5 text-[10px] text-white">Owner</span>}
                </td>
                <td className="px-3 py-2 text-xs">{d.telegram_id}</td>
                <td className="px-3 py-2">{d.active_orders}</td>
                <td className="px-3 py-2">{d.is_active ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/drivers/${d.id}`} className="mr-3 text-xs text-blue-600">
                    View stats →
                  </Link>
                  {!d.is_owner && (
                    <button onClick={() => toggleActive(d)} className="text-xs text-blue-600">
                      {d.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {drivers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-neutral-600">
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
