'use client'

import type { Category, Product } from '@/types/index'
import type { useCart } from '@/components/client/useCart'

export interface CatalogueProduct extends Product {
  current_price: number
}

export interface CatalogueCategory extends Category {
  products: CatalogueProduct[]
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
  return (
    <div className="pb-24">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-neutral-50/95 px-4 py-4 backdrop-blur">
        <h1 className="text-lg font-semibold">HAZE Delivery</h1>
        <button onClick={onViewOrders} className="text-sm font-medium text-neutral-600">
          My orders
        </button>
      </header>

      <div className="flex flex-col gap-6 px-4">
        {categories.length === 0 && (
          <p className="py-12 text-center text-sm text-neutral-600">No products available right now.</p>
        )}
        {categories.map((category) => (
          <section key={category.id}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-600">
              {category.name}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {category.products.map((product) => {
                const qty = cart.items.find((i) => i.product_id === product.id)?.quantity ?? 0
                return (
                  <div key={product.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                    {product.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="mb-2 h-24 w-full rounded-lg object-cover"
                      />
                    )}
                    <p className="text-sm font-medium leading-tight">{product.name}</p>
                    {product.brand && <p className="text-xs text-neutral-600">{product.brand}</p>}
                    <p className="mt-1 text-sm font-semibold">${product.current_price.toFixed(2)}</p>

                    {qty === 0 ? (
                      <button
                        onClick={() => cart.addItem(product.id)}
                        className="mt-2 w-full rounded-lg bg-black py-1.5 text-xs font-medium text-white"
                      >
                        Add
                      </button>
                    ) : (
                      <div className="mt-2 flex items-center justify-between rounded-lg bg-neutral-100">
                        <button
                          onClick={() => cart.setQuantity(product.id, qty - 1)}
                          className="px-3 py-1.5 text-sm font-semibold"
                        >
                          −
                        </button>
                        <span className="text-sm font-medium">{qty}</span>
                        <button
                          onClick={() => cart.setQuantity(product.id, qty + 1)}
                          className="px-3 py-1.5 text-sm font-semibold"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
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
