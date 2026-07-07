'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Category, Product } from '@/types/index'
import type { useCart } from '@/components/client/useCart'
import { StoreStatusBanner } from '@/components/client/StoreStatusBanner'

export interface CatalogueProduct extends Product {
  current_price: number | null
}

export interface CatalogueCategory extends Category {
  products: CatalogueProduct[]
}

type SortOption = 'default' | 'price_asc' | 'price_desc' | 'name_asc'

interface FlatProduct extends CatalogueProduct {
  categoryId: string
  categoryName: string
}

export function Catalogue({
  categories,
  cart,
  onOpenCart,
  onViewOrders,
}: {
  categories: CatalogueCategory[]
  cart: ReturnType<typeof useCart>
  onOpenCart: () => void
  onViewOrders: () => void
}) {
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('default')
  const [activeBrand, setActiveBrand] = useState<string>('all')

  // Flatten every category's products into one list, tagging each with its category.
  const allProducts: FlatProduct[] = useMemo(
    () =>
      categories.flatMap((category) =>
        category.products.map((product) => ({ ...product, categoryId: category.id, categoryName: category.name }))
      ),
    [categories]
  )

  // Hide category tabs that have no products at all, so the tab bar isn't cluttered with empties.
  const visibleCategories = useMemo(
    () => categories.filter((c) => c.products.length > 0),
    [categories]
  )

  // Brand pills are scoped to whichever category is active, so they never offer a brand with 0 results in context.
  const brands = useMemo(() => {
    const scoped = activeCategory === 'all' ? allProducts : allProducts.filter((p) => p.categoryId === activeCategory)
    return [...new Set(scoped.map((p) => p.brand).filter((b): b is string => Boolean(b)))].sort()
  }, [allProducts, activeCategory])

  // Guard: if the active category disappears (e.g. last product in it sells out and the
  // API stops returning it) or the active brand is no longer offered, fall back to "all"
  // instead of silently rendering an empty grid.
  useEffect(() => {
    if (activeCategory !== 'all' && !visibleCategories.some((c) => c.id === activeCategory)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset an invalidated selection, not a render loop
      setActiveCategory('all')
    }
  }, [activeCategory, visibleCategories])

  useEffect(() => {
    if (activeBrand !== 'all' && !brands.includes(activeBrand)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset an invalidated selection, not a render loop
      setActiveBrand('all')
    }
  }, [activeBrand, brands])

  const filtered = useMemo(() => {
    let result = allProducts

    if (activeCategory !== 'all') result = result.filter((p) => p.categoryId === activeCategory)

    if (search.trim()) {
      const query = search.trim().toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.brand ?? '').toLowerCase().includes(query) ||
          (p.description ?? '').toLowerCase().includes(query)
      )
    }

    if (activeBrand !== 'all') result = result.filter((p) => p.brand === activeBrand)

    result = [...result].sort((a, b) => {
      if (sort === 'price_asc') return (a.current_price ?? Infinity) - (b.current_price ?? Infinity)
      if (sort === 'price_desc') return (b.current_price ?? -Infinity) - (a.current_price ?? -Infinity)
      if (sort === 'name_asc') return a.name.localeCompare(b.name)
      return 0
    })

    // Out-of-stock items always sink to the bottom, regardless of the chosen sort.
    const inStock = result.filter((p) => p.current_price !== null)
    const outOfStock = result.filter((p) => p.current_price === null)
    return [...inStock, ...outOfStock]
  }, [allProducts, activeCategory, search, activeBrand, sort])

  const hasActiveFilters = activeCategory !== 'all' || search.trim() !== '' || activeBrand !== 'all' || sort !== 'default'

  const clearFilters = () => {
    setActiveCategory('all')
    setSearch('')
    setSort('default')
    setActiveBrand('all')
  }

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-neutral-50/95 px-4 py-4 backdrop-blur">
        <h1 className="text-lg font-semibold">HAZE Delivery</h1>
        <button
          onClick={onViewOrders}
          className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white"
        >
          📦 My orders
        </button>
      </header>

      <StoreStatusBanner />

      <div className="sticky top-[60px] z-10 bg-neutral-50/95 px-4 pb-2 backdrop-blur">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-2">
        <CategoryPill label="All" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} />
        {visibleCategories.map((c) => (
          <CategoryPill key={c.id} label={c.name} active={activeCategory === c.id} onClick={() => setActiveCategory(c.id)} />
        ))}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto px-4 pb-3">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="shrink-0 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs"
        >
          <option value="default">Sort: default</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="name_asc">Name: A–Z</option>
        </select>
        {brands.map((brand) => (
          <CategoryPill key={brand} label={brand} active={activeBrand === brand} onClick={() => setActiveBrand(activeBrand === brand ? 'all' : brand)} small />
        ))}
      </div>

      <div className="flex items-center justify-between px-4 pb-2 text-xs text-neutral-600">
        <span>
          {filtered.length} product{filtered.length !== 1 ? 's' : ''}
        </span>
        {hasActiveFilters && (
          <button onClick={clearFilters} className="font-medium text-blue-600">
            Clear filters
          </button>
        )}
      </div>

      <div className="px-4">
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-neutral-600">No products match your filters.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              quantity={cart.items.find((i) => i.product_id === product.id)?.quantity ?? 0}
              onAdd={() => cart.addItem(product.id)}
              onSetQuantity={(qty) => cart.setQuantity(product.id, qty)}
            />
          ))}
        </div>
      </div>

      {cart.totalCount > 0 && (
        <button
          onClick={onOpenCart}
          className="fixed inset-x-4 bottom-4 rounded-xl bg-black py-3 text-center font-medium text-white shadow-lg"
        >
          View cart · {cart.totalCount} item{cart.totalCount > 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}

function CategoryPill({
  label,
  active,
  onClick,
  small,
}: {
  label: string
  active: boolean
  onClick: () => void
  small?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full font-medium ${small ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'} ${
        active ? 'bg-blue-600 text-white' : 'bg-white text-neutral-700 border border-neutral-200'
      }`}
    >
      {label}
    </button>
  )
}

function ProductCard({
  product,
  quantity,
  onAdd,
  onSetQuantity,
}: {
  product: FlatProduct
  quantity: number
  onAdd: () => void
  onSetQuantity: (qty: number) => void
}) {
  const outOfStock = product.current_price === null

  return (
    <div className={`rounded-xl border border-neutral-200 bg-white p-3 ${outOfStock ? 'opacity-50' : ''}`}>
      {product.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.image_url} alt={product.name} className="mb-2 h-24 w-full rounded-lg object-cover" />
      )}
      <p className="text-sm font-medium leading-tight">{product.name}</p>
      {product.brand && <p className="text-xs text-neutral-600">{product.brand}</p>}
      <p className="mt-1 text-sm font-semibold">
        {outOfStock ? 'Out of stock' : `$${product.current_price!.toFixed(2)}`}
      </p>

      {outOfStock ? (
        <button disabled className="mt-2 w-full cursor-not-allowed rounded-lg bg-neutral-100 py-1.5 text-xs font-medium text-neutral-600">
          Unavailable
        </button>
      ) : quantity === 0 ? (
        <button onClick={onAdd} className="mt-2 w-full rounded-lg bg-black py-1.5 text-xs font-medium text-white">
          Add
        </button>
      ) : (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-neutral-100">
          <button onClick={() => onSetQuantity(quantity - 1)} className="px-3 py-1.5 text-sm font-semibold">
            −
          </button>
          <span className="text-sm font-medium">{quantity}</span>
          <button onClick={() => onSetQuantity(quantity + 1)} className="px-3 py-1.5 text-sm font-semibold">
            +
          </button>
        </div>
      )}
    </div>
  )
}
