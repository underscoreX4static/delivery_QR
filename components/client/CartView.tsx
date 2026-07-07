'use client'

import { useEffect, useState } from 'react'
import { useTelegram } from '@/components/client/TelegramProvider'
import { BRISBANE_SUBURBS } from '@/lib/zones'
import type { CatalogueCategory } from '@/components/client/Catalogue'
import type { useCart } from '@/components/client/useCart'
import type { CartLineItem, CartPreview, User } from '@/types/index'

type Step = 'cart' | 'address' | 'schedule' | 'cash' | 'review'

const STEPS: Step[] = ['cart', 'address', 'schedule', 'cash', 'review']
const STEP_LABELS: Record<Step, string> = {
  cart: 'Cart',
  address: 'Address',
  schedule: 'Schedule',
  cash: 'Cash on delivery',
  review: 'Review',
}

interface Thresholds {
  free_delivery_threshold: number
  discount_threshold: number
  discount_rate: number
  discount_threshold_2: number
  discount_rate_2: number
}

interface Slot {
  label: string
  value: string
  localHour: number
  localMin: number
  dayOffset: 0 | 1
  taken: boolean
}

interface StoreStatus {
  is_open: boolean
  next_open: string | null
  slots: Slot[]
}

const SCHEDULE_POLL_MS = 15_000

