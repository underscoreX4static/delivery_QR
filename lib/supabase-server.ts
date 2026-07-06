import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

/**
 * Session-aware Supabase client for Server Components / Route Handlers,
 * scoped to the signed-in admin (anon key + cookies, respects RLS). This is
 * the ONLY client allowed to represent "the logged-in admin" — application
 * data access still goes through supabaseAdmin (service role) in lib/supabase.ts.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Called from a Server Component render — the proxy already
            // refreshes the session cookie for us, so this is safe to ignore.
          }
        },
      },
    }
  )
}

export async function getAdminSession() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
