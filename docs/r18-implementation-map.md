# R18 Implementation Map

Status: ACTIVE ENGINEERING MAP — reconciled through R18 PR3C decision packet; runtime activation disabled.
Date: 2026-08-14
Product source of truth: [`docs/product.md`](product.md)
Decision: [`Decision #069`](decision-069-target-product-structure.md)
Code baseline: `main@97992894020d2502869fce1922f2410e6466e81f`

This document maps the current repository to the approved R18 target product. It is an engineering control map, not a new product scope, legal decision, migration approval, provider approval, production-write approval, or market-launch approval.

R18 remains one complete product. The PR packages below are dependency-safe delivery slices for review, testing, rollback, and audit. They are not reduced editions of the product and do not make any R18 section optional.

### Delivery checkpoint

| Slice | Current state |
|---|---|
| PR0 | COMPLETE — PR #243 merged as `40b091c086d924fef47cbc6f394e66c1ba6ed3f5`. |
| PR1 | COMPLETE — PR #244 merged as `b9ea1c654b7988e47fcb8aec404ddf7aa84d8b88`; active automatic-stake and Decision-to-Bet surfaces are removed. |
| PR2 | COMPLETE — PR #245 merged as `931f2896db293a3c25d2fc17f860d4b68cf9fd57`; canonical navigation and compatibility aliases are active. |
| Security #246-#252 | MERGED — direct-bet quarantine, Advisor baseline, PostHog hardening, CSP readiness, and active-membership S2.1-S2.3. Approved database migrations are present in production history; CSP enforcement remains unapproved. |
| PR3A | COMPLETE — PR #253 plus audit PR #254; exact active locale set is `en`, `uk`, `ru`. |
| PR3B | COMPLETE — PR #255 plus audit PR #256; `GB_EW_SC_PROFILE_V1` is configured, has no runtime caller, and remains disabled. |
| PR3C handoff / Package A / Package C | COMPLETE — PRs #258-#260 define the UX/data boundary, versioned presentation contract, and fail-closed disabled-state Home/Settings integration. |
| PR3C Package B preflight | COMPLETE — PR #261 records the read-only production baseline and exact persistence/recovery design without a migration. |
| PR3C Owner/UK-counsel packet | PREPARED — PR #262 is merged; all eight `approvedDecision` values remain null pending both sign-offs. |
| Remaining PR3 | BLOCKED — Package B persistence, legal-document/consent values, and every activation gate await the immutable dual-sign-off artifact and a later separately approved migration slice. |

## 1. Current Runtime Inventory

### Web App

| Current surface | Current owner in code | R18 owner | Current issue |
|---|---|---|---|
| `/dashboard` | `app/(app)/dashboard` | Home | Useful account state exists, but Home lacks full R18 attention queue, Review queue, market state, limit state, and full blocked/stale/insufficient states. |
| `/ai` | `app/(app)/ai` | Global Add / Research / Assistant | PR1 removed the active Decision-to-Bet caller, but Scanner and Analyst remain coupled and the prepared-context-only Research/Assistant boundary is incomplete. |
| `/scout` | `app/(app)/scout`, `app/api/scout` | Research / Market Lab | Legacy Scout still asks an LLM to generate opportunities and stores `market_opportunities`; even with FP-001 nulling pricing fields, the surface conflicts with R18 Market Lab boundaries. |
| `/bets` | `app/(app)/bets` | Journal / Bets | Tracker is useful, but Bet is still the primary journal object; R18 makes Decision Ledger primary and separates Decision, Pass, Paper, external action, Execution, Resolution, and Review. |
| `/decisions` | `app/(app)/decisions` | Journal / Decision Ledger | PR1 removed direct Place Bet actions. Decision records still include legacy recommendation/probability fields, and no immutable pre-event lock contract is complete. |
| `/analytics` | `app/(app)/analytics` | Insights | Uses deterministic settlement helpers, but does not yet expose R18 metric provenance: period, N, denominator, coverage, freshness, confidence, formula version, and uncertainty. |
| `/coach` | `app/(app)/coach`, `app/api/coach` | Insights / Review | Retrospective history analysis exists, but Coach still produces recommendations as action cards. R18 requires evidence-first Review with observations, questions, N, period, and confidence. |
| `/bankroll` | `app/(app)/bankroll` | Risk | Bankroll and transactions exist, but R18 RiskPolicy, intended vs actual exposure, projected exposure, limits, cooldown, stop mode, breach reason, and simulations are not implemented. |
| `/tennis-calculator` | `app/(app)/tennis-calculator` | Tools / Founder Lab | Deterministic calculator is behind an access gate, but it should not be primary navigation in the R18 product shell. |
| `/settings` | `app/(app)/settings` | Settings / Trust Center | Basic user settings exist. R18 requires market eligibility, locale independence, privacy, export/delete, processors, notifications, security, billing, and responsible-use controls. |

