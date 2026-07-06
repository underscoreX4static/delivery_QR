'use client'

import { useEffect, useState } from 'react'
import type { Partner, QrCode } from '@/types/index'

interface AdminQrCode extends QrCode {
  partners: { name: string } | null
  total_scans: number
  unique_users: number
  orders_generated: number
  conversion_rate: number
}

export function QrCodesBoard() {
  const [qrCodes, setQrCodes] = useState<AdminQrCode[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [partnerId, setPartnerId] = useState('')
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadQrCodes = () => fetch('/api/admin/qr-codes').then((r) => r.json()).then((d) => setQrCodes(d.qr_codes ?? []))

  useEffect(() => {
    loadQrCodes()
    fetch('/api/admin/partners').then((r) => r.json()).then((d) => setPartners(d.partners ?? []))
  }, [])

  const create = async () => {
    if (!partnerId) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/qr-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partner_id: partnerId, label }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create QR code')
      setLabel('')
      loadQrCodes()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create QR code')
    } finally {
      setCreating(false)
    }
  }

  const toggleActive = async (qr: AdminQrCode) => {
    await fetch(`/api/admin/qr-codes/${qr.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !qr.is_active }),
    })
    loadQrCodes()
  }

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Generate QR code</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs">
            <option value="">Select partner…</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1 text-xs"
          />
          <button
            onClick={create}
            disabled={creating || !partnerId}
            className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Generate
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      <div className="flex flex-col gap-2">
        {qrCodes.map((qr) => (
          <div key={qr.id} className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{qr.partners?.name ?? 'Unknown partner'}</p>
                <p className="text-xs text-neutral-500">{qr.label ?? qr.slug}</p>
                <p className="text-xs text-neutral-400">https://t.me/{botUsername}?start=qr_{qr.slug}</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/admin/qr-codes/${qr.id}/png`}
                  className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium"
                >
                  Download PNG
                </a>
                <button onClick={() => toggleActive(qr)} className="text-xs text-blue-600">
                  {qr.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-neutral-500">
              <span>{qr.total_scans} scans</span>
              <span>{qr.unique_users} unique users</span>
              <span>{qr.orders_generated} orders</span>
              <span>{(qr.conversion_rate * 100).toFixed(1)}% conversion</span>
            </div>
          </div>
        ))}
        {qrCodes.length === 0 && <p className="text-sm text-neutral-500">No QR codes yet.</p>}
      </div>
    </div>
  )
}
