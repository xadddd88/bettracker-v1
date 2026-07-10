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
  fixed-window, **two-phase check-then-consume**. Phase 1 takes a row lock on every window's
  bucket (`key|seconds|floor(epoch/seconds)`) via a no-op `ON CONFLICT DO UPDATE` and reads
  its current count; Phase 2 consumes one token from **every** window only if **all** are
  under limit. A denied request consumes NOTHING — so a burst blocked by a short window can
  never drain a longer window's budget (VADE review fix, PR #137: the earlier
  increment-then-check version let a per-minute-blocked burst exhaust the per-day cap and
  lock the caller out for the whole day). A per-key
  `pg_advisory_xact_lock(hashtextextended(p_key,0))` (CPO review) serializes the entire
  check-then-consume for a key across all its windows, so concurrency is correct even beyond
  per-bucket locks. `retry_after` = seconds until the longest-blocked window resets.
  **Fail-closed validation** raises on NULL/non-array/empty/>5 windows, non-object entries,
  non-integer / out-of-range / duplicate-`seconds` windows (an explicit NULL check — SQL
  three-valued logic would otherwise let a NULL `p_windows` return allowed on an empty loop).
  Bounded expired-bucket cleanup (~1% of calls, `LIMIT 500`). Behaviourally verified: a
  4-request burst against limit 2/min + 5/day yields allowed `true true false false` with the
  day counter at **2**,
  not 4.

### Shared helper `lib/rate-limit.ts`
- `enforceRateLimit(key, windows)` → `{ allowed, retryAfter, unavailable }` via the RPC.
- **Fail-CLOSED** (CPO review, PR #137): any failure (no service role, store unreachable,
  thrown RPC, malformed response) returns `unavailable: true` and the route must respond
  **503 before doing the work the limiter protects** (Anthropic spend, invite abuse). The
  earlier fail-open version was reversed — a scanner/analyst request that passed auth would
  proceed to an expensive provider call even if the limiter RPC or its grants were broken,
  exposing exactly the spend the cap defends. The response is strictly validated: `allowed`
  must be a boolean and `retry_after` a non-negative integer; `null`/`{}`/wrong-typed results
  fail closed.
- **Key hashing**: every key is `sha256`ed before it reaches the store, so `api_rate_limits`
  never holds a raw IP or user UUID.
- `canonicalClientIp(x-forwarded-for, x-real-ip)`: takes the first forwarded entry
  (Vercel populates the real client IP there), validates it as a plausible IPv4/IPv6 and
  length-caps it, else falls back to a fixed `unknown` bucket so a garbage header can't fan
  out into unbounded buckets.
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
register by the canonicalized client IP. Each route now handles three outcomes:
`unavailable → 503` (before any paid/abusable work), `!allowed → 429` + `Retry-After`,
else proceed. Coach's 429 message is neutral (`"Rate limit exceeded. Try again later."`)
instead of the stale hardcoded "2 times per 24 hours" that had drifted from the env limit.

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
