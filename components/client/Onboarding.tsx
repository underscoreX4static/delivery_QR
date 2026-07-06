'use client'

import { useState } from 'react'
import { useTelegram } from '@/components/client/TelegramProvider'
import type { User } from '@/types/index'

export function Onboarding({ user, onDone }: { user: User; onDone: (user: User) => void }) {
  const { apiFetch } = useTelegram()
  const [phone, setPhone] = useState(user.phone ?? '')
  const [address, setAddress] = useState(user.default_address ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch('/api/client/me', {
        method: 'POST',
        body: JSON.stringify({ phone, default_address: address }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      onDone(data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Welcome to HAZE Delivery 🛵</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Just need your phone and delivery address to get started.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Phone number
          <input
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-base"
            placeholder="04xx xxx xxx"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Delivery address
          <textarea
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-base"
            placeholder="Street address, suburb, postcode"
            rows={3}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-black py-3 text-center font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
