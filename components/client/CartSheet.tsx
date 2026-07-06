'use client'

import type { CatalogueCategory } from '@/components/client/Catalogue'
import type { useCart } from '@/components/client/useCart'

export function CartSheet({
  categories,
  cart,
  onBack,
  onCheckout,
}: {
  categories: CatalogueCategory[]
  cart: ReturnType<typeof useCart>
  onBack: () => void
  onCheckout: () => void
}) {
  const allProducts = categories.flatMap((c) => c.products)

  const lines = cart.items
    .map((item) => {
      const product = allProducts.find((p) => p.id === item.product_id)
      if (!product) return null
      return { product, quantity: item.quantity }
    })
    .filter((l): l is { product: (typeof allProducts)[number]; quantity: number } => l !== null)

  const estimatedSubtotal = lines.reduce((sum, l) => sum + l.product.current_price * l.quantity, 0)

  return (
    <div className="flex min-h-dvh flex-col p-4">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-neutral-500">
          ← Back
        </button>
        <h1 className="text-lg font-semibold">Your cart</h1>
      </div>

      {lines.length === 0 ? (
        <p className="py-12 text-center text-sm text-neutral-500">Your cart is empty.</p>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          {lines.map(({ product, quantity }) => (
            <div key={product.id} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3">
              <div>
                <p className="text-sm font-medium">{product.name}</p>
                <p className="text-xs text-neutral-500">${product.current_price.toFixed(2)} each</p>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-neutral-100">
                <button
                  onClick={() => cart.setQuantity(product.id, quantity - 1)}
                  className="px-3 py-1.5 text-sm font-semibold"
                >
                  −
                </button>
                <span className="text-sm font-medium">{quantity}</span>
                <button
                  onClick={() => cart.setQuantity(product.id, quantity + 1)}
                  className="px-3 py-1.5 text-sm font-semibold"
                >
                  +
                </button>
              </div>
            </div>
          ))}

          <div className="mt-2 flex justify-between border-t border-neutral-200 pt-3 text-sm font-medium">
            <span>Estimated subtotal</span>
            <span>${estimatedSubtotal.toFixed(2)}</span>
          </div>
          <p className="text-xs text-neutral-400">
            Final pricing (delivery fee, discounts, exact batch prices) is confirmed at checkout.
          </p>

          <button
            onClick={onCheckout}
            className="mt-auto rounded-xl bg-black py-3 text-center font-medium text-white"
          >
            Proceed to checkout
          </button>
        </div>
      )}
    </div>
  )
}