### Mobile App

| Current surface | Current owner in code | R18 owner | Current issue |
|---|---|---|---|
| `home` tab | `apps/mobile/src/app/(app)/home.tsx` | Home | Mirrors current Web Home language, not full R18 Home contract. |
| `ai` tab | `apps/mobile/src/app/(app)/ai` | Global Add / Research | Coupon scanner exists, but R18 requires Add, Research, Journal, Insights, Risk parity rather than Scan/Tracker framing. |
| `bets` tab | `apps/mobile/src/app/(app)/bets` | Journal | Mobile saves through the tracked-bet endpoint and has no full Decision Ledger / Review / Risk contracts. |
| hidden `stats` and `more` | `apps/mobile/src/app/(app)/stats.tsx`, `more.tsx` | Insights / Settings | Not aligned to R18 canonical IA. |

### Server and Data Contracts

| Contract | Current implementation | R18 gap |
|---|---|---|
| Tracked Bet write | `POST /api/bets/tracked` -> `create_tracked_bet` | Good foundation for user-owned factual Bet records, but not yet linked to R18 Decision/Execution/Resolution lifecycle. |
| Analyst Decision write | `POST /api/ai/analyst` -> `persist_analysis_decision` | Still stores legacy recommendation/probability fields. Needs prepared-context-only Research/Assistant boundary and Decision draft semantics. |
| Direct Decision to Bet | `place_bet_from_decision` historical RPC | Active UI callers were removed in PR1; PR #246 revoked `PUBLIC`, `anon`, and `authenticated` execution and retained `service_role` only. The historical function must remain quarantined. |
| Risk check | `POST /api/risk/evaluate` | PR1 removed `recommended_max_stake`; the route now returns non-prescriptive intended-exposure facts and warnings. Full versioned R18 RiskPolicy remains PR6 work. |
| Settlement | `settle_bet`, `cancel_pending_bet`, `calcSettlementMetrics` | Current support excludes push/cashout/partial from financial metrics. R18 needs unified Resolution contract with `resolved_at` and reproducible P/L across every terminal outcome. |
| Metrics | `lib/bets/settlement-metrics.ts`, `lib/analytics/performance.ts` | Good deterministic base, but not versioned as a shared metric service for Web/mobile/export/AI with N, period, coverage, confidence, and uncertainty. |
| Market / locale | `lib/i18n/locale-contract.ts`, `lib/market/contract.ts`, `lib/market/server-policy.ts` | PR3A and PR3B provide pure locale and fail-closed market-policy contracts. Persistence, consent/legal acknowledgement, UI integration, and activation remain absent. |
| Privacy | settings and auth basics | No Privacy View, export/delete workflow, AI history controls, processor transparency, or travel/unsupported account states. |

## 2. P0 R18 Conflicts To Remove First

These conflicts are higher priority than visual IA polish because they can misrepresent the product boundary.

| Conflict | Current evidence | Status | Remaining correction |
|---|---|---|---|
| Automatic stake recommendation | Active Risk API/UI no longer expose `recommended_max_stake`, "Suggested max", or a confirm-to-bet action. | RESOLVED IN PR1 #244 | Preserve static regression coverage; full versioned RiskPolicy remains PR6. |
| Research/Decision can create Bet | Active AI/Decision surfaces have no `place_bet_from_decision` caller; the historical RPC is service-only after #246. | RESOLVED IN PR1 #244 / SECURITY #246 | Never restore authenticated execution or a Research-to-Bet caller. |
| Place Bet copy and CTA | Active Decision actions use user-owned intended-exposure language. A separate onboarding sentence still describes saving from an AI recommendation. | ACTIVE FLOW RESOLVED; COPY FOLLOW-UP OPEN | Replace the onboarding sentence in its own runtime-copy slice; do not mix it into this docs reconciliation. |
| Legacy Scout opportunity generation | `/scout` and `/api/scout` still generate and persist candidate opportunities. | OPEN | Convert to Research / Market Lab with prepared evidence, watchlist, and user-controlled notes. No ranked opportunities, best-bet framing, or LLM-created numbers. |
| Coach action recommendations | `CoachRecommendation` and Coach UI render recommendations with priority. | OPEN | Convert to Review observations and questions grounded in deterministic metrics, period, N, and confidence. |
| Legacy locale values at active write boundaries | PR3A uses one `en` / `uk` / `ru` contract and rejects legacy values on new Analyst/Scout writes; historical fixtures remain read-only. | ACTIVE WRITE BOUNDARY RESOLVED IN PR3A #253 | Complete remaining product-copy and surface coverage without coupling locale to market eligibility. |

