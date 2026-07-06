'use client'

import { createContext, useContext, useEffect, useState } from 'react'

interface TelegramWebApp {
  initData: string
  initDataUnsafe: {
    user?: { id: number; first_name: string; last_name?: string }
    start_param?: string
  }
  ready: () => void
  expand: () => void
  MainButton: { hide: () => void }
  themeParams: Record<string, string>
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp }
  }
}

interface TelegramContextValue {
  ready: boolean
  initData: string | null
  startParam: string | null
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>
}

const TelegramContext = createContext<TelegramContextValue | null>(null)

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [initData, setInitData] = useState<string | null>(null)
  const [startParam, setStartParam] = useState<string | null>(null)

  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (webApp) {
      webApp.ready()
      webApp.expand()
      webApp.MainButton?.hide?.()
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the injected Telegram SDK global on mount
      setInitData(webApp.initData || null)
      setStartParam(webApp.initDataUnsafe?.start_param ?? null)
    }
    setReady(true)
  }, [])

  const apiFetch: TelegramContextValue['apiFetch'] = (input, init) => {
    const headers = new Headers(init?.headers)
    if (initData) headers.set('x-telegram-init-data', initData)
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    return fetch(input, { ...init, headers })
  }

  return (
    <TelegramContext.Provider value={{ ready, initData, startParam, apiFetch }}>
      {children}
    </TelegramContext.Provider>
  )
}

export function useTelegram() {
  const ctx = useContext(TelegramContext)
  if (!ctx) throw new Error('useTelegram must be used within TelegramProvider')
  return ctx
}
