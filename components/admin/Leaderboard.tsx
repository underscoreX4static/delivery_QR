'use client'

import { useState } from 'react'
import Link from 'next/link'

export interface LeaderboardEntry {
  id: string
  name: string
  count: number
  joinedAt: string
}

/**
 * Ranks by raw lifetime total, or by rate-per-day-since-joining — a partner
 * with 100 scans over 2 years is actually doing worse than one with 15 scans
 * over 2 days, and a pure total-count leaderboard would hide that entirely.
 * Defaults to "By total" since that's the more familiar framing, with "By
 * rate" a tap away for a fairer read on who's actually performing well.
 */
export function Leaderboard({
  title,
  countLabel,
  entries,
  detailHref,
}: {
  title: string
  countLabel: string
  entries: LeaderboardEntry[]
  detailHref: (id: string) => string
}) {
  const [view, setView] = useState<'total' | 'rate'>('total')
  const [expanded, setExpanded] = useState(false)
  // Snapshot once per mount rather than reading Date.now() during render —
  // this is a dashboard ranking, not a live countdown, so it doesn't need to
  // tick; it just needs to not call an impure function while rendering.
  const [now] = useState(() => Date.now())

  const withRate = entries.map((e) => {
    const daysActive = Math.max(1, (now - new Date(e.joinedAt).getTime()) / 86_400_000)
    return { ...e, rate: e.count / daysActive, daysActive: Math.round(daysActive) }
  })

  const sorted =
    view === 'total' ? [...withRate].sort((a, b) => b.count - a.count) : [...withRate].sort((a, b) => b.rate - a.rate)

  const visible = expanded ? sorted : sorted.slice(0, 3)

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex gap-0.5 rounded-lg bg-neutral-100 p-0.5 text-xs">
          <button
            onClick={() => setView('total')}
            className={`rounded-md px-2 py-1 font-medium ${view === 'total' ? 'bg-white shadow-sm' : 'text-neutral-600'}`}
          >
            By total
          </button>
          <button
            onClick={() => setView('rate')}
            className={`rounded-md px-2 py-1 font-medium ${view === 'rate' ? 'bg-white shadow-sm' : 'text-neutral-600'}`}
          >
            By rate
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {visible.map((e, i) => (
          <Link
            key={e.id}
            href={detailHref(e.id)}
            className="flex items-center justify-between rounded-lg border border-neutral-100 p-2 text-xs hover:bg-neutral-50"
          >
            <div className="flex items-center gap-2">
              <span className="w-5 text-center font-semibold text-neutral-400">{i + 1}</span>
              <span className="font-medium">{e.name}</span>
            </div>
            <div className="text-right">
              <p className="font-semibold">
                {e.count} {countLabel}
              </p>
              <p className="text-neutral-600">
                {e.rate.toFixed(2)}/day · {e.daysActive}d active
              </p>
            </div>
          </Link>
        ))}
        {sorted.length === 0 && <p className="text-xs text-neutral-600">No data yet.</p>}
      </div>

      {sorted.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full rounded-lg bg-neutral-100 py-2 text-xs font-medium text-neutral-700"
        >
          {expanded ? 'Show top 3 only' : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  )
}
