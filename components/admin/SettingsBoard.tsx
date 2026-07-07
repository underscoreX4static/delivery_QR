'use client'

import { useEffect, useState } from 'react'

interface DayHours {
  open: number
  close: number
}

type WeekHours = Record<number, DayHours>

interface StoreSettings {
  weekHours: WeekHours
  forceStatus: 'open' | 'closed' | null
  deliveryFee: number
  freeDeliveryThreshold: number
  discountThreshold: number
  discountRate: number
  discountThreshold2: number
  discountRate2: number
  reorderDaysDefault: number
}

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function SettingsBoard() {
  const [settings, setSettings] = useState<StoreSettings | null>(null)
  const [broadcast, setBroadcast] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/admin/settings').then((r) => r.json()).then((d) => setSettings(d.settings))
  }, [])

  if (!settings) return <p className="text-sm text-neutral-600">Loading…</p>

  const update = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => {
    setSettings({ ...settings, [key]: value })
  }

  const updateDay = (day: number, field: keyof DayHours, value: number) => {
    setSettings({ ...settings, weekHours: { ...settings.weekHours, [day]: { ...settings.weekHours[day], [field]: value } } })
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, broadcast }),
      })
      const data = await res.json()
      setSettings(data.settings)
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Store hours (per day)</h2>
        <div className="flex flex-col gap-2">
          {DAY_LABELS.map((label, day) => (
            <div key={day} className="flex items-center gap-2 text-xs">
              <span className="w-24 text-neutral-600">{label}</span>
              <input
                type="number"
                min={0}
                max={24}
                value={settings.weekHours[day]?.open ?? 10}
                onChange={(e) => updateDay(day, 'open', Number(e.target.value))}
                className="w-16 rounded border border-neutral-300 px-2 py-1"
              />
              <span className="text-neutral-600">to</span>
              <input
                type="number"
                min={0}
                max={24}
                value={settings.weekHours[day]?.close ?? 24}
                onChange={(e) => updateDay(day, 'close', Number(e.target.value))}
                className="w-16 rounded border border-neutral-300 px-2 py-1"
              />
              <span className="text-neutral-600">(24h, 24 = midnight)</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Field label="Manual override">
            <select
              value={settings.forceStatus ?? ''}
              onChange={(e) => update('forceStatus', (e.target.value || null) as StoreSettings['forceStatus'])}
              className="w-40 rounded border border-neutral-300 px-2 py-1 text-xs"
            >
              <option value="">Auto (use hours above)</option>
              <option value="open">Force open</option>
              <option value="closed">Force closed</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <input type="checkbox" checked={broadcast} onChange={(e) => setBroadcast(e.target.checked)} />
            Notify all customers via Telegram when the override changes
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Delivery & discounts</h2>
        <div className="flex flex-wrap gap-3">
          <Field label="Delivery fee ($)">
            <input type="number" step="0.01" value={settings.deliveryFee} onChange={(e) => update('deliveryFee', Number(e.target.value))} className="w-28 rounded border border-neutral-300 px-2 py-1 text-xs" />
          </Field>
          <Field label="Free delivery threshold ($)">
            <input
              type="number"
              step="0.01"
              value={settings.freeDeliveryThreshold}
              onChange={(e) => update('freeDeliveryThreshold', Number(e.target.value))}
              className="w-28 rounded border border-neutral-300 px-2 py-1 text-xs"
            />
          </Field>
          <Field label="Tier 1 threshold ($)">
            <input
              type="number"
              step="0.01"
              value={settings.discountThreshold}
              onChange={(e) => update('discountThreshold', Number(e.target.value))}
              className="w-28 rounded border border-neutral-300 px-2 py-1 text-xs"
            />
          </Field>
          <Field label="Tier 1 rate (%)">
            <input
              type="number"
              step="0.1"
              value={settings.discountRate * 100}
              onChange={(e) => update('discountRate', Number(e.target.value) / 100)}
              className="w-24 rounded border border-neutral-300 px-2 py-1 text-xs"
            />
          </Field>
          <Field label="Tier 2 threshold ($)">
            <input
              type="number"
              step="0.01"
              value={settings.discountThreshold2}
              onChange={(e) => update('discountThreshold2', Number(e.target.value))}
              className="w-28 rounded border border-neutral-300 px-2 py-1 text-xs"
            />
          </Field>
          <Field label="Tier 2 rate (%)">
            <input
              type="number"
              step="0.1"
              value={settings.discountRate2 * 100}
              onChange={(e) => update('discountRate2', Number(e.target.value) / 100)}
              className="w-24 rounded border border-neutral-300 px-2 py-1 text-xs"
            />
          </Field>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Inventory intelligence</h2>
        <Field label="Reorder days default">
          <input
            type="number"
            value={settings.reorderDaysDefault}
            onChange={(e) => update('reorderDaysDefault', Number(e.target.value))}
            className="w-24 rounded border border-neutral-300 px-2 py-1 text-xs"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="rounded-lg bg-black px-4 py-2 text-xs font-medium text-white disabled:opacity-50">
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {savedAt && <span className="text-xs text-neutral-600">Saved.</span>}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-medium uppercase text-neutral-600">
      {label}
      {children}
    </label>
  )
}
