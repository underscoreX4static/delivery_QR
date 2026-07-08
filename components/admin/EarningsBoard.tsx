'use client'

import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Period = 'today' | 'week' | 'month' | 'all'

interface EarningsSummary {
  orderCount: number
  grossRevenue: number
  grossProfit: number
  driverPayouts: number
  affiliateCommissions: number
  ownerNet: number
  bonusPoolContributions: number
  ownerTakeHome: number
}

interface DailyRevenuePoint {
  date: string
  revenue: number
}

const TABS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
]

export function EarningsBoard() {
  const [period, setPeriod] = useState<Period>('today')
  const [summary, setSummary] = useState<EarningsSummary | null>(null)
  const [series, setSeries] = useState<DailyRevenuePoint[]>([])

  useEffect(() => {
    fetch(`/api/admin/earnings?period=${period}`)
      .then((r) => r.json())
      .then((d) => {
        setSummary(d.summary)
        setSeries(d.series ?? [])
      })
  }, [period])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setPeriod(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${period === tab.key ? 'bg-primary text-primary-foreground' : 'bg-border text-muted hover:text-foreground'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatTile label="Orders" value={summary.orderCount.toString()} />
          <StatTile label="Gross revenue" value={`$${summary.grossRevenue.toFixed(2)}`} />
          <StatTile label="Gross profit" value={`$${summary.grossProfit.toFixed(2)}`} />
          <StatTile label="Driver payouts" value={`$${summary.driverPayouts.toFixed(2)}`} />
          <StatTile label="Affiliate commissions" value={`$${summary.affiliateCommissions.toFixed(2)}`} />
        </div>
      )}
      {summary && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <p className="text-xs text-muted">Owner net (avant pool)</p>
            <p className="text-2xl font-semibold text-foreground">${summary.ownerNet.toFixed(2)}</p>
            <p className="mt-1 text-xs text-warning">− ${summary.bonusPoolContributions.toFixed(2)} mis dans le pool livreurs</p>
          </div>
          <div className="rounded-xl border border-foreground bg-foreground p-4 text-background">
            <p className="text-xs text-background/60">Dans la poche</p>
            <p className="text-2xl font-semibold">${summary.ownerTakeHome.toFixed(2)}</p>
            <p className="mt-1 text-xs text-background/60">Ce qui te reste après avoir financé le pool</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Revenue — last 14 days</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5d8c8" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8c7a66' }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: '#8c7a66' }} />
              <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="#b54a2c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}
