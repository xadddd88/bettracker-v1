# Results Ingestion & Settlement Trust Contract — Decision #057

## Status

**EXECUTED / CLOSED 2026-07-14 — DOCUMENTATION / EVIDENCE ONLY.**

Founder approval: `APPROVE #057`. Executed by the merge of the Decision #057 docs PR; no runtime step exists for this decision.

This decision does not approve runtime code, provider calls, migrations, Supabase queries or writes, environment changes, result writes, automated settlement, bankroll mutations, odds work, Scout/Analyst/UI changes, or betting signals. It defines the trust, normalization, storage, reconciliation, and financial-safety contract that must exist before BetTracker can ingest fixture results or perform any automated settlement.

## Objective

BetTracker settles bets manually today. Before any provider result can influence a bet, a payout, or a bankroll, three independent trust layers must exist, each with its own validation and its own promotion gate. This document records the current repository evidence, defines those layers, and marks every settlement case that remains unsupported as BLOCKED / REQUIRES SEPARATE DECISION.

All claims below are proven from repository code and migrations. No production database state is asserted beyond what earlier decisions recorded with DB evidence.

## 1. Evidence baseline

### 1.1 Manual settlement exists (implemented)

- Route: `app/api/bets/[id]/settle/route.ts` — authenticated POST; validates `outcome ∈ {won, lost, void}` (`VALID_OUTCOMES`, line 6); pre-checks bet ownership via a `user_id`-scoped select before calling the RPC (lines 21–26); maps `already_settled` → 409 and `bet_not_found` → 404 (lines 53–56).
- UI: `components/bets/QuickSettle.tsx` (Won/Lost/Void buttons) and `app/(app)/bets/[id]/SettleActions.tsx` — both offer exactly `won | lost | void`.
- Dashboard prompt: `app/(app)/dashboard/page.tsx` (lines 113–120) nudges the user to settle pending bets manually ("Record your results to keep analytics accurate"). Settlement is user-initiated in every path.

### 1.2 `settle_bet` RPC — exact supported outcomes (implemented)

Defined in `supabase/migrations/003_settlement.sql`; current body in `supabase/migrations/012_settle_bet_fixes.sql` (function-only replacement). Proven properties:

- Signature `settle_bet(p_bet_id uuid, p_outcome text)`, `SECURITY DEFINER`, `SET search_path = public`.
- Accepted outcomes: **`won`, `lost`, `void` only** (`invalid_outcome` otherwise, 012 lines 38–40).
- Ownership: `auth.uid()` required; row selected `WHERE id = p_bet_id AND user_id = v_user_id FOR UPDATE` (012 lines 43–46) — lock and ownership in one statement.
- Duplicate protection: `status != 'pending'` → `already_settled` (012 lines 53–55). Combined with `FOR UPDATE`, this makes the current RPC **financially replay-safe against duplicate payout**: a second settlement attempt cannot credit the bankroll again — it raises `already_settled` rather than replaying the original response. There is no idempotency key on the payout path; that is a future automation/revision-correlation gap (G5), not a current duplicate-payout vulnerability.
- Financial math (012 lines 57–67):
  - won: `pnl = stake × (total_odds − 1)`, `payout = stake × total_odds`;
  - lost: `pnl = −stake`, `payout = 0`;
  - void: `pnl = 0`, `payout = stake`.
- Bankroll: won/void credit `payout` to the owning bankroll and insert one `bankroll_transactions` row `type='payout'` with `balance_after` **only when `bankroll_id IS NOT NULL`** (012 lines 85–93) — a bet with no linked bankroll settles with no payout transaction at all. Lost mutates no bankroll and only reads the balance for the return value (012 FIX 2).
- Legs: all `bet_legs` of the bet are set to the same outcome as the bet (012 FIX 1, lines 78–82). **There is no leg-level settlement.**
- Grants: `EXECUTE` to `authenticated` (003/012); `REVOKE` from `PUBLIC`/`anon` in `supabase/migrations/010_security_hardening.sql` (lines 52–54).
- Design note (003 lines 15–20): no `settlement_payout` column on `bets` by design; `bets.pnl` is the authoritative net P&L and `bankroll_transactions` (`type='payout'`) is the canonical gross-payout ledger.

