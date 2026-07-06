'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CartLineItem } from '@/types/index'

const TTL_MS = 24 * 60 * 60 * 1000

interface CartStorage {
  items: CartLineItem[]
  expiresAt: number
}

function cartKey(telegramUserId: string, qrSlug: string) {
  return `cart_${telegramUserId}_${qrSlug}`
}

function readCart(key: string): CartLineItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed: CartStorage = JSON.parse(raw)
    if (Date.now() > parsed.expiresAt) {
      window.localStorage.removeItem(key)
      return []
    }
    return parsed.items
  } catch {
    return []
  }
}

function writeCart(key: string, items: CartLineItem[]) {
  const payload: CartStorage = { items, expiresAt: Date.now() + TTL_MS }
  window.localStorage.setItem(key, JSON.stringify(payload))
}

export function useCart(telegramUserId: string | null, qrSlug: string | null) {
  const key = telegramUserId ? cartKey(telegramUserId, qrSlug ?? 'direct') : null
  const [items, setItems] = useState<CartLineItem[]>([])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage when the cart key becomes available
    if (key) setItems(readCart(key))
  }, [key])

  const persist = useCallback(
    (next: CartLineItem[]) => {
      setItems(next)
      if (key) writeCart(key, next)
    },
    [key]
  )

  const addItem = useCallback(
    (productId: string, quantity = 1) => {
      persist(
        (() => {
          const existing = items.find((i) => i.product_id === productId)
          if (existing) {
            return items.map((i) =>
              i.product_id === productId ? { ...i, quantity: i.quantity + quantity } : i
            )
          }
          return [...items, { product_id: productId, quantity }]
        })()
      )
    },
    [items, persist]
  )

  const setQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (quantity <= 0) {
        persist(items.filter((i) => i.product_id !== productId))
        return
      }
      persist(items.map((i) => (i.product_id === productId ? { ...i, quantity } : i)))
    },
    [items, persist]
  )

  const clear = useCallback(() => persist([]), [persist])

  const totalCount = items.reduce((sum, i) => sum + i.quantity, 0)

  return { items, addItem, setQuantity, clear, totalCount }
}
