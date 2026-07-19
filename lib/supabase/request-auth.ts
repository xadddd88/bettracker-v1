import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { createClient as createCookieClient } from '@/lib/supabase/server'

export type RequestAuthResult =
  | { authorized: true; supabase: SupabaseClient; user: User }
  | { authorized: false }

const UNAUTHORIZED: RequestAuthResult = { authorized: false }

function jwtRole(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

function bearerToken(header: string): string | null {
  const match = /^Bearer\s+([^\s,]+)$/i.exec(header.trim())
  return match?.[1] ?? null
}

/**
 * Authenticate one Next request without mixing native and browser sessions.
 *
 * If Authorization is present, the request is token-only: malformed or invalid
 * Bearer credentials fail closed and can never fall back to browser cookies.
 * Without Authorization, the existing cookie session path is preserved.
 */
export async function authenticateRequest(req: Request): Promise<RequestAuthResult> {
  const authorization = req.headers.get('authorization')

  if (authorization !== null) {
    const token = bearerToken(authorization)
    if (!token) return UNAUTHORIZED

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if ((serviceRoleKey && token === serviceRoleKey) || jwtRole(token) === 'service_role') {
      return UNAUTHORIZED
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) return UNAUTHORIZED

    try {
      const supabase = createSupabaseClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
      const { data: { user }, error } = await supabase.auth.getUser(token)
      if (error || !user) return UNAUTHORIZED
      return { authorized: true, supabase, user }
    } catch {
      return UNAUTHORIZED
    }
  }

  try {
    const supabase = await createCookieClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return UNAUTHORIZED
    return { authorized: true, supabase, user }
  } catch {
    return UNAUTHORIZED
  }
}
