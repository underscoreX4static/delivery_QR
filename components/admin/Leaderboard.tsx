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
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-base font-semibold text-foreground">{title}</h2>
        <div className="flex gap-0.5 rounded-lg bg-border p-0.5 text-xs">
          <button
            onClick={() => setView('total')}
            className={`rounded-md px-2 py-1 font-medium ${view === 'total' ? 'bg-surface text-foreground shadow-sm' : 'text-muted'}`}
          >
            By total
          </button>
          <button
            onClick={() => setView('rate')}
            className={`rounded-md px-2 py-1 font-medium ${view === 'rate' ? 'bg-surface text-foreground shadow-sm' : 'text-muted'}`}
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
            className="flex items-center justify-between rounded-lg border border-border p-2 text-xs hover:bg-page-bg"
          >
            <div className="flex items-center gap-2">
              <span className="w-5 text-center font-semibold text-muted/70">{i + 1}</span>
              <span className="font-medium">{e.name}</span>
            </div>
            <div className="text-right">
              <p className="font-semibold">
                {e.count} {countLabel}
              </p>
              <p className="text-muted">
                {e.rate.toFixed(2)}/day · {e.daysActive}d active
              </p>
            </div>
          </Link>
        ))}
        {sorted.length === 0 && <p className="text-xs text-muted">No data yet.</p>}
      </div>

      {sorted.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full rounded-lg bg-border py-2 text-xs font-medium text-foreground"
        >
          {expanded ? 'Show top 3 only' : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  )
}
