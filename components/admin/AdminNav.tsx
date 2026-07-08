'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavLink {
  href: string
  label: string
  icon: string
  /** Lets one entry stay highlighted across several route prefixes — e.g. Partners covers both the Drivers and Commercials sub-tabs. */
  match?: string[]
}

interface NavGroup {
  title: string
  links: NavLink[]
}

const GROUPS: NavGroup[] = [
  {
    title: 'Operations',
    links: [
      { href: '/admin/orders', label: 'Orders', icon: '📋' },
      { href: '/admin/products', label: 'Products', icon: '📦' },
      { href: '/admin/inventory', label: 'Inventory', icon: '📊' },
    ],
  },
  {
    title: 'Growth',
    links: [
      { href: '/admin/customers', label: 'Customers', icon: '👤' },
      { href: '/admin/referrals', label: 'Referrals', icon: '🔗' },
      { href: '/admin/partners', label: 'Partners', icon: '🤝', match: ['/admin/partners', '/admin/drivers'] },
      { href: '/admin/qr-codes', label: 'QR Codes', icon: '🔳' },
    ],
  },
  {
    title: 'Money',
    links: [
      { href: '/admin/settlements', label: 'Settlements', icon: '🧾' },
      { href: '/admin/finance', label: 'Finance', icon: '💰' },
      { href: '/admin/earnings', label: 'Earnings', icon: '📈' },
    ],
  },
  {
    title: 'Config',
    links: [
      { href: '/admin/schedule', label: 'Schedule', icon: '🗓️' },
      { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-4">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted">{group.title}</p>
          <div className="flex flex-col gap-1">
            {group.links.map((link) => {
              const prefixes = link.match ?? [link.href]
              const active = prefixes.some((p) => pathname?.startsWith(p))
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex min-h-11 items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium transition-colors sm:py-2 ${
                    active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-border/40'
                  }`}
                >
                  <span aria-hidden="true">{link.icon}</span>
                  {link.label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
