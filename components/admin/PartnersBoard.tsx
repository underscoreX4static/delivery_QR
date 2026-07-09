'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Leaderboard } from '@/components/admin/Leaderboard'
import type { Partner } from '@/types/index'

interface AdminPartner extends Partner {
  commission_owed: number
  unique_customers_scanned: number
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

  const saveTelegramId = async (partnerId: string, telegramId: string) => {
    await fetch(`/api/admin/partners/${partnerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_id: telegramId || null }),
    })
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      <Leaderboard
        title="Top commercials"
        countLabel="customers scanned"
        detailHref={(id) => `/admin/partners/${id}`}
        entries={partners.map((p) => ({
          id: p.id,
          name: p.name,
          count: p.unique_customers_scanned,
          joinedAt: p.created_at,
        }))}
      />

      <div className="flex justify-end">
        <button
          onClick={() => setShowNewForm((v) => !v)}
          className="rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:py-1.5 sm:text-xs"
        >
          {showNewForm ? 'Close' : 'New commercial'}
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

      {/* Mobile: card list */}
      <div className="flex flex-col gap-2 sm:hidden">
        {partners.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">{p.name}</p>
                <p className="text-xs text-muted">{p.address}</p>
              </div>
              <span className="text-xs font-medium text-muted">{p.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {p.contact_name} {p.contact_phone ? `· ${p.contact_phone}` : ''}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-foreground">Commission: {(p.commission_rate * 100).toFixed(1)}%</span>
              <span className="text-foreground">Owed: ${p.commission_owed.toFixed(2)}</span>
            </div>
            <TelegramIdField initialValue={p.telegram_id ?? ''} onSave={(id) => saveTelegramId(p.id, id)} />
            <div className="mt-2 flex gap-2">
              <Link
                href={`/admin/partners/${p.id}`}
                className="flex-1 rounded-lg bg-foreground py-2 text-center text-xs font-medium text-background"
              >
                View stats →
              </Link>
              <button onClick={() => toggleActive(p)} className="flex-1 rounded-lg bg-border py-2 text-xs font-medium text-foreground hover:bg-border/70">
                {p.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
        {partners.length === 0 && <p className="text-sm text-muted">No commercials yet.</p>}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface shadow-sm sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-page-bg text-xs text-muted">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Telegram ID</th>
              <th className="px-3 py-2">Commission</th>
              <th className="px-3 py-2">Owed</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id} className="border-t border-border transition-colors hover:bg-page-bg/60">
                <td className="px-3 py-2">
                  <p className="font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted">{p.address}</p>
                </td>
                <td className="px-3 py-2 text-xs text-muted">
                  {p.contact_name} {p.contact_phone ? `· ${p.contact_phone}` : ''}
                </td>
                <td className="px-3 py-2">
                  <TelegramIdField initialValue={p.telegram_id ?? ''} onSave={(id) => saveTelegramId(p.id, id)} />
                </td>
                <td className="px-3 py-2 text-foreground">{(p.commission_rate * 100).toFixed(1)}%</td>
                <td className="px-3 py-2 text-foreground">${p.commission_owed.toFixed(2)}</td>
                <td className="px-3 py-2 text-foreground">{p.is_active ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/partners/${p.id}`} className="mr-3 text-xs text-primary">
                    View stats →
                  </Link>
                  <button onClick={() => toggleActive(p)} className="text-xs text-primary">
                    {p.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {partners.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-muted">
                  No commercials yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TelegramIdField({ initialValue, onSave }: { initialValue: string; onSave: (value: string) => void }) {
  const [value, setValue] = useState(initialValue)

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== initialValue) onSave(value.trim())
      }}
      placeholder="Telegram ID"
      title="Ask the commercial to send /start to the bot and share their Telegram ID with you."
      className="w-28 rounded border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
    />
  )
}

function NewPartnerForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [commissionPercent, setCommissionPercent] = useState('5')
  const [firstSaleBonus, setFirstSaleBonus] = useState('10')
  const [triggerOrders, setTriggerOrders] = useState('1')
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
          first_sale_bonus_amount: Number(firstSaleBonus),
          welcome_bonus_trigger_orders: Number(triggerOrders),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create commercial')
      setName('')
      setAddress('')
      setContactName('')
      setContactPhone('')
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create commercial')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="mb-3 font-serif text-base font-semibold text-foreground">New commercial</h2>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-xs" />
        <input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-xs" />
        <input placeholder="Contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-xs" />
        <input placeholder="Contact phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none sm:text-xs" />
        <input
          placeholder="Commission %"
          value={commissionPercent}
          onChange={(e) => setCommissionPercent(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none sm:w-24 sm:text-xs"
        />
        <input
          placeholder="Welcome bonus $"
          value={firstSaleBonus}
          onChange={(e) => setFirstSaleBonus(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none sm:w-32 sm:text-xs"
        />
        <select
          value={triggerOrders}
          onChange={(e) => setTriggerOrders(e.target.value)}
          title="Which delivered referral unlocks the welcome bonus"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none sm:w-40 sm:text-xs"
        >
          <option value="1">Unlock on 1st sale</option>
          <option value="2">Unlock on 2nd sale</option>
          <option value="3">Unlock on 3rd sale</option>
        </select>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <button
        onClick={submit}
        disabled={submitting || !name}
        className="mt-3 w-full rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto sm:px-3 sm:py-1.5 sm:text-xs"
      >
        Create commercial
      </button>
    </div>
  )
}
