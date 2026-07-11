import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// Decision #052 — durable, cross-instance rate limiting backed by Postgres
// (rate_limit_check RPC, service_role only). Replaces the per-instance
// in-memory Map counters that Vercel serverless resets on cold start and
// multiplies under horizontal scaling.

export interface RateWindow {
  limit: number
  seconds: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfter: number
  // true when the limiter itself could not be consulted (store down,
  // missing service role, malformed response). The route must FAIL CLOSED
  // on this — return 503 and do no further (paid/abusable) work.
  unavailable: boolean
}

// Keys are hashed before they reach the store, so api_rate_limits never
// holds a raw IP or user UUID.
function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

function isValidResult(x: unknown): x is { allowed: boolean; retry_after: number } {
  if (typeof x !== 'object' || x === null) return false
  const r = x as Record<string, unknown>
  return typeof r.allowed === 'boolean'
    && typeof r.retry_after === 'number'
    && Number.isInteger(r.retry_after)
    && r.retry_after >= 0
}

/**
 * Enforce all windows for a key atomically.
 *
 * FAIL CLOSED: if the limiter store is unreachable, the service role is
 * missing, the RPC throws, or the response is malformed, this returns
 * `unavailable: true` and the route must respond 503 WITHOUT doing the
 * work the limiter protects (Anthropic spend, invite abuse). A broken
 * limiter must never silently disable the protection.
 */
export async function enforceRateLimit(key: string, windows: RateWindow[]): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('rate_limit_check', {
      p_key:     hashKey(key),
      p_windows: windows,
    })

    if (error) {
      console.error('[rate-limit] rate_limit_check failed — failing closed:', error.message)
      return { allowed: false, retryAfter: 60, unavailable: true }
    }
    if (!isValidResult(data)) {
      console.error('[rate-limit] malformed rate_limit_check result — failing closed')
      return { allowed: false, retryAfter: 60, unavailable: true }
    }

    return { allowed: data.allowed, retryAfter: data.retry_after, unavailable: false }
  } catch (err) {
    console.error('[rate-limit] limiter unavailable — failing closed:', err instanceof Error ? err.name : 'unknown')
    return { allowed: false, retryAfter: 60, unavailable: true }
  }
}

// Per-route window configs (env-tunable), kept in one place so the caps
// are documented and consistent.
const envInt = (key: string, def: number) => {
  const n = parseInt(process.env[key] ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : def
}

export const RATE_LIMITS = {
  scanner: (): RateWindow[] => [
    { limit: envInt('RATE_LIMIT_SCANNER_PER_MINUTE', 5),  seconds: 60 },
    { limit: envInt('RATE_LIMIT_SCANNER_PER_DAY', 30),    seconds: 86_400 },
  ],
  analyst: (): RateWindow[] => [
    { limit: envInt('RATE_LIMIT_ANALYST_PER_MINUTE', 10), seconds: 60 },
    { limit: envInt('RATE_LIMIT_ANALYST_PER_DAY', 200),   seconds: 86_400 },
  ],
  scout: (): RateWindow[] => [
    { limit: envInt('RATE_LIMIT_SCOUT_PER_MINUTE', 3),    seconds: 60 },
    { limit: envInt('RATE_LIMIT_SCOUT_PER_DAY', 50),      seconds: 86_400 },
  ],
  coach: (): RateWindow[] => [
    { limit: envInt('RATE_LIMIT_COACH_PER_DAY', 20),      seconds: 86_400 },
  ],
  register: (): RateWindow[] => [
    { limit: envInt('RATE_LIMIT_REGISTER_PER_MINUTE', 5), seconds: 60 },
    { limit: envInt('RATE_LIMIT_REGISTER_PER_HOUR', 15),  seconds: 3_600 },
  ],
}

// Canonicalize a client IP for the register key. Vercel populates
// x-forwarded-for with the real client IP as the first entry; we take that,
// validate it as a plausible IPv4/IPv6, and fall back to a fixed bucket
// otherwise (so a garbage header cannot fan out into unbounded buckets).
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6 = /^[0-9a-fA-F:]{2,45}$/
export function canonicalClientIp(forwardedFor: string | null, realIp: string | null): string {
  const candidate = (forwardedFor?.split(',')[0] ?? realIp ?? '').trim().toLowerCase()
  if (candidate && (IPV4.test(candidate) || IPV6.test(candidate)) && candidate.length <= 45) {
    return candidate
  }
  return 'unknown'
}
