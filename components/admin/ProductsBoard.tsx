'use client'

import { useEffect, useState } from 'react'
import { BatchManager } from '@/components/admin/BatchManager'
import { CsvImportPanel } from '@/components/admin/CsvImportPanel'
import type { Category, Product } from '@/types/index'

interface AdminProduct extends Product {
  categories: { name: string } | null
  current_price: number | null
  batch_count: number
}

export function ProductsBoard() {
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)

  const loadProducts = () => fetch('/api/admin/products').then((r) => r.json()).then((d) => setProducts(d.products ?? []))
  const loadCategories = () => fetch('/api/admin/categories').then((r) => r.json()).then((d) => setCategories(d.categories ?? []))

  useEffect(() => {
    loadProducts()
    loadCategories()
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowNewForm((v) => !v)}
          className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white"
        >
          {showNewForm ? 'Close' : 'New product'}
        </button>
      </div>

      {showNewForm && (
        <NewProductForm
          categories={categories}
          onCreatedCategory={loadCategories}
          onCreated={() => {
            setShowNewForm(false)
            loadProducts()
          }}
        />
      )}

      <CsvImportPanel onImported={loadProducts} />

      <div className="flex flex-col gap-2">
        {products.map((product) => (
          <div key={product.id} id={`product-${product.id}`} className="rounded-xl border border-neutral-200 bg-white p-4 scroll-mt-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{product.name}</p>
                <p className="text-xs text-neutral-600">
                  {product.categories?.name ?? 'Uncategorized'}
                  {product.brand ? ` · ${product.brand}` : ''}
                </p>
              </div>
              <div className="text-right text-xs">
                <p className="font-medium">
                  {product.current_price !== null ? `$${product.current_price.toFixed(2)}` : 'No stock'}
                </p>
                <p className="text-neutral-600">{product.stock_qty} in stock</p>
              </div>
            </div>
            <button
              onClick={() => setExpandedId(expandedId === product.id ? null : product.id)}
              className="mt-2 text-xs font-medium text-blue-600"
            >
              {expandedId === product.id ? 'Hide batches' : `Manage batches (${product.batch_count})`}
            </button>
            {expandedId === product.id && (
              <BatchManager productId={product.id} targetMargin={product.target_margin} />
            )}
          </div>
        ))}
        {products.length === 0 && <p className="text-sm text-neutral-600">No products yet.</p>}
      </div>
    </div>
  )
}

function NewProductForm({
  categories,
  onCreatedCategory,
  onCreated,
}: {
  categories: Category[]
  onCreatedCategory: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [targetMargin, setTargetMargin] = useState('0.55')
  const [imageUrl, setImageUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const createCategory = async () => {
    if (!newCategoryName.trim()) return
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategoryName.trim() }),
    })
    const data = await res.json()
    if (res.ok) {
      setNewCategoryName('')
      setCategoryId(data.category.id)
      onCreatedCategory()
    }
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          brand: brand || null,
          subcategory: subcategory || null,
          category_id: categoryId,
          target_margin: Number(targetMargin),
          image_url: imageUrl || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create product')
      setName('')
      setBrand('')
      setSubcategory('')
      setImageUrl('')
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold">New product</h2>
      <div className="flex flex-wrap gap-2">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs" />
        <input placeholder="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs" />
        <input
          placeholder="Subcategory"
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-xs"
        />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-xs">
          <option value="">Select category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Target margin (0-1)"
          value={targetMargin}
          onChange={(e) => setTargetMargin(e.target.value)}
          className="w-32 rounded border border-neutral-300 px-2 py-1 text-xs"
        />
        <input
          placeholder="Image URL"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-xs"
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          placeholder="New category name"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 text-xs"
        />
        <button onClick={createCategory} className="rounded bg-neutral-100 px-2 py-1 text-xs">
          + Add category
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting || !name || !categoryId}
        className="mt-3 rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        Create product
      </button>
    </div>
  )
}
