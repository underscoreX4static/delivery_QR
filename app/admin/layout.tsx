import { getAdminSession } from '@/lib/supabase-server'
import { AdminNav } from '@/components/admin/AdminNav'
import { MobileNav } from '@/components/admin/MobileNav'
import { SignOutButton } from '@/components/admin/SignOutButton'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAdminSession()

  // Unauthenticated requests never reach here except on /admin/login — proxy.ts
  // redirects everything else to it. Render the login page with no chrome.
  if (!user) return <>{children}</>

  return (
    <div className="flex min-h-dvh flex-col sm:flex-row">
      <MobileNav userEmail={user.email ?? ''} />

      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-iron-line bg-iron p-4 sm:flex">
        <div>
          <div className="mb-7 flex items-baseline gap-2 px-3">
            <span className="font-serif text-2xl font-semibold tracking-wide text-iron-ink">HAZE</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-brass-soft">livraison</span>
          </div>
          <AdminNav />
        </div>
        <div className="flex items-center justify-between border-t border-iron-line px-3 pt-3">
          <span className="truncate font-mono text-[11px] text-iron-soft">{user.email}</span>
          <SignOutButton className="font-mono text-[11px] uppercase tracking-wide text-iron-soft transition-colors hover:text-iron-ink" />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-page-bg px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  )
}