## 3. Dependency-Safe PR Packages

### PR 0 - Post-Merge Cleanup And Map

Status: COMPLETE — merged in PR #243 as `40b091c086d924fef47cbc6f394e66c1ba6ed3f5`.

Scope:
- Update live Decision #069 status after PR #242 merge.
- Add this R18 implementation map.
- Do not change runtime code.

Migrations: none.
Feature flags: none.
Tests: `git diff --check`, docs consistency grep for obsolete live repository-adoption wording.
Production gate: no production action.

### PR 1 - R18 Policy Blockers

Status: COMPLETE — merged in PR #244 as `b9ea1c654b7988e47fcb8aec404ddf7aa84d8b88`.

Scope:
- Remove `recommended_max_stake` from the risk API response and UI.
- Replace "Suggested max" with threshold facts and warnings only.
- Disable or remove direct `place_bet_from_decision` UI paths from `/ai` and `/decisions/[id]`.
- Replace "Place Bet" copy with R18-safe "Track external action" only after the user independently acted outside BetTracker.
- Keep `POST /api/bets/tracked` available for factual Journal capture, not Research conversion.

Dependencies:
- Current `RiskEvaluator`, `app/api/risk/evaluate`, `DecisionActions`, AI page action handlers.

Migrations:
- None if implemented as a UI/API contract narrowing.
- A later migration may be needed for proper Intended Exposure persistence.

Feature flags: none added. The narrowed non-prescriptive contract and removal of active Decision-to-Bet callers are the baseline behavior.

Tests:
- Unit/static test that `/api/risk/evaluate` no longer returns `recommended_max_stake`.
- Static test that no authenticated Web page renders "Suggested max" or "Place Bet" in Research/Decision flows.
- Existing `test:financial-safety`, `test:analysis-quality-gate`, TypeScript, lint.

Production gate:
- Deployable after green CI.
- No Supabase migration, provider call, settlement run, env change, or production smoke.

Execution record:
- PR #244 removed active Decision-to-Bet UI calls and automatic stake recommendation after required CI passed.
- PR #246 later quarantined the retained historical `place_bet_from_decision` RPC to `service_role`; its production migration is applied.

### PR 2 - R18 App Shell And Route Compatibility

Status: COMPLETE — merged in PR #245 as `931f2896db293a3c25d2fc17f860d4b68cf9fd57`.

Scope:
- Introduce canonical Web navigation: Home, Research, Journal, Insights, Risk.
- Keep old URLs as compatibility aliases until their owners are migrated:
  - `/dashboard` -> Home
  - `/scout` -> Research / Market Lab legacy entry
  - `/bets` and `/decisions` -> Journal
  - `/analytics` and `/coach` -> Insights
  - `/bankroll` -> Risk
- Move `tennis-calculator` into Tools / Founder Lab and remove it from primary navigation.
- Add R18 utilities in shell: Add, Review, Tools, Assistant, Privacy View, Settings.

Dependencies:
- `AppHeader`, `MobileNav`, `app/(app)/layout.tsx`, route files.

Migrations: none.
Feature flags: none added. The canonical navigation and compatibility aliases are the baseline shell.

Tests:
- Design shell/navigation tests.
- Web acceptance on desktop/mobile widths.
- Route compatibility tests for legacy URLs.
- TypeScript and lint.

Production gate:
- Green preview and visual acceptance only.
- No data writes or provider calls.

