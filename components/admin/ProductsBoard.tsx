'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BatchManager } from '@/components/admin/BatchManager'
import { CsvImportPanel } from '@/components/admin/CsvImportPanel'
import { Modal } from '@/components/admin/Modal'
import type { Category, Product } from '@/types/index'

interface AdminProduct extends Product {
  categories: { name: string } | null
  current_price: number | null
  batch_count: number
}

export function ProductsBoard() {
  const searchParams = useSearchParams()
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [batchesFor, setBatchesFor] = useState<AdminProduct | null>(null)
  const [editing, setEditing] = useState<AdminProduct | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)

  const loadProducts = () => fetch('/api/admin/products').then((r) => r.json()).then((d) => setProducts(d.products ?? []))
  const loadCategories = () => fetch('/api/admin/categories').then((r) => r.json()).then((d) => setCategories(d.categories ?? []))

  useEffect(() => {
    loadProducts()
    loadCategories()
  }, [])

  useEffect(() => {
    const productId = searchParams.get('product')
    if (productId && products.length > 0) {
      const match = products.find((p) => p.id === productId)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time deep-link open once products have loaded
      if (match) setBatchesFor(match)
    }
  }, [products, searchParams])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowNewForm(true)}
          className="rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:py-1.5 sm:text-xs"
        >
          New product
        </button>
      </div>

      <CsvImportPanel onImported={loadProducts} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onEdit={() => setEditing(product)}
            onManageBatches={() => setBatchesFor(product)}
          />
        ))}
        {products.length === 0 && <p className="col-span-full text-sm text-muted">No products yet.</p>}
      </div>

      {showNewForm && (
        <Modal title="New product" onClose={() => setShowNewForm(false)}>
          <ProductForm
            categories={categories}
            onCreatedCategory={loadCategories}
            onSaved={() => {
              setShowNewForm(false)
              loadProducts()
            }}
          />
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit — ${editing.name}`} onClose={() => setEditing(null)}>
          <ProductForm
            product={editing}
            categories={categories}
            onCreatedCategory={loadCategories}
            onSaved={() => {
              setEditing(null)
              loadProducts()
            }}
          />
        </Modal>
      )}

      {batchesFor && (
        <Modal title={`Batches — ${batchesFor.name}`} onClose={() => setBatchesFor(null)}>
          <BatchManager productId={batchesFor.id} targetMargin={batchesFor.target_margin} />
        </Modal>
      )}
    </div>
  )
}

function ProductCard({
  product,
  onEdit,
  onManageBatches,
}: {
  product: AdminProduct
  onEdit: () => void
  onManageBatches: () => void
}) {
  const stockColor =
    product.stock_qty > 10
      ? 'bg-success/15 text-success'
      : product.stock_qty > 4
        ? 'bg-warning/15 text-warning'
        : 'bg-danger/15 text-danger'

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="relative aspect-square">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-page-bg text-3xl">📦</div>
        )}
        <div className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold ${stockColor}`}>
          {product.stock_qty} left
        </div>
      </div>
      <div className="space-y-1 p-3">
        <p className="text-xs text-muted">
          {product.categories?.name ?? 'Uncategorized'}
          {product.subcategory ? ` · ${product.subcategory}` : ''}
        </p>
        {product.brand && <p className="text-xs text-muted">{product.brand}</p>}
        <p className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">{product.name}</p>
        <p className="text-base font-bold text-foreground">
          {product.current_price !== null ? `$${product.current_price.toFixed(2)}` : '—'}
        </p>
        <div className="flex gap-1 pt-1">
          <button onClick={onEdit} className="flex-1 rounded-lg bg-border py-2 text-xs font-medium text-foreground hover:bg-border/70">
            Edit
          </button>
          <button onClick={onManageBatches} className="flex-1 rounded-lg bg-primary py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90">
            + Batch
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductForm({
  product,
  categories,
  onCreatedCategory,
  onSaved,
}: {
  product?: AdminProduct
  categories: Category[]
  onCreatedCategory: () => void
  onSaved: () => void
}) {
  const isEditing = Boolean(product)
  const [name, setName] = useState(product?.name ?? '')
  const [brand, setBrand] = useState(product?.brand ?? '')
  const [subcategory, setSubcategory] = useState(product?.subcategory ?? '')
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [targetMargin, setTargetMargin] = useState(String(product?.target_margin ?? 0.55))
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? '')
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
      const body = {
        name,
        brand: brand || null,
        subcategory: subcategory || null,
        category_id: categoryId,
        target_margin: Number(targetMargin),
        image_url: imageUrl || null,
      }
      const res = await fetch(isEditing ? `/api/admin/products/${product!.id}` : '/api/admin/products', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save product')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-primary focus:outline-none" />
      </Field>
      <Field label="Brand">
        <input value={brand} onChange={(e) => setBrand(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-primary focus:outline-none" />
      </Field>
      <Field label="Subcategory">
        <input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-primary focus:outline-none" />
      </Field>
      <Field label="Category">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-primary focus:outline-none">
          <option value="">Select category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex items-center gap-2">
        <input
          placeholder="New category name"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-primary focus:outline-none"
        />
        <button onClick={createCategory} className="rounded-lg bg-border px-3 py-2 text-xs font-medium text-foreground hover:bg-border/70">
          + Add
        </button>
      </div>
      <Field label="Target margin (0-1)">
        <input value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-primary focus:outline-none" />
      </Field>
      <Field label="Image URL">
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground focus:border-primary focus:outline-none" />
      </Field>

      {error && <p className="text-xs text-danger">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting || !name || !categoryId}
        className="rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isEditing ? 'Save changes' : 'Create product'}
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      {children}
    </label>
  )
}
