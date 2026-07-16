# Founder-First Coupon-to-Tracker — Decision #060

## Status

**ACTIVE: APPLIED / CATALOG VERIFIED; authenticated smoke pending.** Founder approval: Decision #060 APPROVED.

Phase A delivered the safe atomic foundation. Migration 024 was applied to production on 2026-07-16 as `20260716142736_create_tracked_bet_024`, and the exact catalog contract was verified read-only. No runtime bet creation goes through the new RPC yet. Authenticated smoke is NOT APPROVED / NOT RUN, and Phase B (UI/API adoption) remains HOLD under Decision #060 pending separate CPO approval. This checkpoint does not consume a new decision number. Highest-numbered executed decision remains #059 until this track closes.

## Objective

Give the tracker a single safe write path for both Single and Express (parlay) entries — the future unified Scanner → editable legs → Bet form and the mobile daily tracker flow — without touching the existing `create_quick_bet` or any current UI/API.

## Phase A (this PR)

### Additive migration `supabase/migrations/024_create_tracked_bet.sql`

1. `bet_legs.leg_index integer` — nullable, additive, `CHECK (leg_index IS NULL OR leg_index BETWEEN 1 AND 20)` **plus a partial `UNIQUE (bet_id, leg_index)` index** (`uq_bet_legs_bet_leg_index`, `WHERE leg_index IS NOT NULL`), so duplicate or out-of-range positions inside one bet are impossible at the schema level. Existing rows keep `NULL`; only the new RPC populates it. Without an ordinal column, coupon leg order cannot be preserved relationally (UUID ids and same-timestamp `created_at` give no deterministic order).
2. `create_tracked_bet(p_legs jsonb, p_total_odds, p_stake, p_bookmaker, p_notes, p_source, p_idempotency_key)` — `SECURITY DEFINER`, empty pinned `search_path`, and schema-qualified `public.*` objects so caller-created temporary objects cannot shadow financial tables.
3. Emergency rollback script `docs/decision-060-rollback.sql` (outside `supabase/migrations`, per the #048/#049 convention), exact-signature read-only catalog verification, and `scripts/verify-migration-024.sh`: an 11-step disposable PostgreSQL 17 apply/catalog/behavior/rollback/re-apply verifier. The rollback is one fail-closed transaction with executable preflight and postconditions. A production authenticated smoke is not part of the Phase A PR and requires a separate CPO-authorized execution.

### RPC contract (implemented exactly as pinned)

- **Identity:** `auth.uid()` only; unauthenticated → `Not authenticated`. The caller can NOT pass a bankroll id — the user's default bankroll is resolved server-side.
- **Inputs:** `legs` jsonb array (1–20), `total_odds`, `stake`, `bookmaker` (≤100), `notes` (≤500), `source ∈ {manual, scanner}`, REQUIRED UUID `idempotency_key` (same regex as `adjust_bankroll` in 016, canonicalized to lowercase before lookup/insert so UUID letter case cannot bypass replay protection).
- **Leg validation (fail closed, before any write):** each leg must be an object with ONLY `sport`, `event_name`, `market_type`, `selection` (nullable — absent and explicit JSON `null` both accepted), `odds`; any unknown key or wrong JSON type raises. `sport` must be canonical: `soccer | tennis | basketball | ice_hockey | cs2 | mma | other` (the exact allowlist of the existing bet form and AI/Scout surfaces). `event_name` (≤200) and `market_type` (≤100) are required non-empty strings; `odds` must be a JSON number in `(1, 10000]`.
- **Canonical normalized values:** validation builds a canonical form per leg (fixed key set, trimmed strings, `selection` collapsed to NULL when absent/null/empty) and applies PostgreSQL `trim_scale()` to leg odds, stake, and total odds. BOTH the request hash and the inserted financial/`bet_legs` rows use those normalized values, so `2`, `2.0`, and `2.00` replay identically; whitespace/format noise cannot produce mismatched stored rows.
- **Derivation:** 1 leg → `bet_type='single'`, `total_odds` taken from the leg's odds (a non-NULL `p_total_odds` that disagrees raises); 2–20 legs → `bet_type='parlay'`, `p_total_odds` required and bounded. Leg order is preserved via `leg_index = 1..n` in input order, backed by the partial unique index.
- **No Decision rows:** a tracked bet is a tracker entry, not an AI decision — the function never inserts into `decisions` (unlike `create_quick_bet`), and `bet_legs.decision_id` stays NULL.
- **Money discipline (Decision #047 lineage):** default bankroll row locked `FOR UPDATE` before the idempotency check (same serialization order as `adjust_bankroll`); no-overdraft guard (`Insufficient balance`); bet + all legs + balance update + stake `bankroll_transactions` row execute in ONE transaction (single plpgsql body — any raise rolls back everything).
- **Payload-bound idempotency (strict):** request hash = **SHA-256** (PostgreSQL built-in `sha256()`, no extension dependency) over `{normalized legs, total_odds, stake, bookmaker, notes, source}`. Lookup compares the lowercase form of stored and incoming UUID keys, so an uppercase key previously consumed by `adjust_bankroll` cannot bypass the cross-function conflict. Replay is accepted ONLY when the stored transaction has `type='stake'`, a non-null `bet_id`, AND the identical hash — then the original `bet_id`/`balance_after` return with `replayed=true` and nothing is deducted. Any other reuse of the key — different payload, or a key already consumed by another operation such as `adjust_bankroll` — raises `Idempotency conflict` with zero writes. The 016 unique index `uq_bankroll_tx_user_idempotency_key` backstops races.
- **Sanitized metadata:** the stake transaction's metadata is exactly `{request_hash, source, leg_count}` — never `rawText`/`statusText`/`scoreText`, screenshots, or event names. Coupon content lives only in `bets`/`bet_legs` rows owned by the user.
- **Grant hygiene:** `REVOKE EXECUTE FROM PUBLIC, anon`; `GRANT EXECUTE TO authenticated, service_role`; no new direct DML grants on `bets`/`bet_legs`/`bankrolls`/`bankroll_transactions` and no RLS policy changes — the Decision #048 write boundary is untouched.
- **Return:** `{bet_id, balance, replayed}`.

### Tests (CI: existing trusted suites)

- `scripts/test-financial-safety.mjs` — 6 new migration-024 guard tests (31/31 total): identity/idempotency/money invariants incl. **sha256-not-md5**, normalized-value hashing, `trim_scale`, empty `search_path`/schema qualification, and **strict replay (type='stake' + non-null bet_id + hash equality)**; fail-closed leg validation incl. nullable selection and post-trim bounds; single/parlay derivation + preserved order incl. **CHECK 1–20 + partial UNIQUE index** and normalized-form inserts; transactional fail-closed rollback + exact-signature catalog verification; disposable PostgreSQL 17 runtime-verifier coverage; no `INSERT INTO decisions`, metadata keys exactly `{request_hash, source, leg_count}` with raw-coupon fields banned, REVOKE/GRANT surface, no direct DML grants.
- `scripts/test-domain-write-boundaries.mjs` — 1 new test (14/14 total): migration 024 is additive only — no direct DML grants on protected tables, no `CREATE/DROP POLICY`, no RLS disable, correct EXECUTE surface.
- No regressions: provider-safety 97/97, analysis-quality-gate 26/26, auth-invite 16/16, rate-limit 12/12, csp-security 18/18, `tsc --noEmit` clean, lint 0 errors.

## Production migration checkpoint (2026-07-16)

- Migration 024 is applied as Supabase migration version `20260716142736_create_tracked_bet_024`.
- The exact catalog contract was verified read-only.
- `create_tracked_bet` RPC runtime calls = 0.
- `bet_legs` rows with `leg_index IS NOT NULL` = 0.
- Authenticated smoke is NOT APPROVED / NOT RUN.
- `create_quick_bet` is unchanged.
- Phase B remains HOLD.

## Phase B (under Decision #060; separate CPO approval — NOT this PR)

Migration 024 and its read-only catalog verification are complete. A controlled authenticated smoke on a dedicated account remains a separate, explicit CPO-authorized execution and has not been approved or run. Phase B remains HOLD; it may begin only after that checkpoint and separate CPO approval:

- unified Single/Express form (`/bets/new`) switching from `create_quick_bet` to `create_tracked_bet`;
- Scanner → editable legs → Bet flow feeding the same RPC (`source='scanner'`);
- mobile daily tracker flow;
- API route(s) with zod validation mirroring the RPC contract, rate limiting per Decision #052, and client-generated idempotency keys;
- `create_quick_bet` deprecation path decided separately.

Phase B stays under Decision #060 (no new decision number) and requires its own CPO approval before any UI/API work starts. It touches UI/API only — widening the RPC contract itself would require a new decision.

## Explicit non-use after the production migration checkpoint

```txt
production migration: APPLIED / CATALOG VERIFIED
Supabase migration version: 20260716142736_create_tracked_bet_024
catalog verification: READ-ONLY
authenticated smoke: NOT APPROVED / NOT RUN
create_tracked_bet RPC runtime calls: 0
bet_legs rows with leg_index IS NOT NULL: 0
Phase B: HOLD
UI/API changes: 0
create_quick_bet: UNCHANGED
provider calls: 0
Decision rows created: 0
direct DML grants added: 0
Decision #056 runtime: NOT APPROVED / NOT RUN
results ingestion / automated settlement: HOLD
Decision #050 SMTP round-trip: PENDING
CSP Phase B: NOT APPROVED
FP-001: ACTIVE
```

## References

- `supabase/migrations/016_atomic_financial_writes.sql` — idempotency + funds-guard patterns (Decision #047)
- `supabase/migrations/018_enforce_domain_write_boundaries.sql` — write boundary this migration must not widen (Decision #048)
- `docs/results-ingestion-settlement-trust-contract-decision-057.md` — settlement semantics remain gated; tracked parlays settle manually as whole bets until #057 gates open
- `app/(app)/bets/new/page.tsx` — canonical sport allowlist source