Execution record:
- PR #245 established the canonical Home, Research, Journal, Insights, and Risk navigation while retaining the documented legacy route aliases.

### PR 3A - Repository-Only Locale Contract

Status: COMPLETE — merged in PR #253 and deployed from `main@486266a6a066f891060166d2cb55678d22f915b3` on 2026-08-12.

Scope:
- Define one shared UI/output-language contract for `en`, `uk`, and `ru`.
- Use that contract in the Web Analyst and Scout selectors and their Route Handler schemas.
- Reject legacy write values (`auto`, `es`, `fr`, `de`, `ar`) before profile reads, provider construction, or persistence.
- Preserve historical reads without rewriting stored data: unsupported or legacy stored language values render through the English trust-copy fallback.
- Keep the historical AI baseline fixture unchanged as evidence for its pinned pre-R18 runtime; the active runtime contract is guarded separately.

Migrations: none.

Feature flags: none; this is a fail-closed contract narrowing.

Tests:
- `test:locale-contract` asserts the exact locale set, selector/route adoption, read fallback, and zero-side-effect rejection of legacy writes.
- `test:analysis-quality-gate` covers localized trust-copy behavior and legacy Analyst rejection.
- TypeScript, lint, and existing provider/rate-limit/design regression suites.

Production gate:
- Automatic Git/Vercel deployment only; no manual deployment or non-repository production mutation.
- No Supabase migration, market eligibility, consent enablement, env change, provider call, or data write.
- PR 3 remains subject to its own explicit approvals and legal/market gates.

Execution record:
- PR #253 merged with the repository's standard merge-commit strategy after 15/15 required checks passed.
- Vercel production deployment `dpl_jrDXN1UzdaJnDU5WuHaZiNHoZkqa` reached `READY` and served `btdk.app` without alias errors.
- No database migration, historical-row rewrite, market enablement, environment change, or provider execution occurred.

### PR 3B - Repository-Only Market Eligibility Contract

Status: COMPLETE — merged and verified; runtime activation disabled.

Scope:
- Define the immutable `GB_EW_SC_PROFILE_V1` profile for England, Wales, and Scotland with `storefront_country=GB` and minimum age 18.
- Define every R18 eligibility state and a deterministic server-only policy with exact reason codes.
- Keep the profile `configured`, not `enabled`, and make the server flag fail closed unless its value is exactly `true`.
- Prove that storefront, locale-like fields, malformed evidence, and routine rechecks cannot increase access.
- Require explicit `server_policy` authority for a denied → eligible recheck while allowing routine downgrades.

Migrations: none.

Feature flags:
- Contract only for `MARKET_PROFILE_GB_EW_SC_ENABLED`; no environment value is added or changed.
- No runtime caller consumes the flag or evaluator in this slice.

Tests:
- `test:market-eligibility-contract` covers exact profile values, all territory/status boundaries, locale independence, storefront insufficiency, fail-closed evidence, and monotonic rechecks.
- Static guards keep the policy out of `app/` and `components/` and forbid Supabase dependencies.
- TypeScript, lint, and the existing regression suites remain required.

Production gate:
- Automatic repository deployment is inert because no runtime code imports the policy.
- No Supabase migration, schema/RLS/RPC change, production data write, environment change, market enablement, legal approval, consent persistence, provider call, or external service execution.
- Persistence, UI integration, and activation remain separate PR 3 gates.

Execution record:
- PR #255 merged with the repository's standard merge-commit strategy as `8e627b320b0ec33ca690db2fe04e94836f05a8c0` after 15/15 checks passed, including the new policy gate and Hermetic Web acceptance.
- Vercel production deployment `dpl_FqCxfkbxbrSV5bHLHKRJmNxEZEhh` reached `READY`, mapped `btdk.app`, and served `/login` with HTTP 200 from the exact deployment.
- Deployment-scoped error/fatal log inspection returned no entries after the smoke request.
- No database migration, schema/RLS/RPC change, production data write, environment change, market enablement, legal approval, consent persistence, or provider execution occurred.

Detailed contract: [`r18-pr3b-market-eligibility-contract.md`](r18-pr3b-market-eligibility-contract.md).

### PR 3C - Handoff, Presentation, And Fail-Closed UI

Status: COMPLETE — merged through PRs #258, #259, and #260; market activation
remains disabled.

Scope:
- Define the UX, data, security, consent-separation, accessibility, and blocked-
  state handoff for onboarding and Settings.
