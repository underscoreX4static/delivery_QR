'use client'

import { useEffect, useRef, useState } from 'react'
import type { OrderMessage } from '@/types/index'

export function AdminChatPanel({ orderId }: { orderId: string }) {
  const [messages, setMessages] = useState<OrderMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      const res = await fetch(`/api/admin/orders/${orderId}/messages`)
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
  }, [orderId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!text.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessages((prev) => [...prev, data.message])
        setText('')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mt-3 rounded-lg bg-page-bg p-3">
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {messages.length === 0 && <p className="text-xs text-muted">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender_role === 'owner' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-xl px-2.5 py-1.5 text-xs ${
                m.sender_role === 'owner' ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface text-foreground'
              }`}
            >
              <span className="mr-1 font-semibold uppercase">{m.sender_role}:</span>
              {m.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Reply…"
          className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}
