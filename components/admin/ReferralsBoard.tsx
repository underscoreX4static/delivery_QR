'use client'

import { useEffect, useState } from 'react'

interface ReferralRow {
  id: string
  reward_amount: number
  created_at: string
  referrer: { id: string; first_name: string | null; last_name: string | null; phone: string | null; notes: string | null }
  referred: { id: string; first_name: string | null; last_name: string | null; phone: string | null }
  referrer_stats: { total_orders: number; total_spent: number; prior_approved_referrals: number }
}

function name(p: { first_name: string | null; last_name: string | null }) {
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unknown'
}

export function ReferralsBoard() {
  const [referrals, setReferrals] = useState<ReferralRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)

  const load = () => {
    fetch('/api/admin/referrals')
      .then((r) => r.json())
      .then((d) => setReferrals(d.referrals ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const act = async (id: string, action: 'approve' | 'reject') => {
    setActingId(id)
    try {
      const res = await fetch(`/api/admin/referrals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) load()
    } finally {
      setActingId(null)
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div className="flex flex-col gap-3">
      {referrals.length === 0 && (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          No pending referrals to review.
        </p>
      )}

      {referrals.map((r) => (
        <div key={r.id} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase text-muted">New customer</p>
              <p className="text-sm font-semibold">{name(r.referred)}</p>
              {r.referred.phone && <p className="text-xs text-muted">{r.referred.phone}</p>}
              <p className="mt-1 text-xs text-muted">Signed up {new Date(r.created_at).toLocaleDateString()}</p>
            </div>

            <div className="rounded-full bg-border px-3 py-1 text-xs font-semibold">
              ${r.reward_amount.toFixed(2)} each if approved
            </div>
          </div>

          <div className="mt-3 rounded-lg bg-page-bg p-3">
            <p className="text-xs font-medium uppercase text-muted">Referred by</p>
            <p className="text-sm font-semibold">{name(r.referrer)}</p>
            {r.referrer.phone && <p className="text-xs text-muted">{r.referrer.phone}</p>}

            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-muted">Their orders</p>
                <p className="font-semibold">{r.referrer_stats.total_orders}</p>
              </div>
              <div>
                <p className="text-muted">Their spend</p>
                <p className="font-semibold">${r.referrer_stats.total_spent.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted">Prior referrals</p>
                <p className="font-semibold">{r.referrer_stats.prior_approved_referrals}</p>
              </div>
            </div>

            {r.referrer.notes && (
              <div className="mt-2 rounded border border-warning/30 bg-warning/10 px-2 py-1.5 text-xs text-warning">
                <span className="font-medium">Note: </span>
                {r.referrer.notes}
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              disabled={actingId === r.id}
              onClick={() => act(r.id, 'reject')}
              className="flex-1 rounded-lg border border-border py-2 text-xs font-medium text-foreground disabled:opacity-50"
            >
              Reject
            </button>
            <button
              disabled={actingId === r.id}
              onClick={() => act(r.id, 'approve')}
              className="flex-1 rounded-lg bg-primary py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {actingId === r.id ? 'Working…' : `Approve — credit both $${r.reward_amount.toFixed(2)}`}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
