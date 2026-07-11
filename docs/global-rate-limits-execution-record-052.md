# Execution Record — Global (Durable) Rate Limits (Decision #052)

## Status

EXECUTED 2026-07-10 · CPO final accept on PR #137 head `33ac046` · sanitized record, rides
under Decision #052.

## Review rounds incorporated before apply

1. **VADE (logic):** the first version incremented every window before checking, so a burst
   blocked by a short window drained the longer window's budget. Fixed to two-phase
   check-then-consume.
2. **CPO:** fail-**closed** limiter (503, not fail-open); per-key `pg_advisory_xact_lock`;
   strictly fail-closed SQL validation (explicit NULL, non-object, non-integer, out-of-range,
   duplicate-`seconds`); register keyed by a canonicalized IP; all keys `sha256`ed so the
   store holds no raw IP/UUID; neutral Coach 429 message; bounded (`LIMIT 500`) cleanup.
3. **Vercel deploy miss:** the CPO-fix commit `dd988fb` was not deployed by Vercel (webhook
   miss under rapid pushes), so the smoke job could not resolve a READY deployment for that
   SHA. Re-triggered with an empty commit `33ac046`; CI then fully green.

## Sequence

1. **Migration 023 applied** via Supabase migration tooling (`global_rate_limits_023`).
2. **Verification (grants):** `api_rate_limits` RLS on, `anon`/`authenticated` 0 table
   access; `rate_limit_check` EXECUTE = service_role only (anon/auth false); advisory lock
   present in the definition.
3. **Live sequential verification against the deployed function** (20 sequential RPC calls,
   limit 5/min + 15/hour, fresh in-DB key): allowed **5**, denied **15**, minute counter 5,
   hour counter **5** (the 15 denied consumed NOTHING — not 20). Confirms check-then-consume
   and the denied-don't-drain fix. Test buckets deleted after.
4. **TRUE concurrency verification through the deployed route** (CPO ask): **20 parallel**
   `POST /api/auth/register` requests (non-allowlisted test email, so no invite) from one
   source → the register limiter (5/min, 15/hour):

   | Metric | Result |
   |--------|--------|
   | HTTP 200 (allowed) | **exactly 5** |
   | HTTP 429 (denied) | **exactly 15** |
   | `Retry-After` on the 429s | 33–34 s (>0, to the minute-window end) |

   Under genuine parallel/distributed contention the per-key `pg_advisory_xact_lock`
   serialized the callers to exactly the cap — no over-count. This exercised the real route
   + fail-closed helper + sha256 key + RPC end-to-end. The register buckets auto-expire
   (minute < 60 s, hour < 1 h); no manual DML was applied to `api_rate_limits`.
5. **PR #137 merged** (squash → `47cbff9`); **production READY** (deployment
   `dpl_Eamwnz22N3EfUWrLxvYoKQKTXaqy`, btdk.app), `/login` 200, no runtime errors.

## Note on stale PR/commit text

The PR #137 body and the initial branch commit messages were written against the first
fail-OPEN version and were not rewritten after the fail-CLOSED CPO patch. The merged code and
these docs are authoritative: the limiter fails **closed** (503), uses check-then-consume, and
a denied request consumes zero budget. The scope doc's "Tests" section (which still said
"fails open") is corrected in this record's PR.

## Security properties

- Rate limits are now shared across every Vercel instance (durable Postgres counter) — cold
  starts and scaling no longer reset or multiply the caps.
- **Fail-closed**: a broken limiter returns 503 before any Anthropic spend or invite work,
  never silently disabling the protection.
- `api_rate_limits` holds only `sha256` keys — no raw IP or user UUID; service-role only.

## Holds unchanged

Football enrichment, odds work, new provider calls, and new betting-signal surfaces remain
on HOLD.
