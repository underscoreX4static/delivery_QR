import { createClient } from '@supabase/supabase-js'

// Service-role client. ONLY import this in server components, route handlers, or proxy.
// NEVER import in client components — it bypasses RLS entirely.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
