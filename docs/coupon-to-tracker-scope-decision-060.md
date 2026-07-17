# Founder-First Coupon-to-Tracker — Decision #060

## Status

**EXECUTED / VERIFIED / CLOSED 2026-07-16.** Founder approval: Decision #060 APPROVED. Phase A was applied and verified in production. Phase B was approved by the CPO, merged via PR #159 as `1926d9a82759cd1e4e97378ca15addf010c0bf28`, deployed READY, and verified by one separately authorized authenticated production API smoke.

Decision #060 delivered the atomic foundation and the unified Single/Express UI/API adoption described below. The smoke completed with exactly one tracked-bet POST, expected financial state, zero Decision rows, sign-out, and full synthetic-data cleanup. Decision #060 is now the highest-numbered CLOSED decision; #061 remains the next unreserved number.

## Objective

Give the tracker one safe atomic write path and a unified mobile-first form for both Single and Express (parlay) entries: Scanner → editable ordered legs → Bet, while keeping the legacy `create_quick_bet` function unchanged.

## Phase A — atomic foundation

### Additive migration `supabase/migrations/024_create_tracked_bet.sql`

1. `bet_legs.leg_index integer` — nullable, additive, `CHECK (leg_index IS NULL OR leg_index BETWEEN 1 AND 20)` **plus a partial `UNIQUE (bet_id, leg_index)` index** (`uq_bet_legs_bet_leg_index`, `WHERE leg_index IS NOT NULL`), so duplicate or out-of-range positions inside one bet are impossible at the schema level. Existing rows keep `NULL`; only the new RPC populates it. Without an ordinal column, coupon leg order cannot be preserved relationally (UUID ids and same-timestamp `created_at` give no deterministic order).
2. `create_tracked_bet(p_legs jsonb, p_total_odds, p_stake, p_bookmaker, p_notes, p_source, p_idempotency_key)` — `SECURITY DEFINER`, empty pinned `search_path`, and schema-qualified `public.*` objects so caller-created temporary objects cannot shadow financial tables.
3. Emergency rollback script `docs/decision-060-rollback.sql` (outside `supabase/migrations`, per the #048/#049 convention), exact-signature read-only catalog verification, and `scripts/verify-migration-024.sh`: an 11-step disposable PostgreSQL 17 apply/catalog/behavior/rollback/re-apply verifier. The rollback is one fail-closed transaction with executable preflight and postconditions. The production authenticated smoke was outside the Phase A PR and ran on 2026-07-16 only after separate authorization.

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

## Production Phase A checkpoint (2026-07-16)

- Migration 024 is applied as Supabase migration version `20260716142736_create_tracked_bet_024`.
- The exact catalog contract was verified read-only.
- The authenticated smoke used a dedicated non-login synthetic account.
- The seed deposit was 100.
- `create_tracked_bet` was called twice: 1 initial write + 1 exact semantic replay.
- The first response returned `replayed=false` and balance 90.
- The replay returned `replayed=true`, the same `bet_id`, and balance 90.
- Before cleanup: bets = 1, legs = 1, transactions = 2, stake transactions = 1, decisions = 0.
- The replay produced zero additional writes.
- Canonical normalized bet/leg values and the metadata allowlist were verified.
- The synthetic account and all related rows were deleted.
- An independent post-transaction cleanup check confirmed users/profiles/bankrolls/transactions/bets/legs/decisions = 0.
- All `bet_legs` rows with non-null `leg_index` were 0 after cleanup.
- `create_quick_bet` is unchanged.
- Phase B remains HOLD.

## Phase B — UI/API adoption (approved 2026-07-16)

Founder-first unified Single/Express tracker: Scanner → editable legs → Bet, mobile-first, writing exclusively through the already-applied `public.create_tracked_bet()`.

### Write path

```txt
Scanner response
→ allowlisted camelCase-to-snake_case adapter (lib/bets/tracked-bet.ts)
→ editable ordered LegDraft[] (array order = leg_index 1..n)
→ strict client validation (shared zod schema)
→ POST /api/bets/tracked
→ auth.getUser (401 before the limiter and the RPC)
→ Decision #052 rate limit (RATE_LIMITS.trackedBet, fail-closed 503, 429 + Retry-After)
→ strict zod schema (.strict() on the request AND each leg — unknown keys fail closed)
→ authenticated-session create_tracked_bet RPC (cookie client; service_role is never in the user flow)
→ sanitized response (Insufficient balance → 422, Bankroll not found → 404,
   Idempotency conflict → 409 Request conflict, RPC validation → 422,
   unknown → 500 Transaction failed; no raw DB text)
→ router.push('/bets/<bet_id>') + router.refresh() (success AND replay open the created bet)
```

- **Form (`/bets/new`):** 1 leg = Single, 2–20 legs = Express with add/edit/remove and preserved order; per-leg `sport/event_name/market_type/selection/odds`; `stake`, express `total_odds`, `bookmaker`, `notes`. Mobile-first `grid-cols-1 sm:grid-cols-2`, full-width controls, vertical actions at 320/375 px; desktop unchanged. The calculated express total is a UI PREVIEW only — the entered/coupon total is submitted and the RPC stays the financial authority. The payout preview no longer hardcodes a `$` symbol. The form holds no Supabase client and reads no financial tables.
- **Scanner:** the existing `/api/ai/scanner` OCR flow (no new provider). Recognized legs become editable drafts through an allowlist adapter — ONLY the five contract fields are mapped; `rawText`/`statusText`/`scoreText`/`isLive`/`periodOrPhase` never leave the scan handler. A leg with unreadable odds stays empty — the coupon total is never silently copied onto legs. Scanned submissions carry `source='scanner'`; manual entry carries `source='manual'`.
- **Idempotency lifecycle (pure state machine):** the lifecycle lives in `lib/bets/tracked-bet.ts` as a pure, I/O-free intent machine — payload fingerprint + UUID + status `ready | in_flight | conflict`, with the UUID generator INJECTED (the browser passes `() => crypto.randomUUID()`; tests pass a deterministic sequence). One key per payload snapshot; a double click is blocked while `in_flight`; network/429/503/5xx resolve `retryable` and KEEP the UUID+snapshot so an exact retry replays server-side; success clears the intent (a later submit mints a fresh UUID); a `409` resolves `conflict` — the UUID is never cleared or rotated, no auto-retry, the unchanged intent is blocked client-side with the fixed error `Request conflict`, and only a deliberate payload change starts a new intent with a new UUID. The form holds NO second lifecycle implementation — it only wires HTTP outcomes into machine transitions.
- **Reads:** `/bets` and `/bets/[id]` order embedded legs by `leg_index` (`referencedTable: 'bet_legs'`), so an express displays in coupon order; legacy NULL-index rows are unaffected.
- **Untouched:** `create_quick_bet` (all definitions), migrations, the RPC contract, Analyst/Scout/pricing surfaces, settlement/results. The Analyst Place Bet flow is explicitly NOT this slice.

### Phase B tests (existing trusted suites)

- `scripts/test-financial-safety.mjs` — 22 new Phase B tests (53/53 total). BEHAVIORAL intent-machine tests (11) import the compiled helper and drive real transitions with an injected deterministic UUID generator: first submit mints exactly one UUID; in-flight resubmit blocked; network/429/503/5xx keep UUID+snapshot; exact retry reuses the key; 409 → conflict keeping the key; unchanged post-409 resubmit blocked without a new UUID; payload change after 409 → new intent + new UUID; success clears the intent; post-success submit gets a fresh UUID; two identical runs produce identical key sequences; fingerprint stability. Route/behavioral API tests (11): 401 before limiter/RPC; 429 + `Retry-After` keyed `tracked-bet:<user>`; 503 fail-closed; strict-schema fail-closed (unknown request/leg fields, 21 legs, express without total odds, negative stake — zero RPC calls) with the 20-leg maximum accepted; manual Single mapping (derived total, key passthrough, no direct table access); scanner Express mapping (leg order, exactly five contract keys per leg, required total); nullable selection (absent + explicit null → null); sanitized business errors (422/404/409) and generic 500 with leak assertions; exact replay passthrough; form/route source assertions as SUPPLEMENTARY wiring checks only (route exists ONLY at `app/api/bets/tracked/route.ts`; the form submits ONLY to `/api/bets/tracked`; success and replay share `router.push('/bets/<bet_id>')`; the form uses `createSubmitIntent`/`beginSubmit`/`resolveSubmit`/`fingerprintPayload` with exactly one injected `crypto.randomUUID` and no component-local lifecycle refs; no service_role; no direct table access; strict shared schema without scanner noise); leg ordering + `create_quick_bet` regression.
- `scripts/test-rate-limit.mjs` — `RATE_LIMITS.trackedBet` config + `/api/bets/tracked` wiring added to the Decision #052 route sweep (12/12 total).
- No regressions: domain-write-boundaries 14/14 (its recursive sweep also proves the form no longer reads `bankrolls` directly), provider-safety 97/97, analysis-quality-gate 26/26, auth-invite 16/16, csp-security 18/18, `tsc --noEmit` clean, lint clean.

## Production Phase B checkpoint (2026-07-16)

- **Deployment:** PR #159 merged as `1926d9a82759cd1e4e97378ca15addf010c0bf28`; the production deployment reached READY.
- **Execution window:** 2026-07-16T18:24:10Z–18:24:22Z. A temporary authenticated synthetic user issued exactly one `POST /api/bets/tracked`; HTTP 200 returned `replayed=false`.
- **Financial/result state:** manual Single, stake 1, odds 2, balance 100→99; exactly 1 bet, 1 leg with `leg_index=1`, 1 stake transaction, and 0 Decision rows. Stake metadata contained exactly `leg_count`, `request_hash`, and `source`.
- **Preflight note:** one earlier password-auth attempt failed before any tracked-bet POST because the temporary Auth fixture required token-field normalization. It caused no bet or stake write and did not consume the one authorized tracked-bet call.
- **Cleanup:** global sign-out left 0 active sessions; deleting the temporary user cascade-cleaned users, identities, sessions, profiles, bankrolls, transactions, bets, legs, and decisions to zero. Provider calls were 0.
- **Coverage boundary:** this was an authenticated production API-level smoke of the real cookie-session route and RPC. Authenticated browser/UI automation was not performed.

## Post-execution boundaries

```txt
migrations / RPC changes in Phase B: 0
create_quick_bet: UNCHANGED (defined in 001/010/016; no remaining UI callers)
direct DML on financial tables: 0
service_role in the user flow: 0
provider calls: 0
additional synthetic production smoke: NOT AUTHORIZED by this record
Analyst/Scout/pricing/probability/edge/EV surfaces: UNTOUCHED
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
- `lib/bets/tracked-bet.ts` — shared strict client/server contract; canonical sport allowlist source (consumed by `app/(app)/bets/new/page.tsx` and `app/api/bets/tracked/route.ts`)