function formatSlotTime(hour: number, min: number): string {
  const period = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${min.toString().padStart(2, '0')} ${period}`
}

interface CheckoutDraft {
  street: string
  suburb: string
  scheduledAt: string | null
  codConfirmed: boolean
  savedAt: number
}

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

function draftKey(telegramUserId: string, qrSlug: string | null) {
  return `checkout_${telegramUserId}_${qrSlug ?? 'direct'}`
}

function readDraft(key: string): Omit<CheckoutDraft, 'savedAt'> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed: CheckoutDraft = JSON.parse(raw)
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      window.localStorage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function CartView({
  user,
  qrSlug,
  categories,
  cart,
  onBack,
  onOrderPlaced,
  onViewOrders,
}: {
  user: User
  qrSlug: string | null
  categories: CatalogueCategory[]
  cart: ReturnType<typeof useCart>
  onBack: () => void
  onOrderPlaced: (orderId: string) => void
  onViewOrders: () => void
}) {
  const { apiFetch } = useTelegram()
  const key = draftKey(user.telegram_id, qrSlug)
  const draft = readDraft(key)

  const [step, setStep] = useState<Step>('cart')
  const [street, setStreet] = useState(draft?.street ?? user.default_address ?? '')
  const [suburb, setSuburb] = useState(draft?.suburb ?? '')
  const [scheduleType, setScheduleType] = useState<'asap' | 'scheduled'>(draft?.scheduledAt ? 'scheduled' : 'asap')
  const [scheduledAt, setScheduledAt] = useState<string | null>(draft?.scheduledAt ?? null)
  const [codConfirmed, setCodConfirmed] = useState(draft?.codConfirmed ?? false)
  const [thresholds, setThresholds] = useState<Thresholds | null>(null)
  const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null)
  const [preview, setPreview] = useState<CartPreview | null>(null)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orderCapReached, setOrderCapReached] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const payload: CheckoutDraft = { street, suburb, scheduledAt, codConfirmed, savedAt: Date.now() }
    window.localStorage.setItem(key, JSON.stringify(payload))
  }, [key, street, suburb, scheduledAt, codConfirmed])

  // Pricing thresholds only need to be known once, for the cart step's
  // progress bars — the live-polling below is specifically for slot
  // availability while the user is actually on the schedule step.
  useEffect(() => {
    apiFetch('/api/client/store-status')
      .then((r) => r.json())
      .then(setThresholds)
  }, [apiFetch])

  // Slot availability can change while the customer is deciding (another
  // customer books the same slot), so this polls live — but only while this
  // step is actually visible; cleaned up the moment they navigate away.
  // Cache-bust query param backs up the no-store server headers, since
  // Telegram/Safari WebViews cache GETs aggressively regardless.
  useEffect(() => {
    if (step !== 'schedule') return

    let cancelled = false
    const poll = async () => {
      const res = await apiFetch(`/api/client/store-status?t=${Date.now()}`)
      const data: StoreStatus = await res.json()
      if (cancelled) return
      setStoreStatus(data)
      setScheduleType((prev) => (!data.is_open && prev === 'asap' ? 'scheduled' : prev))
    }
    poll()
    const interval = setInterval(poll, SCHEDULE_POLL_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') poll()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [step, apiFetch])

  // Re-resolve a slot saved from a previous session against the freshly
  // fetched list: if it no longer exists or is now taken, drop it silently —
  // never a blocking error, just back to "no slot selected".
  useEffect(() => {
    if (!storeStatus || scheduledAt === null) return
    const match = storeStatus.slots.find((s) => s.value === scheduledAt)
    if (!match || match.taken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- drop an invalidated saved slot, not a render loop
      setScheduledAt(null)
    }
  }, [storeStatus, scheduledAt])

  useEffect(() => {
    if (step === 'review' && !preview) {
      apiFetch('/api/cart/preview', { method: 'POST', body: JSON.stringify({ items: cart.items }) })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) setError(data.error)
          else setPreview(data)
        })
    }
  }, [step, preview, cart.items, apiFetch])

  const allProducts = categories.flatMap((c) => c.products)
  const lines = cart.items
    .map((item) => {
      const product = allProducts.find((p) => p.id === item.product_id)
      if (!product) return null
      return { product, quantity: item.quantity }
    })
    .filter((l): l is { product: (typeof allProducts)[number]; quantity: number } => l !== null)

  const estimatedSubtotal = lines.reduce((sum, l) => sum + (l.product.current_price ?? 0) * l.quantity, 0)

  const suburbEntry = BRISBANE_SUBURBS.find((s) => s.suburb === suburb)
  const fullAddress = suburbEntry ? `${street.trim()}, ${suburbEntry.suburb} QLD ${suburbEntry.postcode}` : ''

  const stepIndex = STEPS.indexOf(step)
  const goNext = () => setStep(STEPS[stepIndex + 1])
  const goBack = () => {
    if (stepIndex === 0) onBack()
    else setStep(STEPS[stepIndex - 1])
  }

  const placeOrder = async (items: CartLineItem[]) => {
    setPlacing(true)
    setError(null)
    setOrderCapReached(false)
    try {
      const res = await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          items,
          delivery_address: fullAddress,
          scheduled_at: scheduledAt,
          qr_slug: qrSlug,
          confirmed_cod: codConfirmed,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 429) setOrderCapReached(true)
        throw new Error(data.error ?? 'Failed to place order')
      }
      window.localStorage.removeItem(key)
      onOrderPlaced(data.order.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order')
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col p-4">
      <div className="mb-3 flex items-center gap-3">
        <button onClick={goBack} className="text-sm text-neutral-600">
          ← Back
        </button>
        <h1 className="text-lg font-semibold">{STEP_LABELS[step]}</h1>
      </div>

      <StepIndicator current={step} />

      {step === 'cart' && (
        <div className="flex flex-1 flex-col gap-3">
          {thresholds && <ProgressBars subtotal={estimatedSubtotal} thresholds={thresholds} />}

          {lines.length === 0 ? (
            <p className="py-12 text-center text-sm text-neutral-600">Your cart is empty.</p>
          ) : (
            lines.map(({ product, quantity }) => (
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
                  <button onClick={() => cart.setQuantity(product.id, quantity - 1)} className="px-3 py-1.5 text-sm font-semibold">
                    −
                  </button>
                  <span className="text-sm font-medium">{quantity}</span>
                  <button onClick={() => cart.setQuantity(product.id, quantity + 1)} className="px-3 py-1.5 text-sm font-semibold">
                    +
                  </button>
                </div>
              </div>
            ))
          )}

          {lines.length > 0 && (
            <>
              <div className="mt-2 flex justify-between border-t border-neutral-200 pt-3 text-sm font-medium">
                <span>Estimated subtotal</span>
                <span>${estimatedSubtotal.toFixed(2)}</span>
              </div>
              <p className="text-xs text-neutral-600">
                Final pricing (delivery fee, discounts, exact batch prices) is confirmed at checkout.
              </p>
            </>
          )}

          <button
            onClick={goNext}
            disabled={lines.length === 0 || lines.some((l) => l.product.current_price === null)}
            className="mt-auto rounded-xl bg-black py-3 text-center font-medium text-white disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {step === 'address' && (
        <div className="flex flex-1 flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Street address
            <textarea
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              rows={2}
              placeholder="Unit / street number / street name"
              className="rounded-lg border border-neutral-300 px-3 py-3 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Suburb
            <select
              value={suburb}
              onChange={(e) => setSuburb(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-3 text-base"
            >
              <option value="">Select your suburb…</option>
              {BRISBANE_SUBURBS.map((s) => (
                <option key={`${s.suburb}-${s.postcode}`} value={s.suburb}>
                  {s.suburb} ({s.postcode})
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-neutral-600">
            We currently only deliver to Brisbane CBD and inner suburbs. Can&apos;t find yours? We probably don&apos;t
            cover it yet.
          </p>
          <button
            disabled={!street.trim() || !suburb}
            onClick={goNext}
            className="mt-auto rounded-xl bg-black py-3 text-center font-medium text-white disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {step === 'schedule' && (
        <div className="flex flex-1 flex-col gap-4">
          {!storeStatus ? (
            <p className="text-sm text-neutral-600">Loading store hours…</p>
          ) : (
            <>
              {!storeStatus.is_open && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  We&apos;re currently closed{storeStatus.next_open ? ` — opens ${storeStatus.next_open}` : ''}. Pick a
                  time slot below.
                </p>
              )}

              <div className="flex gap-2">
                {storeStatus.is_open && (
                  <button
                    onClick={() => {
                      setScheduleType('asap')
                      setScheduledAt(null)
                    }}
                    className={`flex-1 rounded-xl border p-3 text-left ${
                      scheduleType === 'asap' ? 'border-black bg-black text-white' : 'border-neutral-200 bg-white'
                    }`}
                  >
                    <span className="text-sm font-medium">ASAP</span>
                  </button>
                )}
                <button
                  onClick={() => setScheduleType('scheduled')}
                  className={`flex-1 rounded-xl border p-3 text-left ${
                    scheduleType === 'scheduled' ? 'border-black bg-black text-white' : 'border-neutral-200 bg-white'
                  }`}
                >
                  <span className="text-sm font-medium">Schedule for later</span>
                </button>
              </div>

              {scheduleType === 'scheduled' && (
                <div className="flex flex-col gap-3">
                  <SlotGroup
                    title="Today"
                    slots={storeStatus.slots.filter((s) => s.dayOffset === 0)}
                    selected={scheduledAt}
                    onSelect={setScheduledAt}
                  />
                  <SlotGroup
                    title="Tomorrow"
                    slots={storeStatus.slots.filter((s) => s.dayOffset === 1)}
                    selected={scheduledAt}
                    onSelect={setScheduledAt}
                  />
                  {storeStatus.slots.length === 0 && (
                    <p className="text-sm text-neutral-600">No slots available right now.</p>
                  )}
                </div>
              )}

              <button
                onClick={goNext}
                disabled={scheduleType === 'scheduled' && scheduledAt === null}
                className="mt-auto rounded-xl bg-black py-3 text-center font-medium text-white disabled:opacity-50"
              >
                Continue
              </button>
            </>
          )}
        </div>
      )}

      {step === 'cash' && (
        <div className="flex flex-1 flex-col gap-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-sm font-medium">This is a cash-on-delivery service.</p>
            <p className="mt-1 text-xs text-neutral-600">
              Please have exact change ready if possible when your driver arrives.
            </p>
          </div>
          <label className="flex items-start gap-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
            <input
              type="checkbox"
              checked={codConfirmed}
              onChange={(e) => setCodConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            I will pay cash on delivery.
          </label>
          <button
            disabled={!codConfirmed}
            onClick={goNext}
            className="mt-auto rounded-xl bg-black py-3 text-center font-medium text-white disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-1 flex-col gap-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
            <p className="font-medium">Delivering to</p>
            <p className="text-neutral-600">{fullAddress}</p>
          </div>

          {!preview ? (
            <p className="text-sm text-neutral-600">Confirming prices…</p>
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
                {preview.credit_applied > 0 && <Row label="Referral credit" value={-preview.credit_applied} />}
                <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1 font-semibold">
                  <span>Total</span>
                  <span>${preview.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
                💵 Paying cash on delivery — ${preview.total.toFixed(2)}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              {orderCapReached ? (
                <button
                  onClick={onViewOrders}
                  className="mt-auto rounded-xl bg-black py-3 text-center font-medium text-white"
                >
                  View my orders
                </button>
              ) : (
                <button
                  disabled={placing}
                  onClick={() => placeOrder(cart.items)}
                  className="mt-auto rounded-xl bg-black py-3 text-center font-medium text-white disabled:opacity-50"
                >
                  {placing ? 'Placing order…' : 'Confirm order'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SlotGroup({
  title,
  slots,
  selected,
  onSelect,
}: {
  title: string
  slots: Slot[]
  selected: string | null
  onSelect: (value: string) => void
}) {
  if (slots.length === 0) return null

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-neutral-600">{title}</p>
      <div className="grid grid-cols-3 gap-2">
        {slots.map((slot) => (
          <button
            key={slot.value}
            disabled={slot.taken}
            onClick={() => onSelect(slot.value)}
            className={`rounded-lg py-2 text-xs font-medium ${
              slot.taken
                ? 'cursor-not-allowed bg-neutral-100 text-neutral-400'
                : selected === slot.value
                  ? 'bg-black text-white'
                  : 'border border-neutral-300 bg-white text-neutral-900'
            }`}
          >
            {formatSlotTime(slot.localHour, slot.localMin)}
            {slot.taken ? ' · full' : ''}
          </button>
        ))}
      </div>
    </div>
  )
}

function StepIndicator({ current }: { current: Step }) {
  const currentIndex = STEPS.indexOf(current)
  return (
    <div className="mb-4 flex gap-1">
      {STEPS.map((s, i) => (
        <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= currentIndex ? 'bg-black' : 'bg-neutral-200'}`} />
      ))}
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-600">{label}</span>
      <span>${value.toFixed(2)}</span>
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
