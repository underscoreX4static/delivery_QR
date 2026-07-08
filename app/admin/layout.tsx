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

      <aside className="hidden w-56 shrink-0 flex-col justify-between border-r border-border bg-surface p-4 sm:flex">
        <div>
          <h1 className="mb-6 px-3 text-lg font-semibold text-foreground">HAZE Admin</h1>
          <AdminNav />
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="truncate text-xs text-muted">{user.email}</span>
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-page-bg px-4 py-4 sm:px-6 sm:py-6">{children}</main>
    </div>
  )
}
