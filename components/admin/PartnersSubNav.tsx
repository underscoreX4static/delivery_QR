'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/admin/drivers', label: 'Drivers' },
  { href: '/admin/partners', label: 'Commercials' },
]

export function PartnersSubNav() {
  const pathname = usePathname()

  return (
    <div className="mb-4 flex gap-1 border-b border-neutral-200">
      {TABS.map((tab) => {
        const active = pathname?.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              active
                ? 'border-black text-black'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
