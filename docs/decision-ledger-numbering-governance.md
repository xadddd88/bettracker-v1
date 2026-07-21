# Decision Ledger / Numbering Governance

Status: Decision #064 is occupied and ACTIVE as an implementation Draft. Migration 025 and `create_tracked_bet_v2` are review-only and unapplied. Decision #063 remains the highest-numbered CLOSED decision; #065 is next unreserved.
Last updated: 2026-07-21

## Purpose

This file prevents decision-number collisions. Historical numbers are immutable: gaps and retired reservations are never opportunistically backfilled.

## Current Number Map

```txt
Occupied: #001-#019, #021-#031, #033-#064
Do not reuse: #020
Retired reservation / do not reuse: #032
Occupied / closed: #063 — Tracked-Leg Fixture Lineage Contract (docs-only; merged via PR #183 as `df4723f`)
Occupied / active: #064 — Tracked-Leg Fixture Lineage Foundation (implementation Draft; migration 025 unapplied)
Highest-numbered closed: #063 — Tracked-Leg Fixture Lineage Contract (docs-only)
Active approved: #064 — Tracked-Leg Fixture Lineage Foundation (Draft PR only; migration/RPC unapplied; no caller)
                 #061 — Founder Daily Flow Acceptance (Phase A1 fail-closed tracker input lifecycle;
                 Playwright/Supabase-stub harness deferred)
                 #062 — Mobile Founder client (0/1B/1C merged; 1A Bearer bridge merged via PR #170; authenticated Coupon Scanner merged via PR #171)
                 #056 — Canonical-Linked SportMonks Class A Structural Presence Dry-Run
                 (implementation merged/deployed; runtime provider call not approved / not run)
Next unreserved: #065 (#064 is occupied and active)
```

## Recent Decisions

| Decision | Status / subject |
|---|---|
| #044 | EPL controlled fixture write + SportMonks discovery execution record — EXECUTED |
| #045 | Controlled SportMonks provider-link write — EXECUTED |
| #046 | Provider-link execution/validation record — EXECUTED |
| #047 | Atomic Financial Writes & No-Overdraft Policy — EXECUTED |
| #048 | Core Domain Write Boundaries — EXECUTED |
| #049 | Scout/Coach Agent Write Boundaries — EXECUTED |
| #050 | Registration Invite Flow — DEPLOYED / ROUTE-VERIFIED; founder SMTP round-trip pending |
| #051 | FP-001 Legacy Pricing Quarantine — EXECUTED |
| #052 | Global Durable Rate Limits — EXECUTED |
| #053 | Project State & Migration Reconciliation — EXECUTED / CLOSED |
| #054 | CSP Report Hardening & Security Headers, Phase A — EXECUTED / MERGED / DEPLOYED; Phase B NOT APPROVED |
| #055 | Sports Data Trust Contract & Football Enrichment Storage Boundary — EXECUTED / CLOSED; provider calls/writes not approved |
| #056 | Canonical-Linked SportMonks Class A Structural Presence Dry-Run — IMPLEMENTATION MERGED / DEPLOYED / READY; runtime call NOT APPROVED / NOT RUN |
| #057 | Results Ingestion & Settlement Trust Contract — EXECUTED / CLOSED, DOCS-EVIDENCE ONLY; no runtime, writes, or automated settlement |
| #058 | Settlement Metrics & Status Presentation Reconciliation (G4+G12) — EXECUTED / CLOSED by merge |
| #059 | Finished Fixture Eligibility & Result-Presence Dry-Run Scope — EXECUTED / CLOSED, DOCS-EVIDENCE ONLY; eligibility BLOCKED |
| #060 | Founder-First Coupon-to-Tracker — EXECUTED / VERIFIED / CLOSED 2026-07-16; Phase A + Phase B production API smoke verified |
| #061 | Founder Daily Flow Acceptance — ACTIVE; Phase A read-only assessment delivered; Phase A1 merged via PR #162 as `a6d4ebb`, deployed READY; Phase A2 browser E2E deferred / not approved |
| #062 | Mobile Founder client — ACTIVE; Phases 0/1B/1C merged; Phase 1A Bearer bridge merged via PR #170 as `5ef838d5`; authenticated Coupon Scanner merged via PR #171 as `43a6ee7f`; no production mobile smoke recorded |
| #063 | Tracked-Leg Fixture Lineage Contract — EXECUTED / CLOSED, DOCS-ONLY; Founder-approved; merged via PR #183 as `df4723f`; no runtime authority |
| #064 | Tracked-Leg Fixture Lineage Foundation — ACTIVE / IMPLEMENTATION DRAFT; migration 025 and `create_tracked_bet_v2` review-only and unapplied; no caller/runtime authority |