- Add the immutable client-safe presentation contract for every PR3B
  status/reason pair in `en`, `uk`, and `ru`.
- Integrate only a server-produced fail-closed summary on Home and detailed
  disabled-state presentation in Settings.

Migrations: none. No evidence is collected or persisted.

Feature flags:
- `MARKET_PROFILE_GB_EW_SC_ENABLED` remains disabled.
- A missing persisted decision source resolves to `policy_state_unavailable`;
  it cannot elevate access.

Execution record:
- PR #258 merged as `5001e5b0db1646b453f42c052947f4773cf74a31`.
- PR #259 merged as `a748de7f0f12226343194736ac7e85cfc3091edd`.
- PR #260 merged as `bdc1546083fc6096f527cf81085d505a457db8ff`;
  production deployment `dpl_7Cbbg66wyY2TJSLu2hPyrsBxiMQ6` reached
  `READY` while the market remained disabled.

No schema/RLS/RPC change, evidence write, legal approval, environment change,
provider call, or market activation occurred.

### PR 3C Package B - Persistence Readiness Preflight

Status: PREFLIGHT COMPLETE — migration remains blocked by eight unresolved
Owner/Legal inputs and has no apply authority.

Scope:
- Record a read-only production catalog and Advisor baseline without reading
  user rows or changing Supabase.
- Define the minimal logical persistence, presentation projection, explicit
  grants, RLS, server-only decision transaction, audit, rollback, and emergency
  boundaries for later implementation.
- Convert every `LEGAL INPUT REQUIRED` dependency into one exact, versionable
  decision request.
- Add a CI guard that keeps this repository slice free of Package B migrations,
  executable SQL, invented legal values, market activation, and new
  authenticated `SECURITY DEFINER` authority.

Migrations: none. Candidate object names are collision checks only.

Feature flags:
- `MARKET_PROFILE_GB_EW_SC_ENABLED` remains disabled.
- No environment value is added or changed.

Tests:
- `test:r18-pr3c-package-b-preflight` validates the production metadata anchor,
  eight unresolved legal gates, official Supabase constraints, ACL/RLS design,
  recovery contract, and absence of migration authority.
- PR3B/PR3C, Advisor, TypeScript, lint, and existing safety suites remain
  required.

Production gate:
- No schema, RLS, RPC, grant, data, Auth, environment, provider, deployment, or
  market change is authorized by the preflight.
- After the legal inputs resolve, a separate exact migration, PostgreSQL 17
  verifier, fresh read-only production preflight, SHA-256, and one-time explicit
  apply approval remain mandatory.

Detailed preflight:
[`r18-pr3c-package-b-persistence-preflight.md`](r18-pr3c-package-b-persistence-preflight.md).

Execution record:
- PR #261 merged as `44aa35edfd7b1c0a0f57c1cba48e3dd923e3d27f`.
- Production deployment `dpl_FNNeDboG7fr1kSbKaWedaV7E56HK` reached `READY`.
- No migration or production database write occurred.

### PR 3C Package B - Owner And UK Counsel Decision Packet

Status: PREPARED — eight gates remain pending both sign-offs; no legal,
migration, production-write, or activation authority.

Scope:
- Convert `LEGAL-01` through `LEGAL-08` into one review-ready Owner/UK-counsel
  packet with conservative recommendations, exact implementation inputs, and a
  fail-closed state for every unresolved value.
- Record the factual R18 product boundary separately from the legal
  classification counsel must supply.
- Record that the two submitted external research files are byte-identical and
  therefore provide one research input, not two independent reviews.
- Keep every machine-readable `approvedDecision` null and every activation gate
  false until an immutable signed successor artifact exists.

Migrations: none. No SQL, user evidence, production read/write, environment
change, provider call, legal content, or market activation is included.

Tests:
- `test:r18-pr3c-owner-legal-decision-packet` validates the eight pending gates,
  dual-sign-off requirement, source hashes, product prohibitions, primary-source
  references, null approvals, fail-closed activation state, and absence of a
  Package B migration.
- The existing Package B preflight, PR3B/PR3C, Advisor, TypeScript, lint, and
  repository safety suites remain required.

