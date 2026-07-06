'use client'

import { useEffect, useState } from 'react'
import { useTelegram } from '@/components/client/TelegramProvider'
import type { CartLineItem, CartPreview, User } from '@/types/index'

type Step = 'address' | 'time' | 'review'

interface StoreStatus {
  is_open: boolean
  slots: { label: string; value: string }[]
}

export function Checkout({
  user,
  qrSlug,
  cartItems,
  onBack,
  onOrderPlaced,
}: {
  user: User
  qrSlug: string | null
  cartItems: CartLineItem[]
  onBack: () => void
  onOrderPlaced: (orderId: string) => void
}) {
  const { apiFetch } = useTelegram()
  const [step, setStep] = useState<Step>('address')
  const [address, setAddress] = useState(user.default_address ?? '')
  const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null)
  const [scheduledAt, setScheduledAt] = useState<string | null>(null)
  const [preview, setPreview] = useState<CartPreview | null>(null)
  const [codConfirmed, setCodConfirmed] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (step === 'time' && !storeStatus) {
      apiFetch('/api/client/store-status')
        .then((r) => r.json())
        .then((data: StoreStatus) => {
          setStoreStatus(data)
          if (!data.is_open && data.slots.length > 0) setScheduledAt(data.slots[0].value)
        })
    }
  }, [step, storeStatus, apiFetch])

  useEffect(() => {
    if (step === 'review' && !preview) {
      apiFetch('/api/cart/preview', {
        method: 'POST',
        body: JSON.stringify({ items: cartItems }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) setError(data.error)
          else setPreview(data)
        })
    }
  }, [step, preview, cartItems, apiFetch])

  const placeOrder = async () => {
    setPlacing(true)
    setError(null)
    try {
      const res = await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cartItems,
          delivery_address: address,
          scheduled_at: scheduledAt,
          qr_slug: qrSlug,
          confirmed_cod: codConfirmed,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to place order')
      onOrderPlaced(data.order.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order')
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col p-4">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={step === 'address' ? onBack : () => goBack(step, setStep)} className="text-sm text-neutral-500">
          ← Back
        </button>
        <h1 className="text-lg font-semibold">Checkout</h1>
      </div>

      {step === 'address' && (
        <div className="flex flex-1 flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Delivery address
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-base"
            />
          </label>
          <button
            disabled={!address.trim()}
            onClick={() => setStep('time')}
            className="mt-auto rounded-xl bg-black py-3 text-center font-medium text-white disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {step === 'time' && (
        <div className="flex flex-1 flex-col gap-4">
          {!storeStatus ? (
            <p className="text-sm text-neutral-500">Loading store hours…</p>
          ) : (
            <>
              {storeStatus.is_open ? (
                <label className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3">
                  <input
                    type="radio"
                    checked={scheduledAt === null}
                    onChange={() => setScheduledAt(null)}
                  />
                  <span className="text-sm font-medium">ASAP</span>
                </label>
              ) : (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  We&apos;re currently closed — pick a time slot for our next opening.
                </p>
              )}
              <div className="flex flex-col gap-2">
                {storeStatus.slots.map((slot) => (
                  <label
                    key={slot.value}
                    className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3"
                  >
                    <input
                      type="radio"
                      checked={scheduledAt === slot.value}
                      onChange={() => setScheduledAt(slot.value)}
                    />
                    <span className="text-sm font-medium">{slot.label}</span>
                  </label>
                ))}
              </div>
              <button
                onClick={() => setStep('review')}
                className="mt-auto rounded-xl bg-black py-3 text-center font-medium text-white"
              >
                Continue
              </button>
            </>
          )}
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-1 flex-col gap-4">
          {!preview ? (
            <p className="text-sm text-neutral-500">Confirming prices…</p>
          ) : (
            <>
              {preview.plan.split_batch_products.length > 0 && (
                <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  Heads up — some items are split across batches at slightly different prices:
                  <ul className="mt-2 list-disc pl-4">
                    {preview.plan.items.map((line, i) => (
                      <li key={i}>
                        {line.quantity} × ${line.unit_sell_price.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                <Row label="Subtotal" value={preview.subtotal} />
                <Row label="Delivery fee" value={preview.delivery_fee} />
                <Row label="Discount" value={-preview.discount} />
                <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1 font-semibold">
                  <span>Total</span>
                  <span>${preview.total.toFixed(2)}</span>
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={codConfirmed}
                  onChange={(e) => setCodConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                I will pay cash on delivery.
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                disabled={!codConfirmed || placing}
                onClick={placeOrder}
                className="mt-auto rounded-xl bg-black py-3 text-center font-medium text-white disabled:opacity-50"
              >
                {placing ? 'Placing order…' : 'Confirm order'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-500">{label}</span>
      <span>${value.toFixed(2)}</span>
    </div>
  )
}

function goBack(step: Step, setStep: (s: Step) => void) {
  if (step === 'time') setStep('address')
  if (step === 'review') setStep('time')
}
