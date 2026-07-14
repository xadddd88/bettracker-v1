# BetTracker AI — Project State

> **Source of truth for current engineering and beta status.**
> Last updated: 2026-07-14 (Decision #057 results ingestion & settlement trust contract)

## 1. Executive Status

| Field | Current state |
|---|---|
| Engineering shell | **READY** — production is stable and guarded by CI, RLS/RPC write boundaries, FP-001 checks, and durable rate limits |
| Product Vision Beta | **NOT READY** — core product capabilities and trusted sports-data usage remain incomplete |
| External beta launch | **PAUSED** — product decision; do not invite external users yet |
| Production | `https://btdk.app` |
| Repository | `xadddd88/bettracker-v1` |
| Branch model | Feature branch → PR → CPO review/accept → founder merge |
| Latest completed operational milestone | **#057 — Results Ingestion & Settlement Trust Contract (EXECUTED / CLOSED, docs-evidence only)** |
| Highest-numbered executed decision | **#057 — Results Ingestion & Settlement Trust Contract** |
| Active decision | **#056 — Canonical-Linked SportMonks Class A Structural Presence Dry-Run (implementation merged/deployed; runtime provider call not approved / not run)** |
| Current security state | **Decision #054 Report-Only observation period — Phase B NOT APPROVED** |
| Next unreserved decision | **#058** |

The previous blocker "production has 0 SportMonks links" is obsolete. Identity mapping is complete for the controlled EPL fixture. Decision #034 completed one canonical-linked base-response dry-run with zero writes. Decision #055 then closed the trust/storage contract. Decision #056's Class A structural-presence implementation is merged and deployed (PR #146); its production provider call remains not approved and has not been run. Decision #057 closed the results-ingestion and settlement trust contract (docs-evidence only; no results runtime, result writes, or automated settlement is approved).

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
5. Results ingestion and complete settlement semantics (leg-level/parlay/push/cash-out/partial) — trust contract defined by Decision #057; every runtime/write/settlement step remains separately gated.
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
```

## 7. Documentation and Migration Status

- Decision #053 reconciled this file, README, the numbering ledger, and the migration inventory.
- `supabase/migrations` contains numbered files through 023, with no 008 file.
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
#058 — next unreserved decision
```

PR #90 is closed without merge; its policy is not adopted. Decision #020 is never reused.
