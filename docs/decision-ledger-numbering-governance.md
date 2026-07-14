# Decision Ledger / Numbering Governance

Status: CURRENT — Decision #058 executed/closed by merge; Decision #056 implementation merged/deployed, runtime provider call not approved / not run
Last updated: 2026-07-14

## Purpose

This file prevents decision-number collisions. Historical numbers are immutable: gaps and retired reservations are never opportunistically backfilled.

## Current Number Map

```txt
Occupied: #001-#019, #021-#031, #033-#058
Do not reuse: #020
Retired reservation / do not reuse: #032
Highest-numbered executed: #058 — Settlement Metrics & Status Presentation Reconciliation
Active approved: #056 — Canonical-Linked SportMonks Class A Structural Presence Dry-Run
                 (implementation merged/deployed; runtime provider call not approved / not run)
Next unreserved: #059
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

## Retired / Superseded Tracks

- **#020:** never reuse. PR #90 tried to claim it for Third-Party Manual Context Policy, but that PR is closed without merge and the policy is not adopted.
- **#032:** the old M1.3 filter-evidence reservation is retired after PR #106 was superseded. Keep the number unused to preserve audit history.
- A revived third-party manual-context policy must use **#059 or later** in a fresh PR.

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

Decision numbering does not grant runtime authority. Decision #056's implementation is merged and deployed, but its production provider call, writes, migrations, environment changes, persistence, odds ingestion, and downstream use remain unapproved and the call has not been run. Decision #057 is executed as docs-evidence only: results ingestion, result writes, automated settlement, and bankroll mutations remain unapproved. Decision #058 reconciled reporting metrics and status presentation only — it changed no payout/settlement calculation, settlement outcome, write path, or provider work. FP-001 remains active. Decision #054 Phase B is not approved. Decision #050's founder SMTP round-trip remains pending.