## Retired / Superseded Tracks

- **#020:** never reuse. PR #90 tried to claim it for Third-Party Manual Context Policy, but that PR is closed without merge and the policy is not adopted.
- **#032:** the old M1.3 filter-evidence reservation is retired after PR #106 was superseded. Keep the number unused to preserve audit history.
- A revived third-party manual-context policy must use **#065 or later** in a fresh PR.

## Rules

1. Scan `docs/decisions.md` and this ledger before assigning a number.
2. Use the next free number unless an explicit reservation exists.
3. Never renumber merged decisions.
4. Never backfill #020 or #032.
5. Record concurrent reservations before relying on them.
6. If a reserved PR is abandoned, retire the reservation in a docs/governance PR.
7. Execution-record PRs may ride under the original decision number and do not consume a new number.
8. Placeholder headings such as `#NNN` are templates, not occupied decisions.

## Current Holds

Decision numbering does not grant runtime authority. Decision #056's implementation is merged and deployed, but its production provider call, writes, migrations, environment changes, persistence, odds ingestion, and downstream use remain unapproved and the call has not been run. Decision #057 is executed as docs-evidence only: results ingestion, result writes, automated settlement, and bankroll mutations remain unapproved. Decision #058 reconciled reporting metrics and status presentation only — it changed no payout/settlement calculation, settlement outcome, write path, or provider work. Decision #059 recorded a BLOCKED eligibility verdict and a future dry-run contract only — the result-presence dry-run has no implementation and no runtime authorization. Decision #060 is EXECUTED / VERIFIED / CLOSED. Phase A migration 024, exact catalog verification, and its authenticated RPC smoke are verified. Phase B was merged via PR #159 and deployed READY; one separately authorized authenticated production API smoke made exactly one `POST /api/bets/tracked`, returned HTTP 200, verified 1 bet / 1 ordered leg / 1 stake transaction / 0 Decision rows, signed out, and finished with zero rows across all temporary identity and financial tables. No additional synthetic production smoke is authorized by that record. Decision #064 is ACTIVE only as an implementation Draft: migration 025 and `create_tracked_bet_v2` are unapplied, have no application caller, and authorize no Supabase/provider/result/settlement/production action. Decision #061 remains ACTIVE because Phase A2 browser E2E is deferred / not approved. Phase A1 was merged via PR #162 as `a6d4ebb` and deployed READY with 0 post-deployment runtime errors; it performed no production smoke and no scanner/API/Supabase runtime call or write. Phase A1 authorizes no further runtime, no migrations, and no RPC or schema changes. FP-001 remains active. Decision #054 Phase B is not approved. Decision #050's founder SMTP round-trip remains pending.

## Reconciliation Receipt — 2026-07-21

- PR #170 merged Decision #062 Phase 1A Bearer bridge as `5ef838d5d863bf8dd0436e437d1ad85f06525a36`.
- PR #171 merged the authenticated mobile Coupon Scanner as `43a6ee7fe5944dc1ed64d81a715bd94a7f02d11d`; Coupon analysis remains review-only, automatic Tracker save remains blocked, and Event analysis remains deferred.

- PR #183 merged Decision #063 docs-only as `df4723f2d55b220a4f64f54baf56a3333a8a61b7`.
- Founder authorized Decision #064 as an implementation Draft for unapplied migration 025, `create_tracked_bet_v2`, constraints/triggers, rollback, and status docs only; #065 is next unreserved.
- PR #182 merged as `d103947f9193891589cda1c5f1073e3004d84307`; its fail-closed grading foundation does not authorize production provider calls, result writes, scheduling, or automatic settlement.
- PR #181 applied production migration `20260721152711_cancel_pending_bet`, merged as `d5ebb87d891169b5e3c7959381d4a5011e10e07e`, and deployed READY. It is an unnumbered tracker/cancellation correction and does not consume Decision #062.
- Decision #062 remains the Mobile Founder client. The cancellation kill switch was renamed to `docs/cancel-pending-bet-rollback.sql`; its executable SQL is unchanged.
