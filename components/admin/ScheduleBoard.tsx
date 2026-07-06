'use client'

import { Fragment, useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface ScheduleData {
  heatmap: number[][]
  by_hour: number[]
  by_weekday: number[]
  total: number
}

export function ScheduleBoard() {
  const [data, setData] = useState<ScheduleData | null>(null)

  useEffect(() => {
    fetch('/api/admin/schedule').then((r) => r.json()).then(setData)
  }, [])

  if (!data) return <p className="text-sm text-neutral-600">Loading…</p>

  const max = Math.max(1, ...data.heatmap.flat())
  const weekdayChartData = WEEKDAY_LABELS.map((label, i) => ({ day: label, orders: data.by_weekday[i] }))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-neutral-600">{data.total} orders in the last 30 days</p>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Hourly heatmap</h2>
        <div className="inline-grid grid-cols-[auto_repeat(24,minmax(20px,1fr))] gap-0.5 text-[9px]">
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center text-neutral-600">
              {h}
            </div>
          ))}
          {WEEKDAY_LABELS.map((label, dayIndex) => (
            <Fragment key={dayIndex}>
              <div className="pr-2 text-neutral-600">{label}</div>
              {data.heatmap[dayIndex].map((count, hour) => {
                const intensity = count / max
                return (
                  <div
                    key={`${dayIndex}-${hour}`}
                    title={`${label} ${hour}:00 — ${count} orders`}
                    className="aspect-square rounded-sm"
                    style={{ backgroundColor: `rgba(23, 23, 23, ${count === 0 ? 0.05 : 0.15 + intensity * 0.85})` }}
                  />
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Orders by day of week</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdayChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="orders" fill="#171717" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
