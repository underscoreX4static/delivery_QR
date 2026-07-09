'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Handshake,
  Package,
  QrCode,
  Receipt,
  Settings,
  Share2,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

interface NavLink {
  href: string
  label: string
  icon: LucideIcon
  /** Lets one entry stay highlighted across several route prefixes — e.g. Partners covers both the Drivers and Commercials sub-tabs. */
  match?: string[]
}

const GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: 'Operations',
    links: [
      { href: '/admin/orders', label: 'Orders', icon: ClipboardList },
      { href: '/admin/products', label: 'Products', icon: Package },
      { href: '/admin/inventory', label: 'Inventory', icon: BarChart3 },
    ],
  },
  {
    title: 'Growth',
    links: [
      { href: '/admin/customers', label: 'Customers', icon: Users },
      { href: '/admin/referrals', label: 'Referrals', icon: Share2 },
      { href: '/admin/partners', label: 'Partners', icon: Handshake, match: ['/admin/partners', '/admin/drivers'] },
      { href: '/admin/qr-codes', label: 'QR Codes', icon: QrCode },
    ],
  },
  {
    title: 'Money',
    links: [
      { href: '/admin/settlements', label: 'Settlements', icon: Receipt },
      { href: '/admin/finance', label: 'Finance', icon: Wallet },
      { href: '/admin/earnings', label: 'Earnings', icon: TrendingUp },
    ],
  },
  {
    title: 'Config',
    links: [
      { href: '/admin/schedule', label: 'Schedule', icon: CalendarDays },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-5">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 px-3 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-iron-soft">
            {group.title}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.links.map((link) => {
              const prefixes = link.match ?? [link.href]
              const active = prefixes.some((p) => pathname?.startsWith(p))
              const Icon = link.icon
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors sm:py-2 ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-iron-ink/85 hover:bg-iron-2 hover:text-iron-ink'
                  }`}
                >
                  <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} aria-hidden="true" />
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
