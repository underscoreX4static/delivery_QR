'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTelegram } from '@/components/client/TelegramProvider'
import { useCart } from '@/components/client/useCart'
import { Onboarding } from '@/components/client/Onboarding'
import { Catalogue, type CatalogueCategory } from '@/components/client/Catalogue'
import { CartSheet } from '@/components/client/CartSheet'
import { Checkout } from '@/components/client/Checkout'
import { OrderConfirmation } from '@/components/client/OrderConfirmation'
import type { User } from '@/types/index'

type View = 'loading' | 'onboarding' | 'catalogue' | 'cart' | 'checkout' | 'confirmation' | 'error'

export function OrderApp({ qrSlugFromUrl }: { qrSlugFromUrl: string | null }) {
  const { ready, initData, apiFetch } = useTelegram()
  const [view, setView] = useState<View>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [categories, setCategories] = useState<CatalogueCategory[]>([])
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const cart = useCart(user?.telegram_id ?? null, qrSlugFromUrl)

  const loadCatalogue = useCallback(async () => {
    const res = await apiFetch('/api/client/catalogue')
    if (!res.ok) throw new Error('Failed to load catalogue')
    const data = await res.json()
    setCategories(data.categories)
  }, [apiFetch])

  useEffect(() => {
    if (!ready) return

    if (!initData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time redirect once we know Telegram initData never arrived
      setErrorMessage('Open this from the HAZE Delivery Telegram bot to place an order.')
      setView('error')
      return
    }

    ;(async () => {
      try {
        const res = await apiFetch('/api/client/me')
        if (!res.ok) throw new Error('auth failed')
        const data = await res.json()
        setUser(data.user)

        if (data.needs_onboarding) {
          setView('onboarding')
        } else {
          await loadCatalogue()
          setView('catalogue')
        }
      } catch {
        setErrorMessage('Something went wrong loading your profile. Please reopen from Telegram.')
        setView('error')
      }
    })()
  }, [ready, initData, apiFetch, loadCatalogue])

  const handleOnboarded = useCallback(
    async (updatedUser: User) => {
      setUser(updatedUser)
      await loadCatalogue()
      setView('catalogue')
    },
    [loadCatalogue]
  )

  if (view === 'loading') {
    return <CenteredMessage text="Loading HAZE Delivery…" />
  }

  if (view === 'error') {
    return <CenteredMessage text={errorMessage ?? 'Something went wrong.'} />
  }

  if (view === 'onboarding' && user) {
    return <Onboarding user={user} onDone={handleOnboarded} />
  }

  if (view === 'confirmation' && confirmedOrderId) {
    return (
      <OrderConfirmation
        orderId={confirmedOrderId}
        onDone={() => {
          cart.clear()
          setView('catalogue')
          setConfirmedOrderId(null)
        }}
      />
    )
  }

  if (view === 'checkout' && user) {
    return (
      <Checkout
        user={user}
        qrSlug={qrSlugFromUrl}
        cartItems={cart.items}
        onBack={() => setView('cart')}
        onOrderPlaced={(orderId) => {
          setConfirmedOrderId(orderId)
          setView('confirmation')
        }}
      />
    )
  }

  if (view === 'cart') {
    return (
      <CartSheet
        categories={categories}
        cart={cart}
        onBack={() => setView('catalogue')}
        onCheckout={() => setView('checkout')}
      />
    )
  }

  return (
    <Catalogue
      categories={categories}
      cart={cart}
      onOpenCart={() => setView('cart')}
    />
  )
}

function CenteredMessage({ text }: { text: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 text-center text-neutral-600">
      {text}
    </div>
  )
}
