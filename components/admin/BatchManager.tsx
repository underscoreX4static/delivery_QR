'use client'

import { useEffect, useState } from 'react'
import type { ProductBatch } from '@/types/index'

export function BatchManager({ productId, targetMargin }: { productId: string; targetMargin: number }) {
  const [batches, setBatches] = useState<ProductBatch[]>([])
  const [supplier, setSupplier] = useState('')
  const [quantity, setQuantity] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [sellPriceOverride, setSellPriceOverride] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suggestedSellPrice = (() => {
    const cost = Number(costPrice)
    return Number.isFinite(cost) && cost > 0 ? (cost / (1 - targetMargin)).toFixed(2) : ''
  })()
  const sellPrice = sellPriceOverride ?? suggestedSellPrice

  const load = () => fetch(`/api/admin/products/${productId}/batches`).then((r) => r.json()).then((d) => setBatches(d.batches ?? []))

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  const addBatch = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/products/${productId}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier: supplier || null,
          quantity: Number(quantity),
          cost_price: Number(costPrice),
          sell_price: sellPrice ? Number(sellPrice) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to add batch')
      setSupplier('')
      setQuantity('')
      setCostPrice('')
      setSellPriceOverride(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add batch')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 rounded-lg bg-neutral-50 p-3">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-neutral-600">
            <th className="py-1">Received</th>
            <th>Supplier</th>
            <th>Remaining</th>
            <th>Cost</th>
            <th>Sell</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id} className="border-t border-neutral-200">
              <td className="py-1">{new Date(b.received_at).toLocaleDateString()}</td>
              <td>{b.supplier ?? '—'}</td>
              <td>
                {b.quantity_remaining}/{b.quantity_total}
              </td>
              <td>${b.cost_price.toFixed(2)}</td>
              <td>${b.sell_price.toFixed(2)}</td>
              <td>{b.is_active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
          {batches.length === 0 && (
            <tr>
              <td colSpan={6} className="py-2 text-neutral-600">
                No batches yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Supplier">
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-32 rounded border border-neutral-300 px-2 py-1 text-xs" />
        </Field>
        <Field label="Quantity">
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-20 rounded border border-neutral-300 px-2 py-1 text-xs"
          />
        </Field>
        <Field label="Cost price">
          <input
            type="number"
            step="0.01"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            className="w-24 rounded border border-neutral-300 px-2 py-1 text-xs"
          />
        </Field>
        <Field label="Sell price">
          <input
            type="number"
            step="0.01"
            value={sellPrice}
            onChange={(e) => setSellPriceOverride(e.target.value)}
            className="w-24 rounded border border-neutral-300 px-2 py-1 text-xs"
          />
        </Field>
        <button
          onClick={addBatch}
          disabled={submitting || !quantity || !costPrice}
          className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Add batch
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-medium uppercase text-neutral-600">
      {label}
      {children}
    </label>
  )
}
