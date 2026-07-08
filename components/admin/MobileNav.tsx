'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AdminNav } from '@/components/admin/AdminNav'
import { SignOutButton } from '@/components/admin/SignOutButton'

export function MobileNav({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the drawer whenever the route actually changes
    setOpen(false)
  }, [pathname])

  return (
    <div className="sm:hidden">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl leading-none"
        >
          ☰
        </button>
        <h1 className="text-base font-semibold">HAZE Admin</h1>
        <SignOutButton />
      </header>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col justify-between bg-surface p-4">
            <div>
              <div className="mb-6 flex items-center justify-between px-1">
                <h1 className="text-lg font-semibold text-foreground">HAZE Admin</h1>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              <AdminNav />
            </div>
            <p className="truncate px-3 py-2 text-xs text-muted">{userEmail}</p>
          </div>
        </div>
      )}
    </div>
  )
}
