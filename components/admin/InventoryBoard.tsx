'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Category, Product, VelocityTier } from '@/types/index'

interface InventoryRow extends Product {
  days_remaining: number | null
  profit_30d: number
  revenue_30d: number
  status: 'restock' | 'soon' | 'ok'
}

interface Stats {
  total_skus: number
  needing_restock: number
  order_soon: number
  ok: number
}

const STATUS_BADGE: Record<InventoryRow['status'], string> = {
  restock: '🔴 Restock needed',
  soon: '🟡 Order soon',
  ok: '🟢 OK',
}

const TIER_BADGE: Record<VelocityTier, string> = {
  bestseller: '🔥 Bestseller',
  normal: '📦 Normal',
  slow_mover: '🐌 Slow mover',
}

type Filter = 'all' | 'restock' | 'bestsellers' | 'slow_movers'

export function InventoryBoard() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [categoryFilter, setCategoryFilter] = useState('')

  useEffect(() => {
    fetch('/api/admin/inventory')
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? [])
        setStats(d.stats ?? null)
        setCategories(d.categories ?? [])
      })
  }, [])

  const filteredRows = useMemo(() => {
    let result = [...rows]
    if (filter === 'restock') result = result.filter((r) => r.status === 'restock')
    if (filter === 'bestsellers') result = result.filter((r) => r.velocity_tier === 'bestseller')
    if (filter === 'slow_movers') result = result.filter((r) => r.velocity_tier === 'slow_mover')
    if (categoryFilter) result = result.filter((r) => r.category_id === categoryFilter)

    return result.sort((a, b) => {
      if (a.days_remaining === null) return 1
      if (b.days_remaining === null) return -1
      return a.days_remaining - b.days_remaining
    })
  }, [rows, filter, categoryFilter])

  const investMore = rows.filter((r) => r.velocity_tier === 'bestseller' && (r.days_remaining ?? Infinity) < 14 && r.avg_daily_units > 0)
  const watch = rows.filter((r) => r.revenue_30d > 0 && r.profit_30d / r.revenue_30d < 0.3 && r.velocity_tier !== 'slow_mover')
  const cut = rows.filter((r) => r.velocity_tier === 'slow_mover' && (r.days_remaining ?? 0) > 30 && r.profit_30d <= 0)

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <StatTile label="Total SKUs" value={stats.total_skus} />
          <StatTile label="🔴 Restock needed" value={stats.needing_restock} />
          <StatTile label="🟡 Order soon" value={stats.order_soon} />
          <StatTile label="🟢 OK" value={stats.ok} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'restock', 'bestsellers', 'slow_movers'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${filter === f ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-700'}`}
          >
            {f === 'all' ? 'All' : f === 'restock' ? 'Restock needed' : f === 'bestsellers' ? 'Bestsellers' : 'Slow movers'}
          </button>
        ))}
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Days left</th>
              <th className="px-3 py-2">Avg/day</th>
              <th className="px-3 py-2">Profit 30d</th>
              <th className="px-3 py-2">Revenue 30d</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-t border-neutral-100">
                <td className="px-3 py-2">
                  <p className="font-medium">{row.name}</p>
                  <p className="text-neutral-600">{row.brand}</p>
                </td>
                <td className="px-3 py-2">{STATUS_BADGE[row.status]}</td>
                <td className="px-3 py-2">{TIER_BADGE[row.velocity_tier]}</td>
                <td className="px-3 py-2">{row.stock_qty}</td>
                <td className="px-3 py-2">{row.days_remaining !== null ? row.days_remaining.toFixed(1) : '—'}</td>
                <td className="px-3 py-2">{row.avg_daily_units.toFixed(2)}</td>
                <td className="px-3 py-2">${row.profit_30d.toFixed(2)}</td>
                <td className="px-3 py-2">${row.revenue_30d.toFixed(2)}</td>
                <td className="px-3 py-2">
                  <a href={`/admin/products#product-${row.id}`} className="text-blue-600">
                    ➕ New batch
                  </a>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-neutral-600">
                  No products match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StrategyColumn title="🟢 Invest more" rows={investMore} />
        <StrategyColumn title="🟡 Watch" rows={watch} />
        <StrategyColumn title="🔴 Cut" rows={cut} />
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs text-neutral-600">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  )
}

function StrategyColumn({ title, rows }: { title: string; rows: InventoryRow[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="flex flex-col gap-1 text-xs">
        {rows.map((r) => (
          <li key={r.id}>{r.name}</li>
        ))}
        {rows.length === 0 && <li className="text-neutral-600">None right now.</li>}
      </ul>
    </div>
  )
}
