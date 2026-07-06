'use client'

import { useEffect, useState } from 'react'
import type { Driver } from '@/types/index'

interface AdminDriver extends Driver {
  active_orders: number
}

export function DriversBoard() {
  const [drivers, setDrivers] = useState<AdminDriver[]>([])
  const [showNewForm, setShowNewForm] = useState(false)
  const [telegramId, setTelegramId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = () => fetch('/api/admin/drivers').then((r) => r.json()).then((d) => setDrivers(d.drivers ?? []))

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
      <div className="flex justify-end">
        <button onClick={() => setShowNewForm((v) => !v)} className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white">
          {showNewForm ? 'Close' : 'New driver'}
        </button>
      </div>

      {showNewForm && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">New driver</h2>
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="Telegram ID"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
            />
            <input
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
            />
            <input
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="rounded border border-neutral-300 px-2 py-1 text-xs"
            />
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <button
            onClick={create}
            disabled={submitting || !telegramId || !firstName}
            className="mt-3 rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Create driver
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
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
