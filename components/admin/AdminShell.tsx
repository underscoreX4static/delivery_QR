'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'light' | 'dark'
const STORAGE_KEY = 'haze-admin-theme'

/**
 * Wraps the whole authenticated admin and owns its light/dark theme. The theme
 * lives on this wrapper's own [data-theme] attribute (not <html>), so it stays
 * scoped to the admin — the light-pinned Telegram Mini App is never touched.
 * Persisted per-browser in localStorage.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydrate from localStorage (unavailable during SSR)
    if (saved === 'dark' || saved === 'light') setTheme(saved)
  }, [])

  const toggle = () => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }

  return (
    <div data-theme={theme} className="relative flex min-h-dvh flex-col bg-page-bg text-foreground sm:flex-row">
      {children}
      <button
        onClick={toggle}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        className="fixed bottom-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-sm transition-colors hover:border-brass hover:text-brass"
      >
        {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} />}
      </button>
    </div>
  )
}
