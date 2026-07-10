# Global (Durable) Rate Limits (Decision #052)

## Status

SCOPE + IMPLEMENTATION. Awaiting CPO review. Migration 023 NOT applied yet.

Last updated: 2026-07-10

## Context

CPO audit: the scanner / analyst / scout / coach / register routes rate-limit with an
in-memory `Map`. On Vercel serverless that is **per-instance** — each Lambda has its own
counter, a cold start resets it, and horizontal scaling multiplies the effective limit. So
the caps (Anthropic-spend control on the AI routes; enumeration/abuse guard on the
unauthenticated register route) are not actually enforced across the fleet.

## Decision — Postgres-backed shared counter

No new infrastructure (no Redis/marketplace add-on) — the counters move into the existing
Supabase Postgres, atomic and shared across every instance.

### Migration `023_global_rate_limits.sql`
- `api_rate_limits` table (`bucket` PK, `count`, `expires_at`; index on `expires_at`) —
  service-role only (RLS on, no anon/authenticated grants).
- `rate_limit_check(p_key text, p_windows jsonb)` RPC (SECURITY DEFINER, service_role only):
  fixed-window atomic counter. For each window (`{limit, seconds}`) it computes a bucket
  `key|seconds|floor(epoch/seconds)`, `INSERT … ON CONFLICT DO UPDATE SET count = count + 1`,
  and denies if any window's new count exceeds its limit. `retry_after` = seconds until the
  longest-blocked window resets. Opportunistic expired-bucket cleanup (~1% of calls).

### Shared helper `lib/rate-limit.ts`
- `enforceRateLimit(key, windows)` → `{ allowed, retryAfter }` via the RPC (admin client).
- **Fail-open**: any failure (no service role, store unreachable, thrown RPC) returns
  `allowed` — a limiter outage must never take a route down; the routes it guards already
  need the same database, so a store outage degrades them regardless. Every failure is logged.
- `RATE_LIMITS` centralizes the env-tunable window configs (unchanged defaults):

  | Route | Windows |
  |-------|---------|
  | scanner | 5/min, 30/day |
  | analyst | 10/min, 200/day |
  | scout | 3/min, 50/day |
  | coach | 20/day |
  | register | 5/min, 15/hour |

### Routes
All five drop their in-memory `Map` + local `checkRateLimit` and call
`enforceRateLimit('<route>:<key>', RATE_LIMITS.<route>())` — AI routes key by `user.id`,
register keys by client IP. The 429 response + `Retry-After` header are unchanged.

## Tests

New CI suite `npm run test:rate-limit` (7 cases): helper calls the RPC with the right
key+windows and maps the result, denied → `allowed:false`+retry, **fails open** on RPC error
and on missing admin client, `RATE_LIMITS` config sanity, a source sweep proving no route
keeps an in-memory Map (all call the helper with the right key), and migration static guards
(service-role-only table+RPC, atomic increment, per-window deny, retry_after, cleanup).

The auth-invite suite's old in-memory 429 test was removed (rate limiting is no longer a
register-route concern; it's covered here).

## Deployment order

1. CI + CPO review → 2. apply migration 023 → 3. verify table/RPC/grants → 4. merge →
5. prod smoke (a route still serves; a burst trips 429 with Retry-After) → 6. execution
record.

## Non-goals

No change to the limit values, no Redis/marketplace integration, no change to route logic
beyond the limiter call, no distributed sliding-window (fixed-window is sufficient for these
caps).