Production gate:
- Valid Owner and UK-counsel sign-off closes only the legal-input dependency.
- A separate schema/migration slice, PostgreSQL 17 verifier, fresh exact
  read-only production preflight, migration SHA-256, and one-time apply approval
  remain mandatory.
- `MARKET_PROFILE_GB_EW_SC_ENABLED` remains disabled.

Detailed packet:
[`r18-pr3c-owner-legal-decision-packet.md`](r18-pr3c-owner-legal-decision-packet.md).

Execution record:
- PR #262 merged as `97992894020d2502869fce1922f2410e6466e81f`.
- Production deployment `dpl_5kNqCLDKMMuJDrtFSrw3Lac5RxDb` reached `READY`,
  mapped `btdk.app`, and served `/login` with HTTP 200 from both the exact
  deployment URL and the production alias.
- Deployment-scoped inspection found no error/fatal runtime logs; all eight
  legal approvals remain null.

### PR 3C Package B - Dual-Signoff Response Template

Status: TEMPLATE PREPARED — Owner confirmation and qualified UK-counsel advice remain external inputs; no legal, migration, production-write, or activation authority.

Scope:
- Add one exact machine-readable response format for `LEGAL-01…08` that mirrors
  every implementation key in the source decision packet.
- Keep all Owner decisions, counsel decisions, signatories, implementation
  values, and approvals null until real responses are supplied.
- Require a new immutable signed-decision version instead of editing the source
  packet or template in place.
- Keep confidential memo text, signature images, personal contact details, and
  privileged material outside the public repository; allow only approved
  implementation values and publication-approved audit references/hashes.

Migrations: none. No SQL, runtime code, user evidence, production read/write,
environment change, provider call, legal conclusion, or market activation is
included.

Tests:
- `test:r18-pr3c-owner-uk-counsel-signoff-template` pins the reviewed source
  packet SHA-256, exact eight-gate input key sets, blank signatories and
  decisions, fail-closed authority, public-repository privacy boundary, CI
  wiring, and absence of a Package B migration.

Next external input:
- The Owner must explicitly complete the Owner decisions and attestation.
- Independently qualified UK counsel must complete the legal decisions, every
  implementation value, assumptions, conditions, sources, review limits, and
  verifiable professional scope.
- A partial, conditional, generic, or LLM-generated answer remains blocked.

Detailed template:
[`r18-pr3c-owner-uk-counsel-signoff-template.md`](r18-pr3c-owner-uk-counsel-signoff-template.md).

### PR 3 - MarketProfile, Eligibility, And Locale Foundation

Status: IN PROGRESS — PR3A, PR3B, the PR3C handoff, Package A, Package C, Package B preflight, and the Owner/UK-counsel packet are complete. Package B persistence is blocked on an immutable dual-sign-off artifact; no schema, migration, evidence collection, or activation is authorized by this status.

Scope:
- Add server-owned `MarketProfile` and `UserMarketEligibility` contracts for `GB_EW_SC`.
- Keep locale independent from market access, currency, timezone, odds format, and eligibility.
- Restrict supported UI locale surface to `en`, `uk`, `ru`.
- Add consent version and locale fields needed for later legal/privacy flows.
- Add blocked states for unsupported, verification required, signal conflict, travel limited, and blocked users.

Dependencies:
- Settings, onboarding, auth/register, profiles, product copy, AI/Scout output language.

Migrations:
- New `market_profiles`, `user_market_eligibility`, `eligibility_checks`, and consent-version fields or tables.
- RLS and service-only write boundaries.

Feature flags:
- `MARKET_PROFILE_GB_EW_SC_ENABLED=false` until separate legal/market gate.
- The PR3A locale contract is active without an environment flag.

Tests:
- Policy tests for locale not changing eligibility.
- RLS tests for client read/write boundaries.
- i18n key completeness test for `en`, `uk`, `ru`.
- Auth/onboarding blocked-state tests.

Production gate:
- Migration requires separate explicit approval.
- No market enablement by migration alone.

### PR 4 - Journal And Decision Ledger Core

Scope:
- Make Decision Ledger the primary Journal owner.
- Add immutable pre-event lock semantics using server time.
- Separate Decision outcomes: `Pass`, `Paper`, and `Track external action`.
- Add optional user probability snapshot and descriptive market-implied baseline contract.
- Preserve legacy probability/model fields as historical data only.

Dependencies:
- `/decisions`, `/bets`, Analyst persistence, tracked bet creation, schema types.

