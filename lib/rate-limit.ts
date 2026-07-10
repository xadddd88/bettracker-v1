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
}

/**
 * Enforce all windows for a key atomically. Returns { allowed, retryAfter }.
 *
 * Fail-open: if the limiter store is unreachable, the request is allowed
 * (a limiter outage must not take the route down) — the event is logged so
 * a sustained failure is visible. The routes this guards all need the same
 * database anyway, so a store outage already degrades them.
 */
export async function enforceRateLimit(key: string, windows: RateWindow[]): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('rate_limit_check', {
      p_key:     key,
      p_windows: windows,
    })

    if (error) {
      console.error('[rate-limit] rate_limit_check failed — failing open:', error.message)
      return { allowed: true, retryAfter: 0 }
    }

    const result = data as { allowed?: boolean; retry_after?: number } | null
    return {
      allowed:    result?.allowed !== false,
      retryAfter: result?.retry_after ?? 0,
    }
  } catch (err) {
    // Any failure (no service role, store unreachable, thrown RPC) fails open —
    // a limiter outage must never take the route down.
    console.error('[rate-limit] failing open:', err instanceof Error ? err.name : 'unknown')
    return { allowed: true, retryAfter: 0 }
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
