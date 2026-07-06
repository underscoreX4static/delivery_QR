import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Service-role client. ONLY import this in server components, route handlers, or proxy.
// NEVER import in client components — it bypasses RLS entirely.
//
// Built lazily behind a Proxy: Next.js executes route modules at build time
// to "collect page data", which would otherwise construct this client (and
// throw on a missing env var) during the build itself rather than at
// request time. The Proxy defers createClient() until the first property
// access, which only happens once a request handler actually runs.
let client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return client
}

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver)
  },
})
