# Sprint 4 — Performance Analytics v1

Status: Accepted ✅

## Goal

Replace the placeholder `/analytics` page with real user performance analytics calculated server-side from authenticated Supabase data.

## Delivered

**PR #6** `feat/performance-analytics-v1` — merged to main `f473a8f`

### Files changed

| File | Change |
|---|---|
| `app/(app)/analytics/page.tsx` | Full implementation — server component, 7 sections |
| `lib/analytics/performance.ts` | New helper `calcPerformance(bets, decisions)` |
| `lib/analytics/events.ts` | Added `ANALYTICS_VIEWED` page view constant |

## Metrics implemented

| KPI | Formula |
|---|---|
| Net Profit | `sum(pnl)` where status in `won / lost / void` |
| ROI | `net_profit / sum(stake for won+lost) * 100` — void excluded |
| Win Rate | `won / (won + lost) * 100` — void excluded |
| Settled Bets | count(won + lost + void) |
| Pending Stake | `sum(stake)` where pending |
| Total Decisions | count all decisions |
| Decision → Bet | `placed / total decisions * 100` |
| Average Odds | `avg(total_odds)` for won + lost bets only |

Void excluded from ROI and Win Rate.
Pending excluded from ROI and Win Rate.

## Sections

1. **KPI Grid** — 8 stat cards, responsive 2×4 grid
2. **Outcome Breakdown** — stacked bar + legend (won / lost / void / pending) with counts and stakes
3. **Decision Actions** — progress bars for placed / skipped / watchlisted / ignored / pending
4. **Sport Performance** — table: bets, W/L, Win Rate, ROI, P&L per sport code
5. **Source Performance** — table: bets, W/L, Win Rate, ROI, P&L per source (manual / scanner / AI Analyst / etc.)
6. **AI Analyst Performance** — card for bets with `source = 'ai_analyst'`
7. **Pending Risk** — list of open bets with stake at risk, links to `/bets/[id]`

## Architecture

- `/analytics` remains a pure server component
- Supabase server client — user sees only their own data (RLS enforced)
- `calcPerformance()` is pure TypeScript, no DB calls, testable in isolation
- No mock data anywhere

## Validation

- `npm run lint` — ✅ no warnings or errors
- `npm run build` — ✅ `/analytics` at 779 B, all 16 routes compiled
- Formula verification — ✅ 20 assertions across core KPIs, void exclusion, empty state, all-pending state
- Smoke test — ✅ dev server starts, route responds 307→/login unauthenticated, no console errors

## Known scope limits (non-blocking)

- Sport attribution uses `bet.legs[0].sport` — parlays with mixed sports are credited to the first leg
- AI Analyst performance uses `source = 'ai_analyst'` as proxy; bets from scanner/quick_entry linked to AI decisions are counted under their own source
- No charting (recharts available but not needed at v1 scope)

## CPO Acceptance Notes

- All 8 Sprint 4 KPIs implemented with correct formulas
- Void and Pending exclusion verified at formula level
- Honest empty states throughout — no placeholder text, no demo data
- Server component pattern consistent with dashboard and bets pages
- PR #6 merged 2026-06-28