Migrations:
- Decision lifecycle/state fields.
- Snapshot tables or JSON contracts for user probability and market-implied baseline.
- Audit fields for lock time and source.

Feature flags:
- `R18_DECISION_LEDGER_V1`.

Tests:
- Server-time lock tests.
- Snapshot consumer tests: only user probability feeds personal calibration.
- Static test that Research does not create Bet.
- Financial/domain boundary tests.

Production gate:
- Migration and runtime rollout require explicit approval.
- No provider or settlement runtime.

### PR 5 - Resolution And Cash Ledger

Scope:
- Implement unified Resolution contract for won, lost, void/refund, cashout, partial, cancellation, and correction.
- Use `resolved_at`.
- Make realized P/L exist only for resolved Bets.
- Separate open net cash flow, open cash at risk, intended exposure, and actual exposure.
- Ensure each terminal path produces exactly one reproducible ledger effect.

Dependencies:
- Existing `settle_bet`, `cancel_pending_bet`, `create_tracked_bet`, `calcSettlementMetrics`, bankroll transactions.

Migrations:
- Resolution tables or fields.
- Ledger entry table/contract if current `bankroll_transactions` cannot safely represent every terminal outcome.
- Backfill strategy for existing settled rows.

Feature flags:
- `R18_RESOLUTION_CONTRACT_V1`.

Tests:
- Financial safety matrix for settlement, refund, cashout, partial, cancellation, correction.
- Idempotency and replay tests.
- Backfill dry-run verifier.
- Web/mobile metric parity tests.

Production gate:
- Requires migration approval, rollback/cleanup plan, and read-only catalog verification.
- No automated settlement without later approval.

### PR 6 - RiskPolicy, Limits, Cooldown, And Stop Mode

Scope:
- Implement `RISK_GB_EW_SC_V1` as deterministic code.
- Store user limits, open exposure, projected exposure, breach reason, limit relaxation, cooldown, stop mode, and recovery rules.
- Keep factual Journal access available during cooldown/stop.
- Allow conscious limit override only where R18 permits it and only with user-entered reason.

Dependencies:
- Risk route, Bankroll, Journal, Decision Ledger, Resolution.

Migrations:
- Risk policy config/version table.
- User limit state and cooldown/stop records.
- Risk scenario audit records.

Feature flags:
- `R18_RISK_POLICY_GB_EW_SC_V1`.

Tests:
- Policy threshold tests.
- Cooldown/stop recovery tests.
- Override-with-reason tests.
- No recommended stake static test.

Production gate:
- Migration and runtime rollout require explicit approval.
- No market enablement.

### PR 7 - Research And Market Lab

Scope:
- Convert Scout to Research / Market Lab.
- Use verified fixtures/evidence or explicitly user-supplied prepared context.
- Disable Bet creation, stake prefill, fixture/odds/probability prefill into Add.
- Keep watchlist and notes user-owned.
- Show data state: verified, stale, insufficient, blocked, unsupported, unknown.

Dependencies:
- Sports-data trust gates, Decision #068 source-freshness scope, AI Analyst quality gate, MarketProfile.

Migrations:
- Possibly new research workspace/watchlist tables.
- Legacy `market_opportunities` quarantine or read-only historical mapping.

Feature flags:
- `R18_RESEARCH_MARKET_LAB_V1`.
- Existing provider write flags remain off.

Tests:
- FP-001/static tests: no ranked opportunities, best bets, edge, EV, recommended action, or recommended stake.
- Prepared context bounds tests.
- Source freshness and stale-state tests.

Production gate:
- No provider call unless separately approved by a narrow runtime decision.
- No odds/result/downstream usage until trust validation.

### PR 8 - Insights And Evidence-First Review

Scope:
- Build a shared deterministic metric service for Web, mobile, export, reports, and AI context.
- Convert Coach to Review: observation -> evidence -> question -> user options.
- Every metric shows period, N, denominator, coverage, freshness, confidence, formula version, and uncertainty state.
- AI explains prepared metrics only; it never calculates or invents them.

Dependencies:
- Resolution contract, Decision Ledger, metric service, AI policy gateway.

Migrations:
- Review item records and optional saved observation records.
- Metric snapshot/version records if needed for reproducibility.

