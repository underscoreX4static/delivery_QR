import { getAdminSession } from '@/lib/supabase-server'
import { AdminNav } from '@/components/admin/AdminNav'
import { SignOutButton } from '@/components/admin/SignOutButton'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAdminSession()

  // Unauthenticated requests never reach here except on /admin/login — proxy.ts
  // redirects everything else to it. Render the login page with no chrome.
  if (!user) return <>{children}</>

  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-56 shrink-0 flex-col justify-between border-r border-neutral-200 bg-white p-4">
        <div>
          <h1 className="mb-6 px-3 text-lg font-semibold">HAZE Admin</h1>
          <AdminNav />
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="truncate text-xs text-neutral-600">{user.email}</span>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-neutral-50 p-6">{children}</main>
    </div>
  )
}
