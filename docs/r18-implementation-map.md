# R18 Implementation Map

Status: ACTIVE ENGINEERING MAP - created after Decision #069 repository adoption.
Date: 2026-07-29
Product source of truth: [`docs/product.md`](product.md)
Decision: [`Decision #069`](decision-069-target-product-structure.md)
Code baseline: `main@d00d4520b88724e8e4a76d38ec161f3590c5abe1`

This document maps the current repository to the approved R18 target product. It is an engineering control map, not a new product scope, legal decision, migration approval, provider approval, production-write approval, or market-launch approval.

R18 remains one complete product. The PR packages below are dependency-safe delivery slices for review, testing, rollback, and audit. They are not reduced editions of the product and do not make any R18 section optional.

## 1. Current Runtime Inventory

### Web App

| Current surface | Current owner in code | R18 owner | Current issue |
|---|---|---|---|
| `/dashboard` | `app/(app)/dashboard` | Home | Useful account state exists, but Home lacks full R18 attention queue, Review queue, market state, limit state, and full blocked/stale/insufficient states. |
| `/ai` | `app/(app)/ai` | Global Add / Research / Assistant | Scanner and Analyst are coupled. Analyst can still lead into stake entry and `place_bet_from_decision`; R18 requires Research to never create Bet or prefill action. |
| `/scout` | `app/(app)/scout`, `app/api/scout` | Research / Market Lab | Legacy Scout still asks an LLM to generate opportunities and stores `market_opportunities`; even with FP-001 nulling pricing fields, the surface conflicts with R18 Market Lab boundaries. |
| `/bets` | `app/(app)/bets` | Journal / Bets | Tracker is useful, but Bet is still the primary journal object; R18 makes Decision Ledger primary and separates Decision, Pass, Paper, external action, Execution, Resolution, and Review. |
| `/decisions` | `app/(app)/decisions` | Journal / Decision Ledger | Decision records exist, but they still include legacy recommendation/probability fields and direct Place Bet actions. No immutable pre-event lock contract is complete. |
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
| Direct Decision to Bet | `place_bet_from_decision` RPC and UI callers | Conflicts with R18. Research/Decision may record intended external action after risk check, but must not create Bet directly. |
| Risk check | `POST /api/risk/evaluate` | Returns `recommended_max_stake`; R18 forbids automatic stake recommendation. Needs RiskScenario with user-entered Intended Exposure and no suggested stake. |
| Settlement | `settle_bet`, `cancel_pending_bet`, `calcSettlementMetrics` | Current support excludes push/cashout/partial from financial metrics. R18 needs unified Resolution contract with `resolved_at` and reproducible P/L across every terminal outcome. |
| Metrics | `lib/bets/settlement-metrics.ts`, `lib/analytics/performance.ts` | Good deterministic base, but not versioned as a shared metric service for Web/mobile/export/AI with N, period, coverage, confidence, and uncertainty. |
| Market / locale | profile currency/timezone/settings | No complete `MarketProfile`, `UserMarketEligibility`, consent versioning, or locale completeness gate for `en`, `uk`, `ru`. |
| Privacy | settings and auth basics | No Privacy View, export/delete workflow, AI history controls, processor transparency, or travel/unsupported account states. |

## 2. P0 R18 Conflicts To Remove First

These conflicts are higher priority than visual IA polish because they can misrepresent the product boundary.

| Conflict | Evidence | Required correction |
|---|---|---|
| Automatic stake recommendation | `app/api/risk/evaluate/route.ts` returns `recommended_max_stake`; `components/risk/RiskEvaluator.tsx` renders "Suggested max". | Replace with non-prescriptive RiskScenario facts: current bankroll, user-entered Intended Exposure, open exposure, projected exposure, threshold result, and warnings. No suggested stake or allocation. |
| Research/Decision can create Bet | `app/(app)/ai/page.tsx` and `app/(app)/decisions/[id]/DecisionActions.tsx` call `place_bet_from_decision`. | Remove direct Bet creation from Research/Decision surfaces. Replace with R18-safe `Pass`, `Paper`, and `Track external action` Decision flow. |
| Place Bet copy and CTA | `analysis-quality-gate` labels and Web decision actions expose "Place Bet". | Rename and re-scope CTAs so the product records user-owned external facts only. No bookmaker or placement implication. |
| Legacy Scout opportunity generation | `/scout` and `/api/scout` still generate and persist candidate opportunities. | Convert to Research / Market Lab with prepared evidence, watchlist, and user-controlled notes. No ranked opportunities, no best-bet framing, no LLM-created numbers. |
| Coach action recommendations | `CoachRecommendation` and Coach UI render recommendations with priority. | Convert to Review observations and questions grounded in deterministic metrics, period, N, and confidence. |
| Legacy locale values at active write boundaries | The PR3A local candidate replaces the former eight-value AI/Scout unions with one shared `en`/`uk`/`ru` contract. Historical rows and pinned baseline fixtures can still contain legacy strings. | Keep legacy values read-only with an English presentation fallback, reject them on new writes, and leave broader translation completeness to PR 3. |

## 3. Dependency-Safe PR Packages

### PR 0 - Post-Merge Cleanup And Map

Scope:
- Update live Decision #069 status after PR #242 merge.
- Add this R18 implementation map.
- Do not change runtime code.

Migrations: none.
Feature flags: none.
Tests: `git diff --check`, docs consistency grep for obsolete live repository-adoption wording.
Production gate: no production action.

### PR 1 - R18 Policy Blockers

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

Feature flags:
- `R18_DISABLE_DECISION_TO_BET=true` for fail-closed route/UI behavior.
- `R18_RISK_SCENARIO_V1=true` for the non-prescriptive risk response shape.

Tests:
- Unit/static test that `/api/risk/evaluate` no longer returns `recommended_max_stake`.
- Static test that no authenticated Web page renders "Suggested max" or "Place Bet" in Research/Decision flows.
- Existing `test:financial-safety`, `test:analysis-quality-gate`, TypeScript, lint.

Production gate:
- Deployable after green CI.
- No Supabase migration, provider call, settlement run, env change, or production smoke.

### PR 2 - R18 App Shell And Route Compatibility

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
Feature flags:
- `R18_NAV_ENABLED` for the new shell and alias mapping.

Tests:
- Design shell/navigation tests.
- Web acceptance on desktop/mobile widths.
- Route compatibility tests for legacy URLs.
- TypeScript and lint.

Production gate:
- Green preview and visual acceptance only.
- No data writes or provider calls.

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

### PR 3 - MarketProfile, Eligibility, And Locale Foundation

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
- `R18_LOCALE_CONTRACT_V1`.

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

## 6. Current Best First Runtime PR

After this docs-only map, the first runtime PR should be **PR 1 - R18 Policy Blockers**.

Reason:

- it removes the clearest conflicts with the approved product/legal boundary;
- it requires no migration if scoped carefully;
- it makes the existing product safer before large IA or data-model work;
- it creates tests that prevent regression back to recommended stake or Research-to-Bet conversion.

Do not start PR 1 until Dmitriy explicitly approves runtime changes under this map.
