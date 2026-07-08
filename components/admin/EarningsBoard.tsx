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
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${period === tab.key ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-700'}`}
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
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-xs text-neutral-600">Owner net (avant pool)</p>
            <p className="text-2xl font-semibold">${summary.ownerNet.toFixed(2)}</p>
            <p className="mt-1 text-xs text-amber-700">− ${summary.bonusPoolContributions.toFixed(2)} mis dans le pool livreurs</p>
          </div>
          <div className="rounded-xl border border-neutral-900 bg-neutral-900 p-4 text-white">
            <p className="text-xs text-neutral-400">Dans la poche</p>
            <p className="text-2xl font-semibold">${summary.ownerTakeHome.toFixed(2)}</p>
            <p className="mt-1 text-xs text-neutral-400">Ce qui te reste après avoir financé le pool</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Revenue — last 14 days</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="#171717" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs text-neutral-600">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}
