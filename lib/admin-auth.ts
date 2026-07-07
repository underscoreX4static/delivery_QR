import { getAdminSession } from '@/lib/supabase-server'

// There is only ever ONE admin account (see CLAUDE.md section 1). A valid
// Supabase session alone isn't enough to prove that — Supabase Auth signup is
// a public endpoint by default, so anyone who signs up and confirms their
// email would otherwise pass requireAdmin(). Pin it to the one real admin.
const ADMIN_EMAIL = 'leshit.fr@gmail.com'

/** Every app/api/admin/* route must call this first. */
export async function requireAdmin() {
  const user = await getAdminSession()
  if (!user || user.email !== ADMIN_EMAIL) return null
  return user
}
