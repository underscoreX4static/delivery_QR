import { getAdminSession } from '@/lib/supabase-server'

/** Every app/api/admin/* route must call this first. */
export async function requireAdmin() {
  const user = await getAdminSession()
  return user
}