### 1.3 Atomicity, idempotency and ownership guarantees (implemented)

- Direct DML on `bets`/`bet_legs` by `authenticated` is revoked; SELECT-only with own-row RLS (`supabase/migrations/018_enforce_domain_write_boundaries.sql`, lines 108–125; Decision #048 bypass tests). Bets can change only through the reviewed RPCs: `create_quick_bet`, `place_bet_from_decision`, `settle_bet`.
- `bankroll_transactions.type` CHECK: `deposit | withdrawal | stake | payout | adjustment | bonus` (`001_initial_schema.sql`); append-only for users after #048.
- `adjust_bankroll` (Decision #047, `016_atomic_financial_writes.sql`) requires a client UUID `idempotency_key` with a partial unique index `uq_bankroll_tx_user_idempotency_key` (lines 42–46). **`settle_bet` predates this policy and has no such key.** Its lock-plus-status-gate design already prevents duplicate payouts today; the missing key matters for future automation (safe retries, result-revision correlation), not as a present vulnerability.
- Creation paths write `status='pending'` exclusively (`create_quick_bet` in 001/016; `place_bet_from_decision` in 002/016/017 with funds guard and pending-only + AI trust gate).

### 1.4 Bet and bet-leg structures (implemented)

- `bets` (`001_initial_schema.sql` lines 107–127): `bet_type CHECK (single|parlay|system)`, `stake > 0`, `total_odds`, `potential_payout`, `status CHECK (pending|won|lost|void|push|cashed_out|partial)`, `pnl`, `settled_at`, `settlement_outcome CHECK (won|lost|void)` (added by 003).
- `bet_legs` (001 lines 130–145): `leg_status CHECK (pending|won|lost|void|push)`, `odds > 0`, `line`, `result_notes`; ownership via parent bet (RLS) plus a cross-user `decision_id` trigger (001 lines 254–271).
- TypeScript mirrors the schema: `BetStatus` and `LegStatus` unions in `types/index.ts` lines 8–9.

### 1.5 `fixture_results` schema (implemented as schema; unused by code)

`supabase/migrations/013_sports_data_foundation.sql` lines 179–200:

- `canonical_fixture_id` NOT NULL FK → `canonical_fixtures` (CASCADE); `UNIQUE (canonical_fixture_id, provider)` — one row per provider per fixture, latest-state, not append-only.
- `provider CHECK (api_football | sportmonks | api_tennis)`.
- `status CHECK (scheduled | live | finished | postponed | cancelled | abandoned | retired | walkover)` — mirrors `canonical_fixtures.status`.
- `outcome_data jsonb NOT NULL DEFAULT '{}'` (unstructured), `winner_ref text`, `needs_manual_review boolean` (always true for tennis retired/walkover/abandoned per the 013 §8/§14 comment; partial index line 200), `raw_provider_payload jsonb`, `provider_updated_at`, `ingested_at`, `sync_run_id`.
- RLS enabled with **no policies** — service-role only (013 lines 279–292).
- **No application code reads or writes `fixture_results`.** The only repository reference outside migrations is a blocked-usage string in `lib/providers/sportmonks-structural-presence-dry-run.ts:83`.
- Production rows: **0 at the Decision #055 verification (2026-07-14)**. No later count is claimed — no DB query was run for this decision.

### 1.6 Cash-out, push, void, parlay and partial semantics (documented only / not implemented)

- `push`, `cashed_out`, `partial` exist in the `bets.status` CHECK and in `BetStatus`, and `push` exists in `leg_status`/`LegStatus` — but **no write path can produce any of them**: creation RPCs write `pending`, `settle_bet` writes only `won|lost|void`. They are unreachable states.
- Display contract is also incomplete: only `push` and `cashed_out` have explicit `STATUS_STYLE` entries on the list page (`app/(app)/bets/page.tsx` lines 21–22); `partial` has **no** style entry, and any unknown status falls back to the Void badge (`STATUS_STYLE[bet.status] ?? STATUS_STYLE.void`, line 118) — a `partial` bet would silently render as "Void" (G12).
- No cash-out formula, partial-payout path, or half-win/half-loss (Asian handicap) representation exists anywhere in code or schema.
- Parlay: `bet_type` allows `parlay|system`, but both creation RPCs build single-leg bets, and `settle_bet` forces every leg to the bet outcome. Leg-by-leg parlay resolution does not exist.

### 1.7 Dashboard/analytics assumptions (implemented, contradictory)

- `lib/analytics/performance.ts` lines 60–75: settled = won+lost+void; **void excluded from ROI and win rate** ("per sprint spec"); `netProfit` = Σ`pnl` over settled.
- `app/(app)/bets/page.tsx` lines 47–53: `settled = status !== 'pending'`; **win rate = won ÷ all settled (void counted in the denominator)** and ROI over all settled stake including void.
- These two definitions disagree. In addition, any future bet in `push`/`cashed_out`/`partial` would be counted as "settled" by the bets page but fall out of every bucket in `performance.ts` (neither settled nor pending). **CONTRADICTORY — a single settled-metrics definition is required before automated settlement can feed analytics.**
- `app/api/coach/route.ts:107` is a third *implementation*, not a third distinct formula: it computes won ÷ (won+lost), matching `performance.ts`. The divergence to reconcile is between the bets page and the other two.

### 1.8 Provider-link and canonical-fixture boundaries (implemented)

- `fixture_provider_links` (013): `mapping_confidence CHECK (exact|high|medium|low|needs_review)`, `UNIQUE (provider, provider_fixture_id)`, `UNIQUE (canonical_fixture_id, provider)`.
- `football_enrichment` binds to a same-fixture SportMonks link with exact/high confidence via a validation trigger (013; Decision #045/#046 lineage). This is the precedent: **provider-derived rows must be bound to a trusted link at write time.**
- `lib/providers/fixture-sync.ts` writes only identity tables (`canonical_fixtures`, `fixture_provider_links`) behind `SPORTS_FIXTURE_SYNC_WRITE_ENABLED`; it never touches results, bets, or bankrolls.
- Decisions #034/#055/#056 pin the identity chain for one canonical fixture and hold all enrichment persistence.

### 1.9 Known gaps and contradictions (summary)

| # | Finding | Class |
|---|---|---|
| G1 | `push`/`cashed_out`/`partial` (and leg `push`) are schema/type states with no producer; only `push` and `cashed_out` have explicit list-page styles | documented only |
| G2 | No leg-level settlement; parlay/system bets cannot resolve leg-by-leg | not implemented |
| G3 | No cash-out, half-win/half-loss, or partial-settlement math anywhere | not implemented |
| G4 | Two conflicting win-rate/ROI definitions (bets page vs `performance.ts`) | contradictory |
| G5 | `settle_bet` has no idempotency key — a future automation/revision-correlation gap; the `FOR UPDATE` + pending-status gate already prevents duplicate payouts today | incomplete |
| G6 | No deterministic rounding/currency contract: settlement math is raw `numeric`; display uses `.toFixed(2)`/`.toFixed(1)` (`lib/money.ts`, analytics pages) | incomplete |
| G7 | `fixture_results` lacks score columns, schema version, validation/finality state, and correction/revision lineage; `outcome_data` is unstructured jsonb | incomplete |
| G8 | `fixture_results.status` enum has no `suspended/interrupted` or `unknown` value — unknown provider states cannot currently be represented fail-closed | incomplete |
| G9 | `fixture_results.raw_provider_payload` exists; Decision #055 records that raw provider payload is not a product contract | contradictory (schema vs trust stance) |
| G10 | No code path links `fixture_results` to `bets`/`bet_legs`; no market-outcome mapping exists | not implemented |
| G11 | No settlement audit trail beyond `settled_at`/`settlement_outcome`/one payout transaction; no reversal/correction path | not implemented |
| G12 | `partial` has no `STATUS_STYLE` entry on the bets list page; unknown statuses fall back to the Void badge | incomplete (display contract) |

## 2. Trust layers

A provider response must never mutate a bet or a bankroll directly. Three layers, each independently gated:

**Layer A — Provider observation (untrusted).** What a provider said: provider fixture ID, provider state string, score/period data, source timestamps. Provider-scoped, unnormalized, potentially wrong, potentially revised. May exist only as an observation record; may not touch canonical status, bets, payouts, or bankrolls.

**Layer B — Canonical normalized result (trusted data, no money).** A canonical-fixture-owned record produced from Layer A only through the identity gate (§3) and status normalization (§4): normalized status, normalized score, period/finality semantics, provenance (provider, provider fixture ID, sync/run ID), schema version, and validation state. Layer B is the only thing a future settlement process may read. Layer B still moves no money.

**Layer C — Financial settlement (trusted money).** Bet/leg outcome determination, payout and P&L computation, and bankroll mutation. Layer C consumes only verified-final Layer B records plus the bet's own market definition, executes only through a separately approved server-side RPC/workflow honoring every invariant in §7, and is separately authorized per Decision.

Crossing A→B and B→C each requires its own promotion gate (§10). Nothing in this decision authorizes either crossing.

## 3. Fixture identity gate

Before any Layer A observation can normalize into Layer B:

- an `exact`/`high` `fixture_provider_links` row must bind the provider fixture to the canonical fixture (the `football_enrichment` trigger precedent, §1.8);
- sport and kickoff identity must validate against the canonical fixture (the Decision #034 pattern: sport ID, league, kickoff minute; present-but-invalid identity fields FAIL CLOSED);
- any provider mismatch (wrong fixture, wrong sport, kickoff drift beyond tolerance) blocks normalization and everything downstream, and flags manual review;
- a raw provider payload is not a settlement contract: no field may be consumed downstream unless it passed sanitization and normalization into Layer B.

## 4. Result status normalization

Every provider state must map through an explicit, versioned normalization table to exactly one canonical result status. Minimum canonical set to cover (superset of today's `fixture_results` CHECK):

`scheduled`, `live`, `finished` (final), `postponed`, `cancelled`, `abandoned`, `suspended/interrupted`, `walkover` (plus tennis `retired`, already in schema), and **`unknown`** for any unmapped or provider-specific state.

Rules:

- only an explicitly normalized **and verified-final** state may become a future settlement candidate;
- `unknown` or ambiguous status FAILS CLOSED: no Layer B finality, no settlement candidacy, `needs_manual_review = true`;
- the current schema cannot represent `suspended/interrupted` or `unknown` (G8) — extending the enum requires a separately approved migration;
- tennis `retired`/`walkover`/`abandoned` always require manual review (existing 013 rule) and their bet-outcome semantics are BLOCKED / REQUIRES SEPARATE DECISION (bookmaker rules differ).

## 5. Freshness and finality

- `sourceUpdatedAt` (provider) and `collectedAt`/`ingested_at` (ours) are distinct fields and must never be conflated; `collectedAt` is never source freshness (Decisions #034/#055 evidence: SportMonks base response exposed no valid `updated_at`).
- Missing or stale source freshness keeps a result **unverified**: it may exist in Layer B as non-final, but cannot become a settlement candidate.
- Corrections/revisions: a provider changing an already-observed result must produce a new observation with revision lineage (§8), re-run normalization, and flag review if the prior record was final — never a silent overwrite.
- Provider finality alone must not automatically authorize financial writes. Finality verification policy (e.g. second-provider confirmation, or a defined post-final stability window) is BLOCKED / REQUIRES SEPARATE DECISION.

## 6. Settlement semantics matrix

Required future semantics. `settle_bet` today implements only bet-level `won`/`lost`/`void` with all legs forced to the bet outcome. Nothing here invents formulas: every case not already proven in code is BLOCKED.

| Case | Current repository state | Future contract status |
|---|---|---|
| Single bet — won | `pnl = stake×(odds−1)`, payout `stake×odds` (012) | Supported manually; automation BLOCKED / REQUIRES SEPARATE DECISION |
| Single bet — lost | `pnl = −stake`, no bankroll write (012) | Supported manually; automation BLOCKED / REQUIRES SEPARATE DECISION |
| Single bet — void | `pnl = 0`, stake returned (012) | Supported manually; automation BLOCKED / REQUIRES SEPARATE DECISION |
| Push | Status exists (bets/legs), no producer, no formula (G1) | BLOCKED / REQUIRES SEPARATE DECISION (incl. whether push ≡ void financially) |
| Cancelled/postponed fixture → bet handling | No fixture↔bet link exists (G10) | BLOCKED / REQUIRES SEPARATE DECISION (void-vs-wait policy per market) |
| Parlay/accumulator — leg by leg | Not representable: legs forced to bet outcome (G2) | BLOCKED / REQUIRES SEPARATE DECISION (leg model + combined-odds recomputation on void/push legs) |
| Parlay — mixed settled and unresolved legs | Not representable | BLOCKED / REQUIRES SEPARATE DECISION |
| Partial / half win (Asian ¼ lines) | No representation (G3) | BLOCKED / REQUIRES SEPARATE DECISION |
| Partial / half loss | No representation (G3) | BLOCKED / REQUIRES SEPARATE DECISION |
| Cash-out | Status exists, no formula/path (G1, G3) | BLOCKED / REQUIRES SEPARATE DECISION (user-entered amount vs computed) |
| System bets | `bet_type='system'` allowed at schema level only | BLOCKED / REQUIRES SEPARATE DECISION |
| Result correction after settlement | No reversal path (G11) | BLOCKED / REQUIRES SEPARATE DECISION (§9) |

A future automated-settlement decision must resolve each row it enables with explicit formulas, rounding, and tests — silently reusing the manual `won/lost/void` math for new cases is prohibited.

## 7. Financial invariants

Binding on any future settlement automation:

1. Server-side calculation only — no client-supplied payout, P&L, or user ID (existing `settle_bet` already recomputes and ignores `potential_payout`). Outcome semantics differ by path: manual settlement may accept only the existing allowlisted user-selected outcome (`won|lost|void`) through the authenticated manual route; future automated settlement must derive the outcome server-side from a verified Layer B result and must never accept a client-supplied automated outcome, payout, P&L, or user ID.
2. `auth.uid()`-scoped ownership for user-initiated paths; an automated path must carry an explicit, audited actor identity and per-user scoping — it never runs as an anonymous bulk write.
3. Row locking (`FOR UPDATE`) on the bet before outcome evaluation (existing pattern, 012).
4. Idempotency: an automated settlement write requires a deterministic idempotency key (e.g. bet ID + result revision), unique-indexed as in `adjust_bankroll` (016) — the manual status gate alone (G5) is insufficient for retried automation.
5. No duplicate bankroll transaction per bet settlement; payout inserts must be replay-safe.
6. Deterministic rounding/currency contract REQUIRED before automation (G6): storage precision, rounding mode, and per-currency minor units must be decided in a separate decision — display-layer `.toFixed(2)` is not a financial contract.
7. Result correction must never silently double-credit or double-debit: reversal requires an explicit compensating-transaction design (§9), not an in-place update.
8. Automated settlement must use a separately approved RPC/workflow; the existing `settle_bet` (authenticated, user-initiated, three outcomes) must not be silently repurposed as the automation entry point.
9. Every settlement mutation stays inside one database transaction covering bet, legs, and bankroll ledger.

## 8. Storage boundary

Minimum future normalized result record (Layer B). The existing `fixture_results` table is the natural candidate but is missing required fields (G7, G8); **no migration or write is approved by this decision**:

- canonical fixture ID (exists);
- provider + provider fixture ID (provider exists; provider fixture ID must be recorded on the result row — currently only on the link);
- normalized status from the §4 table (enum must gain `suspended/interrupted`, `unknown`);
- home/away score or sport-specific equivalent as **structured, validated fields** — today's free-form `outcome_data jsonb` does not satisfy the contract;
- regulation/period semantics (FT/AET/penalties; sets for tennis);
- source updated timestamp (`provider_updated_at` exists) — distinct from ingestion timestamp (`ingested_at` exists);
- schema version (missing);
- validation/finality state (missing — `needs_manual_review` alone is not a finality model);
- sync/run ID (exists);
- correction/revision lineage (missing — `UNIQUE (canonical_fixture_id, provider)` forces overwrite-in-place today, which conflicts with §5 revision rules).

Boundaries:

- `football_enrichment` is NOT a generic result store (Decision #055) — results never live there;
- raw provider payload persistence (existing `raw_provider_payload` column, G9) requires an explicit retention/licensing policy in the enabling decision; raw payload is never a settlement input;
- Layer B rows remain service-role-only until a consumer gate (§10) opens them.

## 9. Reconciliation and manual review

All of the following FAIL CLOSED (no Layer B finality, no settlement, `needs_manual_review`/blocked state, explicit reviewed policy required):

- duplicate provider events for the same fixture (same or different `sync_run_id`);
- conflicting providers (`api_football` vs `sportmonks` disagree on score/status; the 013 comment already anticipates a cross-check setting `needs_manual_review`);
- score correction after a result was marked final — and, worse, after a bet was settled from it (requires the §7.7 compensating design; BLOCKED);
- provider-link mismatch or confidence below exact/high (§3);
- missing source freshness (§5);
- unsupported market: no verified mapping from the bet's `market_type`/`selection`/`line` to the normalized result — **no such mapping exists today for any market** (G10);
- bet already manually settled when an automated candidate arrives — automation must never override a manual settlement silently;
- manual outcome conflicting with the provider result — surfaced for review; the human record wins until a reviewed policy says otherwise.

## 10. Promotion gates

Each step requires a separate CPO decision; completing one gate never implies the next:

1. **Results read-only dry-run** (Layer A observation, zero writes): identity gate proven for the target fixture; sanitized report contract defined; one-request budget; explicit runtime authorization (the Decision #034/#056 pattern).
2. **Result normalization write** (Layer B): §8 storage contract satisfied via an approved migration; §4 normalization table versioned and reviewed; §5 freshness/finality policy decided; reconciliation policies (§9) in place; write path service-role-only and tested.
3. **Automated single-bet settlement** (Layer C, singles only): §6 rows enabled with explicit formulas; §7 invariants implemented (idempotency key, rounding contract, audited actor); market-outcome mapping decided for the enabled markets; manual-conflict policy decided; reversal design exists at least on paper with double-credit tests.
4. **Parlay settlement**: leg-level model implemented (schema + RPC); combined-odds recomputation for void/push legs decided; mixed-state handling decided.
5. **UI/analytics consumption**: the G4 metrics contradiction resolved into a single reviewed definition; settled-state taxonomy (incl. any newly producible statuses) reflected consistently in `performance.ts`, bets page, dashboard, and coach, with explicit display styles for every producible status (G12); FP-001 re-checked (results are facts — they must not become probability/edge/EV/recommendation/Place Bet signals).

## 11. Candidate next scope

A later decision may propose exactly one **read-only, zero-write result-presence dry-run** for one canonical-linked finished fixture (Layer A observation only, sanitized presence/shape report, one provider request, no persistence).

**Decision #057 does NOT authorize that runtime call**, its implementation, or any schedule for it.

## 12. Explicit non-use

```txt
provider calls: 0
runtime code: 0
Supabase writes: 0
Supabase reads (queries): 0
migrations: 0
environment changes: 0
result writes: 0
automated settlement: 0
bankroll mutations: 0
odds writes: 0
Scout / Analyst / UI changes: 0
betting signals: 0
Decision #056 runtime: NOT APPROVED / NOT RUN
Decision #050 SMTP round-trip: PENDING
CSP Phase B: NOT APPROVED
FP-001: ACTIVE
```

## References

- `supabase/migrations/001_initial_schema.sql` — bets, bet_legs, bankroll_transactions, create_quick_bet
- `supabase/migrations/003_settlement.sql`, `supabase/migrations/012_settle_bet_fixes.sql` — settle_bet lineage
- `supabase/migrations/010_security_hardening.sql` — RPC grant hardening
- `supabase/migrations/013_sports_data_foundation.sql` — fixture_results, fixture_provider_links, canonical_fixtures
- `supabase/migrations/016_atomic_financial_writes.sql` — adjust_bankroll idempotency precedent, funds guards
- `supabase/migrations/017_prepare_domain_write_boundaries.sql`, `018_enforce_domain_write_boundaries.sql` — SELECT-only domain boundary
- `app/api/bets/[id]/settle/route.ts`, `components/bets/QuickSettle.tsx`, `app/(app)/bets/[id]/SettleActions.tsx` — manual settlement surface
- `lib/analytics/performance.ts`, `app/(app)/bets/page.tsx`, `app/api/coach/route.ts` — settled-metrics assumptions (G4)
- `docs/sports-data-trust-contract-scope-decision-055.md` — trust classes and storage boundary precedent
- `docs/atomic-financial-writes-scope-decision-047.md`, `docs/domain-write-boundaries-scope-decision-048.md` — financial invariants precedent
