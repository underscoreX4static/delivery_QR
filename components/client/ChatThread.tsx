'use client'

import { useEffect, useRef, useState } from 'react'
import { useTelegram } from '@/components/client/TelegramProvider'
import type { OrderMessage } from '@/types/index'

export function ChatThread({ orderId }: { orderId: string }) {
  const { ready, initData, apiFetch } = useTelegram()
  const [messages, setMessages] = useState<OrderMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ready || !initData) return

    let cancelled = false
    const poll = async () => {
      const res = await apiFetch(`/api/orders/${orderId}/messages`)
      if (!res.ok || cancelled) return
      const data = await res.json()
      if (!cancelled) setMessages(data.messages ?? [])
    }
    poll()
    const interval = setInterval(poll, 4000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [ready, initData, orderId, apiFetch])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!text.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/orders/${orderId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: text.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send message')
      setMessages((prev) => [...prev, data.message])
      setText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  if (!ready) return null
  if (!initData) {
    return <div className="flex min-h-dvh items-center justify-center p-6 text-center text-neutral-600">Open this from Telegram.</div>
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-neutral-200 bg-white px-4 py-3">
        <h1 className="text-sm font-semibold">Order #{orderId.slice(0, 8)} — Chat</h1>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && <p className="text-center text-sm text-neutral-600">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender_role === 'customer' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                m.sender_role === 'customer' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-900'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-4 text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 border-t border-neutral-200 bg-white p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message…"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}
