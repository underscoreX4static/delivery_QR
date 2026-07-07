'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/inventory', label: 'Inventory' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/referrals', label: 'Referrals' },
  { href: '/admin/partners', label: 'Commercials' },
  { href: '/admin/qr-codes', label: 'QR Codes' },
  { href: '/admin/drivers', label: 'Drivers' },
  { href: '/admin/settlements', label: 'Settlements' },
  { href: '/admin/earnings', label: 'Earnings' },
  { href: '/admin/schedule', label: 'Schedule' },
  { href: '/admin/settings', label: 'Settings' },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {LINKS.map((link) => {
        const active = pathname?.startsWith(link.href)
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
