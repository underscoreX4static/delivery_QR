'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
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

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Generate QR code</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-xs">
            <option value="">Select commercial…</option>
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
            className="rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-xs"
          />
          <button
            onClick={create}
            disabled={creating || !partnerId}
            className="w-full rounded-lg bg-black py-3 text-sm font-medium text-white disabled:opacity-50 sm:w-auto sm:px-3 sm:py-1.5 sm:text-xs"
          >
            Generate
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {qrCodes.map((qr) => (
          <QrCard key={qr.id} qr={qr} onToggleActive={() => toggleActive(qr)} />
        ))}
        {qrCodes.length === 0 && <p className="text-sm text-neutral-600">No QR codes yet.</p>}
      </div>
    </div>
  )
}

function QrCard({ qr, onToggleActive }: { qr: AdminQrCode; onToggleActive: () => void }) {
  const [dataUrl, setDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
  const deepLink = `https://t.me/${botUsername}?start=qr_${qr.slug}`

  useEffect(() => {
    QRCode.toDataURL(deepLink, { width: 200, margin: 2 }).then(setDataUrl)
  }, [deepLink])

  const copyLink = () => {
    navigator.clipboard.writeText(deepLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
      <div className="flex justify-center">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt={qr.slug} className="h-40 w-40 rounded-xl" />
        ) : (
          <div className="h-40 w-40 animate-pulse rounded-xl bg-neutral-100" />
        )}
      </div>
      <div className="text-center">
        <p className="font-semibold text-neutral-900">{qr.partners?.name ?? 'Unknown commercial'}</p>
        <p className="mt-0.5 font-mono text-xs text-neutral-600">{qr.label ?? qr.slug}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-neutral-50 py-2">
          <p className="text-lg font-bold text-neutral-900">{qr.total_scans}</p>
          <p className="text-xs text-neutral-600">Scans</p>
        </div>
        <div className="rounded-xl bg-neutral-50 py-2">
          <p className="text-lg font-bold text-neutral-900">{qr.unique_users}</p>
          <p className="text-xs text-neutral-600">Users</p>
        </div>
        <div className="rounded-xl bg-neutral-50 py-2">
          <p className="text-lg font-bold text-neutral-900">{qr.orders_generated}</p>
          <p className="text-xs text-neutral-600">Orders</p>
        </div>
      </div>
      <div className="flex gap-2">
        <a
          href={`/api/admin/qr-codes/${qr.id}/png`}
          className="flex-1 rounded-xl bg-blue-600 py-2.5 text-center text-xs font-medium text-white"
        >
          ⬇ Download
        </a>
        <button onClick={copyLink} className="flex-1 rounded-xl bg-neutral-100 py-2.5 text-xs font-medium text-neutral-700">
          {copied ? '✓ Copied' : '🔗 Copy link'}
        </button>
      </div>
      <button onClick={onToggleActive} className="w-full rounded-xl bg-neutral-50 py-2 text-xs font-medium text-neutral-600">
        {qr.is_active ? 'Deactivate' : 'Activate'}
      </button>
    </div>
  )
}