Feature flags:
- `R18_REVIEW_V1`.
- `R18_METRIC_SERVICE_V1`.

Tests:
- Metric parity tests across Web/mobile/export.
- Sample-size and insufficient-data tests.
- AI prepared-context tests.
- Regression tests for Coach not producing action recommendations.

Production gate:
- No provider or settlement runtime.
- AI calls remain rate-limited and prepared-context-only.

### PR 9 - Privacy View, Export, Deletion, And Trust Center

Scope:
- Add Privacy View.
- Implement user export and deletion request flows.
- Add AI history controls, processor transparency, consent records, notification controls, security settings, and responsible-use/help states.
- Ensure export/delete/basic history are not paywalled.

Dependencies:
- MarketProfile/consent, Settings, AI persistence, Journal.

Migrations:
- Data export request table.
- Deletion request/audit table.
- Processor/consent records as needed.

Feature flags:
- `R18_PRIVACY_VIEW_V1`.

Tests:
- Access control tests.
- Export snapshot shape tests.
- Deletion request state-machine tests.
- Privacy View masking tests.

Production gate:
- Migration and data-retention behavior require explicit approval.
- No irreversible deletion automation until separately approved.

### PR 10 - Mobile Parity And Cross-Platform Acceptance

Scope:
- Align Expo tabs and flows to Home, Research, Journal, Insights, Risk.
- Share R18 entity/state/metric contracts with Web.
- Keep mobile save explicit and manual; no auto-save from scanner.
- Add three-locale stress tests for mobile copy.

Dependencies:
- Web contracts stabilized in PR 1-9.

Migrations: none unless coupled to contract changes above.
Feature flags:
- `R18_MOBILE_IA_V1`.

Tests:
- Mobile typecheck, unit tests, navigation tests.
- Contract parity tests with Web.
- Manual/EAS/device builds remain unauthorized unless separately approved.

Production gate:
- No EAS/device build, beta distribution, store publication, or mobile production smoke without explicit approval.

## 4. Suggested Merge Order

1. PR 0 - docs cleanup and map.
2. PR 1 - remove R18 policy blockers from existing runtime.
3. PR 2 - canonical R18 shell/navigation with route compatibility.
4. PR 3 - MarketProfile, eligibility, and locale foundation.
5. PR 4 - Journal / Decision Ledger core.
6. PR 5 - Resolution and cash ledger.
7. PR 6 - RiskPolicy and exposure controls.
8. PR 7 - Research / Market Lab.
9. PR 8 - Insights / Review.
10. PR 9 - Privacy View / export / deletion / Trust Center.
11. PR 10 - mobile parity and cross-platform acceptance.

The order can change for dependency reasons, but it must not revive predictive Scout, direct Research-to-Bet conversion, recommended stake, bookmaker links, copy-bet, live recommendation, Martingale/loss recovery, or profit promises.

## 5. Global Acceptance Gates

Every runtime PR must state:

- the R18 owner section;
- changed routes/components/APIs/RPCs/tables;
- migrations required or explicitly not required;
- feature flags and default state;
- rollback or disable plan;
- tests run locally;
- expected CI checks;
- production gates required before merge or after merge;
- explicit non-authorization list for provider calls, Supabase writes, env changes, migrations, external beta, and market enablement where applicable.

Every R18 product surface must cover:

- loading;
- empty;
- insufficient data;
- stale data;
- partial data;
- verification required;
- blocked;
- unsupported territory;
- risk warning;
- cooldown / stop mode where relevant;
- privacy view;
- error and recovery.

## 6. Current Best Next Gate

The next PR3 gate is an **immutable Owner plus qualified UK-counsel signed
decision version for `LEGAL-01…08`**. The merged packet is the review input; it
does not itself close any legal gate, and it must not be edited in place to
simulate approval.

After valid dual sign-off, the next engineering slice may only:

- translate the approved values into an exact Package B schema/RLS/RPC design;
- include a PostgreSQL 17 behavioral verifier and rollback/emergency contract;
- repeat a fresh exact read-only production preflight;
- publish the migration payload SHA-256 for review;
- keep `MARKET_PROFILE_GB_EW_SC_ENABLED` disabled.

Any production apply still requires its own one-time explicit approval and
postflight. Legal sign-off, repository merge, and migration apply do not grant
market activation, provider/bookmaker integration, affiliate work, or external
beta authority.
