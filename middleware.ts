import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { checkActiveMembership } from '@/lib/supabase/active-membership'

function isPublicWebPath(pathname: string): boolean {
  return pathname === '/login'
    || pathname === '/access-denied'
    || pathname === '/service-unavailable'
    || pathname === '/auth'
    || pathname.startsWith('/auth/')
    || (process.env.VERCEL_ENV !== 'production' && pathname === '/__design-preview/market-access')
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  function redirectPreservingSupabaseCookies(destination: string) {
    const response = NextResponse.redirect(new URL(destination, request.url))
    for (const cookie of supabaseResponse.cookies.getAll()) {
      response.cookies.set(cookie)
    }
    return response
  }

  const protectedWebPath = !pathname.startsWith('/api/') && !isPublicWebPath(pathname)

  // Redirect unauthenticated users to login
  if (!user && protectedWebPath) {
    return redirectPreservingSupabaseCookies('/login')
  }

  if (user && protectedWebPath) {
    const membership = await checkActiveMembership(user.id)
    if (membership.status === 'inactive') {
      return redirectPreservingSupabaseCookies('/access-denied')
    }
    if (membership.status === 'unavailable') {
      return redirectPreservingSupabaseCookies('/service-unavailable')
    }
  }

  // Redirect authenticated users away from login
  if (user && pathname === '/login') {
    return redirectPreservingSupabaseCookies('/dashboard')
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
