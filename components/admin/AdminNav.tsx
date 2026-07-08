'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// `match` lets one nav entry stay highlighted across several route prefixes —
// e.g. Partners covers both the Drivers and Commercials sub-tabs.
const LINKS: { href: string; label: string; match?: string[] }[] = [
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/inventory', label: 'Inventory' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/referrals', label: 'Referrals' },
  { href: '/admin/partners', label: 'Partners', match: ['/admin/partners', '/admin/drivers'] },
  { href: '/admin/qr-codes', label: 'QR Codes' },
  { href: '/admin/settlements', label: 'Settlements' },
  { href: '/admin/finance', label: 'Finance' },
  { href: '/admin/earnings', label: 'Earnings' },
  { href: '/admin/schedule', label: 'Schedule' },
  { href: '/admin/settings', label: 'Settings' },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {LINKS.map((link) => {
        const prefixes = link.match ?? [link.href]
        const active = prefixes.some((p) => pathname?.startsWith(p))
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex min-h-11 items-center rounded-lg px-3 py-3 text-sm font-medium sm:py-2 ${
              active ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
