'use client'

import { useEffect, useState } from 'react'

interface StoreSettings {
  openTime: string
  closeTime: string
  isManuallyClosed: boolean
  deliveryFee: number
  freeDeliveryThreshold: number
  discountThreshold: number
  discountRate: number
  discountThreshold2: number
  discountRate2: number
  reorderDaysDefault: number
}

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
        <h2 className="mb-3 text-sm font-semibold">Store hours</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Open time (HH:mm)">
            <input value={settings.openTime} onChange={(e) => update('openTime', e.target.value)} className="w-24 rounded border border-neutral-300 px-2 py-1 text-xs" />
          </Field>
          <Field label="Close time (HH:mm, 24:00 = midnight)">
            <input value={settings.closeTime} onChange={(e) => update('closeTime', e.target.value)} className="w-24 rounded border border-neutral-300 px-2 py-1 text-xs" />
          </Field>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={settings.isManuallyClosed}
              onChange={(e) => update('isManuallyClosed', e.target.checked)}
            />
            Manually closed (overrides store hours immediately)
          </label>
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <input type="checkbox" checked={broadcast} onChange={(e) => setBroadcast(e.target.checked)} />
            Notify all customers via Telegram when this changes
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
