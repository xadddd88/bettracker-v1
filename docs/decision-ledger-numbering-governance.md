# Decision Ledger / Numbering Governance

Status: Decision #061 is EXECUTED / VERIFIED / CLOSED after PR #235 merged as `2fb83250`; the highest-numbered closed decision remains #067 after migration 031 verification. #068 is next unreserved.
Last updated: 2026-07-27

## Purpose

This file prevents decision-number collisions. Historical numbers are immutable: gaps and retired reservations are never opportunistically backfilled.

## Current Number Map

```txt
Occupied: #001-#019, #021-#031, #033-#067
Do not reuse: #020
Retired reservation / do not reuse: #032
Occupied / closed: #061 — Founder Daily Flow Acceptance (Phase A1 via PR #162; Phase A2 via PR #235 as `2fb83250`)
Occupied / closed: #063 — Tracked-Leg Fixture Lineage Contract (docs-only; merged via PR #183 as `df4723f`)
Occupied / closed: #064 — Tracked-Leg Fixture Lineage Foundation (Gate 3 merged via PR #231; migration 025 applied and verified)
Occupied / closed: #065 — Broadcast Noir Cross-Platform Rollout (Web rollout production-deployed via #202 → #224; mobile release unauthorized)
Occupied / closed: #066 — odds_snapshots_public Security-Invoker Hardening (PR #232 merged; migration 030 applied and verified)
Occupied / closed: #067 — Public API Privilege Hardening (PR #233 merged; migration 031 applied and verified)
Highest-numbered closed: #067 — Public API Privilege Hardening
Active approved: #062 — Mobile Founder client (0/1B/1C merged; 1A Bearer bridge merged via PR #170; authenticated Coupon Scanner merged via PR #171)
                 #056 — Canonical-Linked SportMonks Class A Structural Presence Dry-Run
                 (implementation merged/deployed; runtime provider call not approved / not run)
Next unreserved: #068
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
| #050 | Registration Invite Flow — EXECUTED / VERIFIED / CLOSED 2026-07-26; founder round-trip, negative path, and Supabase controls verified |
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
| #061 | Founder Daily Flow Acceptance — EXECUTED / VERIFIED / CLOSED; Phase A1 merged via PR #162 as `a6d4ebb`; Phase A2 exact head `b14168a2` passed 10/10 CI and merged via PR #235 as `2fb83250`; automatic production deployment succeeded; loopback-only verification, no production smoke or real service write |
| #062 | Mobile Founder client — ACTIVE; Phases 0/1B/1C merged; Phase 1A Bearer bridge merged via PR #170 as `5ef838d5`; authenticated Coupon Scanner merged via PR #171 as `43a6ee7f`; no production mobile smoke recorded |
| #063 | Tracked-Leg Fixture Lineage Contract — EXECUTED / CLOSED, DOCS-ONLY; Founder-approved; merged via PR #183 as `df4723f`; no runtime authority |
| #064 | Tracked-Leg Fixture Lineage Foundation — EXECUTED / VERIFIED / CLOSED; Gate 3 merged via PR #231; migration 025 applied as `20260727060234_tracked_leg_fixture_lineage_025`; v2 remains service-role-only with no caller |
| #065 | Broadcast Noir Cross-Platform Rollout — WEB ROLLOUT CLOSED / PRODUCTION DEPLOYED via PR #202 and hardening #203 → #224; no mobile release authority |
| #066 | `odds_snapshots_public` Security-Invoker Hardening — EXECUTED / VERIFIED / CLOSED; PR #232 merged as `8ce79df4`; migration 030 applied as `20260727093233_odds_snapshots_public_security_invoker_030` |
| #067 | Public API Privilege Hardening — EXECUTED / VERIFIED / CLOSED; PR #233 merged as `9211c7e5`; migration 031 applied as `20260727123510_public_api_privilege_hardening_031` |

## Retired / Superseded Tracks

- **#020:** never reuse. PR #90 tried to claim it for Third-Party Manual Context Policy, but that PR is closed without merge and the policy is not adopted.
- **#032:** the old M1.3 filter-evidence reservation is retired after PR #106 was superseded. Keep the number unused to preserve audit history.
- A revived third-party manual-context policy must use **#068 or later** in a fresh PR.

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

Decision numbering does not grant runtime authority.

- Decision #056's implementation is merged and deployed, but its production provider call, writes, migrations, environment changes, persistence, odds ingestion, and downstream use remain unapproved and the call has not been run.
- Decision #057 is executed as docs-evidence only: results ingestion, result writes, automated settlement, and bankroll mutations remain unapproved.
- Decision #058 reconciled reporting metrics and status presentation only — it changed no payout/settlement calculation, settlement outcome, write path, or provider work.
- Decision #059 recorded a BLOCKED eligibility verdict and a future dry-run contract only — the result-presence dry-run has no implementation and no runtime authorization.
- Decision #060 is EXECUTED / VERIFIED / CLOSED. Phase A migration 024, exact catalog verification, and its authenticated RPC smoke are verified. Phase B was merged via PR #159 and deployed READY; one separately authorized authenticated production API smoke made exactly one `POST /api/bets/tracked`, returned HTTP 200, verified 1 bet / 1 ordered leg / 1 stake transaction / 0 Decision rows, signed out, and finished with zero rows across all temporary identity and financial tables. No additional synthetic production smoke is authorized by that record.
- Decision #064 is EXECUTED / VERIFIED / CLOSED: Gate 3 merged via PR #231 and migration 025 was applied once as `20260727060234_tracked_leg_fixture_lineage_025`; `create_tracked_bet_v2` remains service-role-only with no application caller.
- Decision #065 Web rollout is CLOSED and production-deployed via PR #202 followed by #203 → #224; its mobile source still has only explicit Review → manual Save through the existing tracked-bet endpoint and no auto-save.
- Decision #065 did not change the server route, RPC, schema, migrations, settlement behavior, financial formulas, provider/runtime authority, CSP enforcement, EAS/device builds, beta distribution, or app publication.
- Decision #066 is EXECUTED / VERIFIED / CLOSED: PR #232 merged as `8ce79df4`; migration 030 was applied once and its view, RLS, ACL, internal-field denial, Advisor, and web-health contracts were verified read-only.
- Decision #067 is EXECUTED / VERIFIED / CLOSED. PR #233 merged as `9211c7e5`; migration 031 applied once as `20260727123510_public_api_privilege_hardening_031` and its table-policy, ACL, function, default-privilege, Advisor, and web-health contracts were verified read-only. No further privilege, RPC, runtime, env, or deployment action is authorized by closure.
- Decision #061 is EXECUTED / VERIFIED / CLOSED. Phase A1 merged via PR #162 as `a6d4ebb` and deployed READY. Phase A2 exact head `b14168a2` passed all 10 CI jobs, including Hermetic Web acceptance at 320/375/1280 px, and merged via PR #235 as `2fb83250`; the automatic production deployment succeeded. The browser proof remained loopback-only; no production smoke or real scanner/tracked-bet/Supabase/provider/AI call, settlement action, or financial write ran. Runtime scope was limited to the semantic `<dt>/<dd>` correction for the populated `/bets` date. Closure grants no new runtime authority; #068 remains unreserved.
- FP-001 remains active. Decision #054 Phase B is not approved. Decision #050 is EXECUTED / VERIFIED / CLOSED; custom SMTP scale/readiness is a separate follow-up.

## Reconciliation Receipt — 2026-07-22

- PR #170 merged Decision #062 Phase 1A Bearer bridge as `5ef838d5d863bf8dd0436e437d1ad85f06525a36`.
- PR #171 merged the authenticated mobile Coupon Scanner as `43a6ee7fe5944dc1ed64d81a715bd94a7f02d11d`; Coupon analysis remains review-only, automatic Tracker save remains blocked, and Event analysis remains deferred.

- PR #183 merged Decision #063 docs-only as `df4723f2d55b220a4f64f54baf56a3333a8a61b7`.
- Decision #064 implementation merged via PR #186 as `4fce917701b95b3d3ad98ad9f157d02216323d3e`; migration 025 remains unapplied and no caller/runtime authority exists.
- Decision #065 Web rollout is CLOSED and production-deployed. The verified chain is #187 → #188 → #190 → #194 → #195 → #196 → #197 → #199 → #200 → #201, reconciled in PR #202, then stabilized by #203 → #224. The final production checkpoint is PR #224 / `eb51d91`. Local and remote hardening included post-interaction axe/duplicate-ID/document and shell-scroller overflow checks, bracketed IPv6 loopback normalization, a fail-closed application-console gate, Russian authenticated UX and auth localization, and production-smoke selector updates. The CSP observation receipt authorizes no enforcement. #066 is next unreserved.
- PR #182 merged as `d103947f9193891589cda1c5f1073e3004d84307`; its fail-closed grading foundation does not authorize production provider calls, result writes, scheduling, or automatic settlement.
- PR #181 applied production migration `20260721152711_cancel_pending_bet`, merged as `d5ebb87d891169b5e3c7959381d4a5011e10e07e`, and deployed READY. It is an unnumbered tracker/cancellation correction and does not consume Decision #062.
- Decision #062 remains the Mobile Founder client. The cancellation kill switch was renamed to `docs/cancel-pending-bet-rollback.sql`; its executable SQL is unchanged.


## Reconciliation Receipt — 2026-07-27

- PR #231 merged Decision #064 Gate 3 as `f5f17385d711ccd1df323cd71be3448dd3e08d85`; all PostgreSQL 17 and repository CI gates passed.
- Migration 025 was applied once as `20260727060234_tracked_leg_fixture_lineage_025` and its catalog contract was verified read-only. No bet was created and no application caller was added.
- PR #232 merged Decision #066 as `8ce79df4444c366b07a3585fde3de8554f431b4a`; all PostgreSQL 17 and repository CI gates passed.
- Migration 030 was applied once as `20260727093233_odds_snapshots_public_security_invoker_030`; catalog/ACL/RLS verification and Security Advisor confirmed the contract, and no odds rows were created or changed.
- PR #233 merged Decision #067 as `9211c7e5450ce1854a7621ab0a5fa3284decef82`; all 10 CI jobs passed, including the 12/12 PostgreSQL 17 verifier, and the automatic production deployment reached READY.
- Migration 031 was applied once as `20260727123510_public_api_privilege_hardening_031`. Catalog-only verification confirmed 7/7 RLS tables and restrictive deny-policies, zero client table ACLs, preserved `service_role`, 11/11 function boundaries, 9/9 protected `search_path` values, two retired RPCs service-only, nine intentional authenticated RPCs retained, and client-deny future-object defaults.
- Security Advisor retained only the nine documented intentional RPC warnings; web health passed. No RPC, user-data read, retry, or rollback ran. Decision #067 is CLOSED; #068 is next unreserved.
- PR #235 merged Decision #061 Phase A2 as `2fb83250cc648d990f844bbb8edc73ae81dc5a17`; exact head `b14168a246cfb76f0d566cd795eed758805f4e48` passed all 10 Preview Tests jobs, including Hermetic Web acceptance at 320/375/1280 px, and the automatic production deployment succeeded.
- Decision #061 Phase A2 used only browser-local responses and a loopback read-only Supabase stub. No production smoke, provider/AI/Supabase call, settlement action, or financial write ran. Decision #061 is CLOSED; #068 remains next unreserved.
