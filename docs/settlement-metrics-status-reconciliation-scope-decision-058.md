# Settlement Metrics & Status Presentation Reconciliation — Decision #058

## Status

**EXECUTED / CLOSED by merge of the Decision #058 PR** — this decision has no separate runtime step, no provider call, and no database action.

Founder approval: `APPROVE #058`.

## Objective

Resolve findings **G4** and **G12** from Decision #057 (`docs/results-ingestion-settlement-trust-contract-decision-057.md` §1.9):

- **G4** — two conflicting Win Rate / ROI definitions: `app/(app)/bets/page.tsx` treated every non-pending status as settled and counted void in the win-rate denominator and ROI stake, while `lib/analytics/performance.ts`, the dashboard, and coach excluded void.
- **G12** — the bets list page rendered `partial` and any unknown status with the Void badge via `STATUS_STYLE[bet.status] ?? STATUS_STYLE.void`; the dashboard and detail badges rendered raw status text with silent gray fallbacks.

This decision does not widen financial or settlement semantics: `settle_bet` still produces only `won | lost | void`, and `push`/`cashed_out`/`partial` remain financially unsupported (Decision #057 G1).

## Canonical metric contract

Status groups:

| Group | Statuses |
|---|---|
| supported settled | `won`, `lost`, `void` |
| ROI / win-rate eligible | `won`, `lost` |
| pending | `pending` |
| unsupported financial semantics | `push`, `cashed_out`, `partial` |
| unknown | any unrecognized value |

Formulas:

```txt
settledCount     = won + lost + void
winRate          = won / (won + lost) × 100         (null / “—” when won + lost = 0)
netProfit        = Σ pnl over won + lost + void      (missing pnl counts as 0 — pre-existing safe behavior)
roiEligibleStake = Σ stake over won + lost           (void excluded)
roi              = netProfit / roiEligibleStake × 100 (null / “—” when eligible stake = 0)
pendingStake     = Σ stake over pending only
push / cashed_out / partial / unknown enter NO financial metric
```

## Implementation

New shared pure modules (no I/O, no side effects):

- `lib/bets/settlement-metrics.ts` — `calcSettlementMetrics()` implements the contract above plus `avgOdds` (mean `total_odds` over won+lost, the definition `performance.ts` and coach already shared).
- `lib/bets/bet-status.ts` — `resolveBetStatus()` maps every status to a canonical key + label (`Pending`, `Won`, `Lost`, `Void`, `Push`, `Cashed out`, `Partial`, `Unknown`). Unrecognized values resolve to `unknown`/`Unknown`, never to Void or raw text.

Reconciled surfaces (independent formulas removed):

| Surface | Before | After |
|---|---|---|
| `lib/analytics/performance.ts` | canonical formulas, re-implemented inline 4× (top-level, bySport, bySource, aiAnalyst) | all four via `calcSettlementMetrics`; exported `PerformanceMetrics` shape unchanged |
| `app/(app)/bets/page.tsx` | divergent (G4): settled = non-pending; void in WR denominator and ROI stake | canonical helper; Win Rate/ROI/Total P&L cells gate on `null` and render “—” |
| `app/(app)/dashboard/page.tsx` | canonical formulas, re-implemented inline | canonical helper; stat cards unchanged visually |
| `app/api/coach/route.ts` | canonical formulas, re-implemented inline 5× (`groupStats`, `bucketWinRate`, top-level, stake buckets, last-10 ROI) | all via `calcSettlementMetrics`; coach keeps its own 1-decimal rounding for the prompt payload; `isSettled` now derives from `SUPPORTED_SETTLED_STATUSES` |
| Status displays: bets list / bet detail / dashboard recent-bets / `SettleActions` settlement card / decision-detail linked bet | incomplete per-surface maps; Void fallback (list), raw capitalized text + gray or yellow fallbacks (detail, dashboard, SettleActions, decision detail) | labels from `resolveBetStatus`; per-surface style maps are complete over all 8 canonical keys (including explicit neutral `partial` and `unknown` styles), so no fallback path exists on any of the five surfaces |

Settlement P&L display gate (financial fail-open closed): `isSupportedSettlementStatus()` in `lib/bets/settlement-metrics.ts` returns true only for `won|lost|void`. The bets list, bet detail, dashboard recent-bets, and `SettleActions` render a stored `pnl` only when this predicate passes — a `push`/`cashed_out`/`partial`/unknown row shows "—" (or nothing) instead of an unapproved P&L figure. Stake and odds remain valid input facts and stay visible.

Kept separate deliberately (not competing formulas):

- Analytics `OutcomeCell` per-status stake sums (`Σ stake` of won / lost / void / pending) are display sums, not Win Rate/ROI/Net Profit definitions.
- Coach confidence-calibration buckets, streak logic (won/lost sequence), recent-form `last_5` list, and scout funnel are product-specific aggregations with different meanings; forcing them through the metrics helper would change semantics, not unify them. Their win-rate/ROI components DO come from the helper (`bucketWinRate`, `groupStats`, last-10 ROI).
- Bankroll/transaction surfaces show ledger balances, not settlement metrics — untouched.

User-visible behavior changes (intended, they ARE the G4 fix):

- Bets page Win Rate now excludes void from the denominator and matches the dashboard/analytics/coach definition.
- Bets page ROI now uses won+lost stake only.
- Bets page “settled” count now means won+lost+void (no longer “any non-pending”).
- A hypothetical `partial` or unknown-status bet now renders as `Partial` / `Unknown` instead of `Void` (list) or raw text (detail/dashboard), and never affects any financial metric on any surface.

## Regression tests

Added to the existing financial-safety harness (`scripts/test-financial-safety.mjs`, CI job “Provider safety & FP-001 quality gate” → `npm run test:financial-safety`); pure functions and source inspection only — no Supabase, no providers, no network:

1. Win Rate = won ÷ (won + lost) × 100.
2. Void excluded from the win-rate denominator.
3. Void excluded from ROI eligibility (stake denominator).
4. Net Profit sums pnl over won+lost+void only (unsupported-status pnl ignored).
5. Zero eligible stake / empty input → null metrics, safe zeros.
6. Pending stake includes pending only.
7. push/cashed_out/partial/unknown enter no financial metric (metrics identical with and without them; counted as unsupported/unknown).
8. `partial` resolves to explicit `Partial`, never `Void`.
9. Unknown values (including empty and near-miss strings) resolve to `Unknown`, never `Void` or raw text; the label map is complete.
10. `calcPerformance` (analytics surface) equals the canonical helper field-by-field on a mixed fixture, and source inspection proves bets page/dashboard/coach/performance use `calcSettlementMetrics` and the divergent formulas are gone.
11. `isSupportedSettlementStatus` returns true only for `won|lost|void` (false for pending, unsupported, unknown, and case-mismatched values).
12. Missing pnl counts as 0 (ROI 0, not null, when eligible stake exists); zero-stake won/lost returns ROI `null`; unsupported/unknown odds and stake never enter `avgOdds` or `roiEligibleStake`.
13. All **five** status surfaces (bets list, bet detail, dashboard recent-bets, `SettleActions`, decision-detail linked bet) resolve through `resolveBetStatus`, with source proof that every old Void/raw-text/yellow fallback is gone.
14. Every P&L surface (bets list, bet detail, dashboard, `SettleActions`) gates the stored `pnl` on `isSupportedSettlementStatus`; no bare `pnl != null` render remains.

`tsconfig.scripts.json` gains `lib/bets/**/*.ts` and `lib/analytics/performance.ts` so the harness tests the real compiled TypeScript.

## Validation

- `npm run test:financial-safety` — 25/25 (10 pre-existing + 15 new #058 tests covering the 10 required v1 cases plus the v2 review additions: P&L predicate, edge-case math, five-surface resolver adoption, and P&L display gating).
- `npm run test:provider-safety` — 97/97; `test:analysis-quality-gate` — 26/26; `test:domain-write-boundaries` — 13/13; `test:auth-invite` — 16/16; `test:rate-limit` — 12/12; `test:csp-security` — 18/18.
- `npx tsc --noEmit` — clean. `npm run lint` — no errors (pre-existing warnings in untouched provider adapters only).
- `git diff --check` — clean.
- `npm run build` — compiles; static prerender fails in this container on `/auth/set-password` because Supabase env vars are absent locally (environment limitation, unrelated to this change; not bypassed). Vercel Preview remains the production-build authority.

## Non-use

```txt
settle_bet changes: 0
new settlement outcomes: 0
payout/settlement calculation changes: 0
bankroll mutations / transaction logic changes: 0
migrations / schema changes: 0
Supabase reads/writes: 0
provider calls: 0
result ingestion / automated settlement: 0
odds work: 0
Scout/Analyst recommendation or pricing changes: 0
probability / implied probability / edge / EV / recommendation / Place Bet changes: 0
Decision #056 runtime: NOT APPROVED / NOT RUN
Decision #050 SMTP round-trip: PENDING
CSP Phase B: NOT APPROVED
FP-001: ACTIVE
```

## References

- `docs/results-ingestion-settlement-trust-contract-decision-057.md` — G4/G12 evidence (§1.6, §1.7, §1.9)
- `lib/bets/settlement-metrics.ts`, `lib/bets/bet-status.ts` — canonical contract
- `scripts/test-financial-safety.mjs` — regression coverage
