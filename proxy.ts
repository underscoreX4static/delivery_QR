import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// There is only ever ONE admin account (see CLAUDE.md section 1). Supabase
// Auth signup is a public endpoint by default, so "has a valid session" is
// not the same as "is the admin" — anyone who signs up and confirms their
// email would otherwise reach every /admin/* page. Must match the same
// check as requireAdmin() in lib/admin-auth.ts (that one guards the API
// routes; this one guards the pages themselves).
const ADMIN_EMAIL = 'leshit.fr@gmail.com'

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (the `middleware` export is
// deprecated in favour of `proxy`). This guards every /admin/* route except
// the login page itself.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isLoginPage = pathname === '/admin/login'
  const isAdmin = user?.email === ADMIN_EMAIL

  if (!isAdmin && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    return NextResponse.redirect(url)
  }

  if (isAdmin && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/orders'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*'],
}
