'use client'

import { useEffect, useState } from 'react'
import type { Partner } from '@/types/index'

interface AdminPartner extends Partner {
  commission_owed: number
}

export function PartnersBoard() {
  const [partners, setPartners] = useState<AdminPartner[]>([])
  const [showNewForm, setShowNewForm] = useState(false)

  const load = () => fetch('/api/admin/partners').then((r) => r.json()).then((d) => setPartners(d.partners ?? []))

  useEffect(() => {
    load()
  }, [])

  const toggleActive = async (partner: AdminPartner) => {
    await fetch(`/api/admin/partners/${partner.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !partner.is_active }),
    })
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button onClick={() => setShowNewForm((v) => !v)} className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white">
          {showNewForm ? 'Close' : 'New partner'}
        </button>
      </div>

      {showNewForm && (
        <NewPartnerForm
          onCreated={() => {
            setShowNewForm(false)
            load()
          }}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Commission</th>
              <th className="px-3 py-2">Owed</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id} className="border-t border-neutral-100">
                <td className="px-3 py-2">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-neutral-500">{p.address}</p>
                </td>
                <td className="px-3 py-2 text-xs">
                  {p.contact_name} {p.contact_phone ? `· ${p.contact_phone}` : ''}
                </td>
                <td className="px-3 py-2">{(p.commission_rate * 100).toFixed(1)}%</td>
                <td className="px-3 py-2">${p.commission_owed.toFixed(2)}</td>
                <td className="px-3 py-2">{p.is_active ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">
                  <button onClick={() => toggleActive(p)} className="text-xs text-blue-600">
                    {p.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {partners.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-neutral-400">
                  No partners yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NewPartnerForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [commissionPercent, setCommissionPercent] = useState('5')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          address,
          contact_name: contactName,
          contact_phone: contactPhone,
          commission_rate: Number(commissionPercent) / 100,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create partner')
      setName('')
      setAddress('')
      setContactName('')
      setContactPhone('')
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create partner')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold">New partner</h2>
      <div className="flex flex-wrap gap-2">
        <input placeholder="Shop name" value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs" />
        <input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs" />
        <input placeholder="Contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs" />
        <input placeholder="Contact phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs" />
        <input
          placeholder="Commission %"
          value={commissionPercent}
          onChange={(e) => setCommissionPercent(e.target.value)}
          className="w-24 rounded border border-neutral-300 px-2 py-1 text-xs"
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={submitting || !name}
        className="mt-3 rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        Create partner
      </button>
    </div>
  )
}
