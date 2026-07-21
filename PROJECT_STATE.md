# BetTracker AI — Project State

> **Source of truth for current engineering and beta status.**
> Last updated: 2026-07-21 (Decision #064 foundation merged but unapplied; Decision #065 Broadcast Noir PR A opened; Decision #066 next unreserved)

## 1. Executive Status

| Field | Current state |
|---|---|
| Engineering shell | **READY** — production is stable and guarded by CI, RLS/RPC write boundaries, FP-001 checks, and durable rate limits |
| Product Vision Beta | **NOT READY** — core product capabilities and trusted sports-data usage remain incomplete |
| External beta launch | **PAUSED** — product decision; do not invite external users yet |
| Production | `https://btdk.app` |
| Repository | `xadddd88/bettracker-v1` |
| Branch model | Feature branch → PR → CPO review/accept → founder merge |
| Latest completed operational milestone | **PR #181 — Express/tracker correction and safe pending-bet cancellation; migration `20260721152711_cancel_pending_bet` applied; merged as `d5ebb87d`, deployed READY** |
| Highest-numbered closed decision | **#063 — Tracked-Leg Fixture Lineage Contract (docs-only; merged via PR #183 as `df4723f`)** |
| Active decisions | **#065 — Broadcast Noir Cross-Platform Rollout (Draft PR A: semantic tokens/primitives and contrast/parity CI only; no screens/runtime)**; **#064 — Tracked-Leg Fixture Lineage Foundation (implementation merged via PR #186; migration 025 + `create_tracked_bet_v2` unapplied; no caller/runtime authority)**; **#062 — Mobile Founder client (Phases 0/1B/1C merged; Phase 1A Bearer bridge merged via PR #170; authenticated Coupon Scanner merged via PR #171; Event analysis and automatic Tracker save remain deferred)**; **#061 — Founder Daily Flow Acceptance**; **#056 — Canonical-Linked SportMonks Class A Structural Presence Dry-Run (implementation merged/deployed; runtime provider call not approved / not run)** |
| Current security state | **Decision #054 Report-Only observation period — Phase B NOT APPROVED** |
| Next unreserved decision | **#066** — #065 is occupied and active as Broadcast Noir Draft PR A |

The previous blocker "production has 0 SportMonks links" is obsolete. Identity mapping is complete for the controlled EPL fixture. Decision #034 completed one canonical-linked base-response dry-run with zero writes. Decision #055 then closed the trust/storage contract. Decision #056's Class A structural-presence implementation is merged and deployed (PR #146); its production provider call remains not approved and has not been run. Decision #057 closed the results-ingestion and settlement trust contract (docs-evidence only; no results runtime, result writes, or automated settlement is approved).

Decision #060 migration 024 was applied to production on 2026-07-16 as `20260716142736_create_tracked_bet_024`, and the exact catalog contract was verified read-only. The authenticated smoke used a dedicated non-login synthetic account with a seed deposit of 100. It called `create_tracked_bet` twice: the initial write returned `replayed=false` and balance 90; the exact semantic replay returned `replayed=true`, the same `bet_id`, and balance 90 with zero additional writes.

Before cleanup, the synthetic account had 1 bet, 1 leg, 2 transactions, 1 stake transaction, and 0 decisions. Canonical normalized bet/leg values and the metadata allowlist were verified. The account and all related rows were deleted, and an independent post-transaction cleanup check confirmed 0 users, profiles, bankrolls, transactions, bets, legs, and decisions. All `bet_legs` rows with non-null `leg_index` were also 0 after cleanup.

Phase B (UI/API adoption) was approved on 2026-07-16, merged via PR #159 as `1926d9a82759cd1e4e97378ca15addf010c0bf28`, and deployed READY: `/bets/new` is the unified Single/Express tracker form (Scanner → editable ordered legs → Bet, mobile-first), writing exclusively through authenticated `POST /api/bets/tracked` → `create_tracked_bet()` with Decision #052 rate limiting, a strict shared zod contract mirror, a pure client idempotency state machine, and sanitized errors. `create_quick_bet` remains defined and unchanged with zero remaining UI callers.

The separately authorized Phase B production smoke verified the authenticated API path from 2026-07-16T18:24:10Z to 18:24:22Z. Exactly one `POST /api/bets/tracked` returned HTTP 200 for a manual Single (`stake=1`, `odds=2`, `replayed=false`), changed the seeded balance from 100 to 99, created exactly 1 bet, 1 ordered leg (`leg_index=1`), 1 stake transaction, and 0 Decision rows, and stored only the metadata keys `{leg_count, request_hash, source}`. This was an API-level smoke; no authenticated browser/UI automation was performed.

One preliminary password-auth attempt failed before any tracked-bet POST because the temporary Auth fixture required token-field normalization; it produced no bet or stake write. After the successful smoke, global sign-out left 0 active sessions and deletion of the temporary user cascade-cleaned users, identities, sessions, profiles, bankrolls, transactions, bets, legs, and decisions to zero. Provider calls were 0. Decision #060 is EXECUTED / VERIFIED / CLOSED; no additional synthetic smoke is authorized by this record.

Decision #061 (Founder Daily Flow Acceptance) is ACTIVE. Its Phase A read-only assessment found three P0/P1 correctness defects in the tracker input lifecycle; Phase A1 was merged via PR #162 as `a6d4ebbefcf49af71729c64cd33886d0592cf1fd` and deployed READY as `dpl_CkCEBy243hsJDcymMgZycZnby8Pw`. The accepted implementation head is `9fd1441f70bb782d51f444a0be85a405c8123ff0`, and all 7 resulting blob hashes match that head. Phase A1 closes the defects client-side only: the scanner adapter fails closed on >20 raw legs as a discriminated union (no truncation, no partial import, fixed non-echoing refusal message) and the refusal arms a submit gate checked before validation, UUID minting, and any network call — the leftover previous draft cannot be saved as the wrong bet until a valid scan replaces it or a deliberate manual payload edit takes ownership and switches source to manual; a repeat scan fully replaces every scanner-derived field (stale stake/bookmaker can no longer carry over; notes stay user-owned); and one `busy` lock (`<fieldset disabled>` + `aria-busy` + synchronous ref guards on all scan entry points and submit) freezes the whole draft during scans and in-flight financial submits without ever cancelling the financial fetch. Post-deployment runtime errors were 0. No production smoke or scanner/API/Supabase runtime call or write was performed for Phase A1. The Playwright/Supabase-stub browser E2E harness proposed in Phase A remains deferred and was not approved or run. Phase A1 changed no migrations, RPCs, schemas, or API routes.

2026-07-21 reconciliation checkpoint: PR #183 recorded Decision #063 and merged as `df4723f2d55b220a4f64f54baf56a3333a8a61b7`; PR #182 merged as `d103947f9193891589cda1c5f1073e3004d84307` and deployed its fail-closed result-grading foundation without authorizing production provider calls, result writes, scheduling, or automated settlement; PR #181 applied production migration `20260721152711_cancel_pending_bet`, passed a fully rolled-back transactional smoke, merged as `d5ebb87d891169b5e3c7959381d4a5011e10e07e`, and deployed READY as `dpl_6FqYmN7gmLSvJPKSeX4USkJ1xJPp`. PR #181 is an unnumbered tracker/cancellation correction and does not consume or reassign Decision #062; #062 remains the Mobile Founder client.

Mobile repository checkpoint: PR #170 merged the Decision #062 Phase 1A authenticated Bearer bridge as `5ef838d5d863bf8dd0436e437d1ad85f06525a36`; PR #171 merged the authenticated mobile Coupon Scanner as `43a6ee7fe5944dc1ed64d81a715bd94a7f02d11d`. Coupon analysis remains review-only and never saves a Tracker bet automatically; Event analysis remains deferred. This documentation receipt asserts no new production mobile smoke, Supabase/provider call, settlement, or financial write.

## 2. Current Production Facts

### Sports identity chain

The controlled end-to-end identity chain is proven for one canonical fixture:

```txt
Canonical fixture: Arsenal vs Coventry City
Kickoff: 2026-08-21 19:00 UTC
canonical_fixture_id: 92afd570-399a-48b9-915a-e1ffaf52a71c
api_football provider fixture: 1557367 (exact)
sportmonks provider fixture: 19722203 (high)
```

Completed milestones:

| Decision | Result |
|---|---|
| #044 | EPL dry-run/write and SportMonks discovery execution record completed |
| #045 | Controlled SportMonks provider-link write implemented and executed |
| #046 | Provider-link execution/validation record merged |
| #034 | Canonical-linked SportMonks base-response dry-run executed and accepted; zero writes |
| #055 | Sports-data trust classes, storage boundary, provenance/freshness contract, and promotion gates closed |
| #057 | Results-ingestion & settlement trust contract closed (docs-evidence only; runtime/writes/settlement remain gated) |
| #058 | Settlement metrics unified (G4) and status presentation made explicit (G12); no new settlement semantics |
| #059 | Result-presence dry-run eligibility verified as BLOCKED (no finished fixture); future run's fail-closed contract pinned |

Current downstream boundary:

```txt
provider identity link exists
Decision #034 base-response identity check passed
no enrichment family or valid source updated_at was observed
Decision #055 trust/storage boundary is closed
Decision #056 implementation does not authorize runtime execution
football_enrichment rows remain 0 and are not approved for use
no provider data may unlock Analyst/Scout/UI pricing or betting signals
```

### Financial and domain integrity

| Decision | Result |
|---|---|
| #047 | Atomic bankroll adjustment, idempotency, no-overdraft guards, currency sync, and financial UI fixes executed |
| #048 | Seven core tables made SELECT-only for authenticated users; writes moved to approved RPC/server paths; bypass tests passed |
| #049 | Scout/Coach agent-table write boundaries enforced; direct authenticated writes removed; state-machine and bypass tests passed |

Authenticated users no longer have direct DML access to the protected financial, Decision, analysis, Scout, or Coach domain tables. Bankroll transactions are append-only through approved operations. Negative historical bankroll data was preserved for reconciliation; new stakes and withdrawals cannot worsen an insufficient balance.

### Trust and FP-001

| Decision | Result |
|---|---|
| #051 | 78 pre-gate pricing records quarantined with originals preserved for audit; live fabricated pricing fields scrubbed |
| #052 | Durable Postgres-backed rate limits executed; fail-closed helper; real parallel production test passed |

Active trust rules:

```txt
data present != model ready
provider identity != enrichment approval
enrichment fact != probability / edge / EV / recommendation
trust-blocked AI Decision cannot be placed through UI or RPC
```

### Registration

Decision #050 is **DEPLOYED / ROUTE-VERIFIED**, but not fully executed until the founder completes a real SMTP round-trip:

```txt
approve test email
→ request invite
→ receive email
→ click link
→ set password
→ dashboard
→ beta_access: approved → invited → used
```

Do not mark #050 fully executed before that manual verification.

## 3. Sports Data Status

### Football fixtures and enrichment

- API-Football/API-Sports Ultra remains the broad fixture/odds/results provider.
- SportMonks remains the football-depth provider.
- The controlled cross-provider link exists for the Arsenal–Coventry fixture.
- Mapping discovery and provider-link write are complete for this fixture.
- Decision #034 completed the one approved canonical-linked base-response dry-run: identity match, no enrichment families, no valid source `updated_at`, zero writes.
- Decision #055 classifies structural identity, dynamic facts/provider analytics, and market/model data before any storage or consumer approval.
- Decision #056's separate, pinned `participants;league;season;round;venue;state` presence-only dry-run is implemented, merged, and deployed; the production call remains separately blocked and has not been run.
- **Further football enrichment provider calls/writes remain on HOLD** until an explicit runtime authorization.
- Production inventory at #055 approval: 3 canonical fixtures, 4 provider links, 0 football enrichment rows, 0 fixture result rows, 0 odds snapshot rows.
- Decision #059 re-verified the sports inventory on 2026-07-14 (read-only): all 3 canonical fixtures are football, `scheduled`, with future kickoffs (earliest 2026-08-21 19:00 UTC); provider links unchanged (3 exact api_football + 1 high sportmonks); `fixture_results` still 0 rows. **Result-presence dry-run eligibility: BLOCKED** — no finished fixture exists; the future run's fail-closed contract is pinned in the #059 scope doc.
- `football_enrichment` must not feed probability, edge, EV, recommendation, Place Bet, Scout, Analyst, or UI signals before trust validation.

### Odds / M1.3

M1.3 remains paused:

```txt
read-only odds dry-run: executed safely, no odds coverage for the original fixture
bookmaker discovery: partial/safe
/odds/mapping page 1: partial/safe, pagination guard stopped page 2+
filtered /odds/mapping parameters: unconfirmed
page 2+, crawl, writes, migrations, and user-facing odds: not approved
```

PR #106 is superseded because its conclusion — filtered mapping runtime blocked — is already recorded in main.

## 4. Security and Reliability Baseline

Current safeguards:

- provider requests use redirect blocking, body-read timeout coverage, strict pagination validation, bounded request budgets, and token redaction;
- provider-safety and FP-001 suites run on every PR;
- financial-safety, domain-write-boundary, agent-write-boundary, auth-invite, quarantine, and global-rate-limit suites are in CI;
- TypeScript and lint are explicit CI jobs;
- protected routes use global Postgres-backed rate limits shared across Vercel instances;
- limiter failures are fail-closed (`503`) before Anthropic or invite work;
- rate-limit keys are hashed before storage;
- production domain writes are mediated through reviewed RPC/server operations;
- Decision #054 Phase A hardens CSP report ingestion and adds baseline headers; CSP intentionally remains Report-Only pending evidence and nonce/hash design.

## 5. Active Product Blockers

External beta remains paused because the product vision is not yet complete. Important open areas:

1. Founder SMTP round-trip for Decision #050.
2. Decision #054 Report-Only observation period; enforced CSP and nonce/hash Phase B remain unapproved.
3. Decision #056 structural-presence runtime execution (implementation is merged and deployed; the production provider call remains separately blocked and has not been run).
4. Odds ingestion/normalization and user-facing trust validation.
5. Results ingestion and complete settlement semantics (leg-level/parlay/push/cash-out/partial) — trust contract defined by Decision #057; every runtime/write/settlement step remains separately gated. Decision #058 unifies the metric formulas (G4) and removes the misleading Void fallback (G12), but adds no new settlement semantics. Tracker legs in production still have no safe relationship to `canonical_fixtures` or `fixture_provider_links`. Closed docs-only Decision #063 defines the contract; active Decision #064 is merged as an unapplied migration/RPC foundation only, with no application caller or matching authority.
6. Trusted Analyst/Scout v2 using verified provider data rather than ungrounded pricing.
7. Full i18n UX, including Arabic RTL.
8. Mobile/tablet product polish and closed-beta onboarding.

## 6. Holds

Until a separate CPO decision changes them:

```txt
football enrichment calls/writes — HOLD
odds writes and mapping crawl — HOLD
new provider calls outside approved scopes — HOLD
provider data in Analyst/Scout/UI pricing — HOLD
results ingestion / result writes / automated settlement — HOLD (Decision #057 is docs-only)
probability / implied probability / edge / EV / recommendation signals — FP-001 gated
external beta invitations — PAUSED
CSP enforcement / nonce / strict-dynamic — NOT APPROVED in Phase A
Decision #060 — EXECUTED / VERIFIED / CLOSED; no further synthetic runtime smoke authorized
Decision #061 — Playwright / Supabase-stub E2E harness — DEFERRED, NOT APPROVED
Decision #064 — migration 025 / create_tracked_bet_v2 — IMPLEMENTATION MERGED, UNAPPLIED; no application caller
Decision #065 — Broadcast Noir PR A — DRAFT; tokens/primitives/CI only; no screens/runtime
```

## 7. Documentation and Migration Status

- Decision #053 reconciled this file, README, the numbering ledger, and the migration inventory.
- Decision #063 was approved and merged docs-only via PR #183 as `df4723f`.
- Decision #064 implementation merged via PR #186 as `4fce917701b95b3d3ad98ad9f157d02216323d3e`: additive migration 025, `create_tracked_bet_v2`, lineage constraints/triggers, rollback, and status docs. The migration remains unapplied and no caller/runtime authority exists.
- Decision #065 is opened as Broadcast Noir Draft PR A: one versioned semantic token source, Web/mobile primitives, contrast/parity assertions, and CI gate only. Screens/runtime remain unchanged; #066 is next unreserved.
- PR #182 merged as `d103947f` and deployed the fail-closed grading foundation without production provider calls, result writes, scheduling, or automatic settlement.
- PR #181 applied production migration `20260721152711_cancel_pending_bet`, merged as `d5ebb87d`, and deployed READY. Its emergency kill switch is `docs/cancel-pending-bet-rollback.sql`; the executable SQL is unchanged by the governance rename.
- `supabase/migrations` contains numbered files through 025, with no 008 file. Migration 025 is review-only and unapplied. Decision #060 is **EXECUTED / VERIFIED / CLOSED**. Migration 024 production version: `20260716142736_create_tracked_bet_024`; Phase B added no migrations.
- Production's timestamped migration ledger does not represent all earlier manually applied history.
- A fresh-database bootstrap is **not yet certified**; see `docs/migration-state-reconciliation-053.md`.
- Never run `001_initial_schema.sql` against production as a general setup command.

## 8. Current Decision Sequence

```txt
#034 — canonical-linked SportMonks enrichment dry-run — CLOSED 2026-07-14
#053 — Project State & Migration Reconciliation — EXECUTED / CLOSED
#054 — CSP Report Hardening & Security Headers, Phase A — EXECUTED / MERGED / DEPLOYED
#055 — Sports Data Trust Contract & Football Enrichment Storage Boundary — EXECUTED / CLOSED
#056 — Canonical-Linked SportMonks Class A Structural Presence Dry-Run — IMPLEMENTATION MERGED / DEPLOYED; RUNTIME NOT APPROVED / NOT RUN
#057 — Results Ingestion & Settlement Trust Contract — EXECUTED / CLOSED, DOCS-EVIDENCE ONLY
#058 — Settlement Metrics & Status Presentation Reconciliation — EXECUTED / CLOSED
#059 — Finished Fixture Eligibility & Result-Presence Dry-Run Scope — EXECUTED / CLOSED, DOCS-EVIDENCE ONLY (eligibility BLOCKED)
#060 — Founder-First Coupon-to-Tracker — EXECUTED / VERIFIED / CLOSED 2026-07-16 (Phase A + Phase B production API smoke)
#061 — Founder Daily Flow Acceptance — ACTIVE; Phase A1 merged via PR #162 as a6d4ebb, deployed READY; Phase A2 browser E2E deferred / not approved
#062 — Mobile Founder client — ACTIVE; Phases 0/1B/1C merged; Phase 1A Bearer bridge merged via PR #170; authenticated Coupon Scanner merged via PR #171; Event analysis and automatic Tracker save remain deferred
#063 — Tracked-Leg Fixture Lineage Contract — EXECUTED / CLOSED, DOCS-ONLY; Founder-approved; merged via PR #183 as df4723f; no runtime or production authority
#064 — Tracked-Leg Fixture Lineage Foundation — ACTIVE / IMPLEMENTATION MERGED via PR #186; migration 025 and create_tracked_bet_v2 unapplied; no caller/runtime authority
#065 — Broadcast Noir Cross-Platform Rollout — ACTIVE / DRAFT PR A; tokens/primitives/contrast/parity CI only; no screens/runtime
#066 — next unreserved decision (#065 is occupied and active)
```

PR #90 is closed without merge; its policy is not adopted. Decision #020 is never reused.
