# BetTracker — Current Implementation Gap to R18

> Decision #069 control document.
> Product source of truth: [`docs/product.md`](docs/product.md).
> Baseline implementation: `main@d96f1d2d142bfdd8f729cefa8e483c0fb9b49e0e`.

## Status

The engineering shell is stable, but the implementation does not yet match the complete R18 product.

The target is one product, not a sequence of reduced editions. The tables below track the distance from the current repository to that one target. Work may merge in dependency-safe PRs, but no required R18 section becomes optional or “future product.”

External beta remains paused.

## Current-to-Target Map

| Current surface | R18 owner | Required change |
|---|---|---|
| `/dashboard` | Home | Add attention queue, open exposure, limit state, Review queue, data freshness, and complete/insufficient/blocked states |
| `/ai` Scanner | Global Add | Keep capture and review; separate capture from analysis and route approved drafts into Journal |
| `/ai` Analyst | Research / Assistant | Use only verified or explicitly user-supplied context; code calculates, AI explains |
| `/scout` | Research / Market Lab | Remove generated/ranked opportunities, recommended stakes, and betting-signal framing |
| `/bets` | Journal / Bets | Preserve records and aliases; align Bet, leg, Resolution, cashout, refund, correction, and audit contracts |
| `/decisions` | Journal / Decision Ledger | Make Decision the default journal view; enforce server-time lock and Decision → Pass/Paper/Bet separation |
| `/analytics` | Insights | Unify metric service, formula/version, period, denominator, `N`, coverage, freshness, and confidence |
| `/coach` | Insights / Review | Convert directives into evidence-first observations and questions with confidence and sample size |
| `/bankroll` | Risk | Add open/projected exposure, limits, cooldown, stop mode, breach handling, and simulations |
| `/tennis-calculator` | Tools / Founder Lab | Remove from primary navigation; retain only deterministic, transparent, policy-safe calculators |
| `/settings` | Settings / Trust Center | Add market, locale, eligibility, privacy, security, processors, data rights, notifications, billing, and responsible-use controls |
| Web shell | Five-section IA | Home, Research, Journal, Insights, Risk plus global Add and utilities |
| Mobile shell | Same five-section IA | Use the same entity/state/metric contracts and platform-appropriate navigation |
| `/login` and onboarding | Access | Add `GB_EW_SC` eligibility states, verified legal consent versions, and `en/uk/ru` completeness |

## Cross-Cutting Gaps

| Contract | Current state | R18 requirement |
|---|---|---|
| Product positioning | Mixed tracker, AI analysis, Scout, LineHunter history | Private decision-quality and risk-control system |
| Market vs locale | No complete MarketProfile/UserMarketEligibility contract | `GB_EW_SC` server policy independent of `en/uk/ru` |
| Locales | Russian coverage improved; complete three-locale contract absent | One language per surface; full UI/error/email/push/AI/report/help coverage for `en`, `uk`, `ru`; missing key fails build |
| Decision lifecycle | Decision data exists, but end-to-end cycle is incomplete | Research → Decision → Pass/Paper/Bet → Resolution → Review |
| Financial lifecycle | Tracked bet and cancellation foundations exist | One canonical ledger across placement, cashout, refund, settlement, correction, and reporting |
| Result lineage | Trust contracts exist; automated runtime remains gated | Verified lineage and Resolution contract without unsafe inference |
| Metrics | Multiple current calculations and presentation paths | Versioned deterministic metric service used by Web, mobile, exports, reports, and AI context |
| Evidence | Trust gates exist, but product-wide evidence contract is incomplete | Source, period, `N`, freshness, coverage, confidence, methodology |
| AI | Scanner/Analyst/Scout/Coach routes exist | Policy gateway, bounded prepared context, deterministic numbers, citations/evidence, consent and deletion controls |
| Risk | Bankroll and transaction controls exist | RiskPolicy, Intended Exposure, projected exposure, limits, cooldown, stop mode, breach recovery |
| Imports | OCR/manual flow exists | Manual/OCR/CSV with review, idempotency, partial-failure handling, rollback, and audit |
| Privacy | Baseline settings and security controls exist | Privacy View, export, deletion, AI-history controls, processor transparency, travel/unsupported history access |
| Monetization | Not implemented | Transparent entitlements without paywalling export, deletion, limits, or basic history |

## Parallel Delivery Streams

These are engineering ownership streams inside the same R18 product scope, not product phases:

1. Product contracts: canonical entities, states, formulas, ownership, and API boundaries.
2. Market and locale foundation: MarketProfile, eligibility, legal/versioned consent, `en/uk/ru`.
3. Journal and Resolution: Decision, Bet, Paper, Pass, leg lineage, terminal Resolution, audit.
4. Risk and ledger: exposure, limits, cooldown, stop mode, cashout/refund/correction accounting.
5. Research and Tools: evidence workspace, safe Market Lab, watchlist, deterministic calculators.
6. Insights and Review: metric service, calibration, methodology, confidence, Review Inbox.
7. Assistant and privacy: AI policy gateway, prepared context, consent, history deletion, Privacy View.
8. Cross-platform product shell: full Web/iPhone/Android IA and state coverage from the Claude Design handoff.

## Readiness Rule

R18 implementation is complete only when the acceptance criteria in section 20 of [`docs/product.md`](docs/product.md) are met.

A green screen or route is not sufficient. Every surface must also cover loading, empty, insufficient-data, stale, partial, verification-required, blocked, unsupported, error, and recovery states that apply to it.

## Holds Preserved

Decision #069 changes product truth only. It does not lift:

- FP-001;
- Decision #054 CSP Phase B hold;
- sports-data source-freshness and downstream-use gates;
- odds/result/settlement runtime gates;
- production-provider and production-write approvals;
- external beta pause;
- mobile publication, payment, company-formation, or market-launch gates.

## Immediate Next Artifact

Claude Design should use section 21 of [`docs/product.md`](docs/product.md) to produce the complete cross-platform design system, screen inventory, flows, and all working/blocked/error states.

Engineering should use this file only as the implementation control map. If it conflicts with R18, R18 wins.
