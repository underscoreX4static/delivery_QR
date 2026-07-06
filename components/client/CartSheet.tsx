'use client'

import { useEffect, useState } from 'react'
import { useTelegram } from '@/components/client/TelegramProvider'
import type { CatalogueCategory } from '@/components/client/Catalogue'
import type { useCart } from '@/components/client/useCart'

interface Thresholds {
  free_delivery_threshold: number
  discount_threshold: number
  discount_rate: number
  discount_threshold_2: number
  discount_rate_2: number
}

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
  const { apiFetch } = useTelegram()
  const [thresholds, setThresholds] = useState<Thresholds | null>(null)

  useEffect(() => {
    apiFetch('/api/client/store-status')
      .then((r) => r.json())
      .then(setThresholds)
  }, [apiFetch])

  const allProducts = categories.flatMap((c) => c.products)

  const lines = cart.items
    .map((item) => {
      const product = allProducts.find((p) => p.id === item.product_id)
      if (!product) return null
      return { product, quantity: item.quantity }
    })
    .filter((l): l is { product: (typeof allProducts)[number]; quantity: number } => l !== null)

  const estimatedSubtotal = lines.reduce((sum, l) => sum + (l.product.current_price ?? 0) * l.quantity, 0)

  return (
    <div className="flex min-h-dvh flex-col p-4">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-neutral-600">
          ← Back
        </button>
        <h1 className="text-lg font-semibold">Your cart</h1>
      </div>

      {lines.length === 0 ? (
        <p className="py-12 text-center text-sm text-neutral-600">Your cart is empty.</p>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          {thresholds && <ProgressBars subtotal={estimatedSubtotal} thresholds={thresholds} />}

          {lines.map(({ product, quantity }) => (
            <div key={product.id} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3">
              <div>
                <p className="text-sm font-medium">{product.name}</p>
                {product.current_price !== null ? (
                  <p className="text-xs text-neutral-600">${product.current_price.toFixed(2)} each</p>
                ) : (
                  <p className="text-xs text-red-600">Just sold out — remove to continue</p>
                )}
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
          <p className="text-xs text-neutral-600">
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

function ProgressBars({ subtotal, thresholds }: { subtotal: number; thresholds: Thresholds }) {
  const {
    free_delivery_threshold: freeDeliveryThreshold,
    discount_threshold: discountThreshold1,
    discount_threshold_2: discountThreshold2,
  } = thresholds

  const isFreeDelivery = subtotal >= freeDeliveryThreshold

  return (
    <div className="flex flex-col gap-2">
      {!isFreeDelivery ? (
        <div className="space-y-2 rounded-2xl bg-blue-50 px-4 py-3">
          <div className="flex justify-between text-xs text-blue-700">
            <span>
              🚚 Add <strong>${(freeDeliveryThreshold - subtotal).toFixed(2)}</strong> for free delivery
            </span>
            <span>
              ${subtotal.toFixed(2)} / ${freeDeliveryThreshold}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.min((subtotal / freeDeliveryThreshold) * 100, 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl bg-green-50 px-4 py-2.5 text-sm text-green-700">
          ✅ <strong>Free delivery unlocked!</strong>
        </div>
      )}

      {subtotal < discountThreshold1 && (
        <div className="space-y-2 rounded-2xl bg-purple-50 px-4 py-3">
          <div className="flex justify-between text-xs text-purple-700">
            <span>
              🎁 Add <strong>${(discountThreshold1 - subtotal).toFixed(2)}</strong> for 10% off
            </span>
            <span>
              ${subtotal.toFixed(2)} / ${discountThreshold1}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-purple-100">
            <div
              className="h-full rounded-full bg-purple-500 transition-all duration-300"
              style={{ width: `${Math.min((subtotal / discountThreshold1) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {subtotal >= discountThreshold1 && subtotal < discountThreshold2 && (
        <div className="space-y-1 rounded-2xl bg-purple-50 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-purple-700">
            🎉 <strong>10% discount unlocked!</strong>
          </div>
          <div className="text-xs text-purple-600">
            Add <strong>${(discountThreshold2 - subtotal).toFixed(2)}</strong> more for 15% off
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-purple-100">
            <div
              className="h-full rounded-full bg-purple-400 transition-all duration-300"
              style={{
                width: `${Math.min(((subtotal - discountThreshold1) / (discountThreshold2 - discountThreshold1)) * 100, 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {subtotal >= discountThreshold2 && (
        <div className="flex items-center gap-2 rounded-2xl bg-yellow-50 px-4 py-2.5 text-sm text-yellow-700">
          🏆 <strong>15% discount unlocked! You save ${(subtotal * thresholds.discount_rate_2).toFixed(2)}</strong>
        </div>
      )}
    </div>
  )
}
