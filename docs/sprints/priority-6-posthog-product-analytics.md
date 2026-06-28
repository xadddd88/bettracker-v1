# Sprint: Priority 6 — PostHog Product Analytics

**Status:** Complete  
**Branch:** `chore/posthog-custom-events`

## Goal

Instrument all key user journeys with custom PostHog events so the product team can understand how users interact with the AI Analyst, Scanner, Decision flow, and Settlement — without capturing any PII or sensitive betting content.

## Acceptance criteria

- [x] `lib/analytics/events.ts` — all event name constants in one place
- [x] `lib/analytics/buckets.ts` — pure bucketing functions for financial values
- [x] `lib/analytics/client.ts` — `trackClientEvent()` + `identifyAnalyticsUser()` with BLOCKED_KEYS sanitizer
- [x] `lib/analytics/server.ts` — `trackServerEvent()` using posthog-node, flushAt=1, flushInterval=0
- [x] AI Analyst route wired: `ai_analysis_started`, `ai_analysis_completed`, `ai_analysis_failed`, `decision_created`
- [x] Decision Watch/Skip/Place wired: `decision_action_watch`, `decision_action_skip`, `decision_action_place_clicked` (both ai_page and decision_detail flows)
- [x] Settlement wired: `bet_settle_clicked` (client), `bet_settle_won/lost/void/failed` (server)
- [x] Scanner wired: `scanner_started`, `scanner_completed`, `scanner_failed`, `scanner_express_detected`
- [x] Page views: `dashboard_viewed`, `ai_page_viewed`, `bet_detail_viewed`, `bets_list_viewed`
- [x] User identified via `AnalyticsIdentify` in `(app)/layout.tsx` on every authenticated visit
- [x] Privacy: BLOCKED_KEYS sanitizer on both client and server; financial values bucketed

## What was NOT built (future)

- Rate-limit hit events (`ai_analysis_failed` with `error_type: rate_limit` is partially in place but the rate-limit early-return doesn't have a user reference since the user check happens before rate-limit)
- Server-side page view tracking (current page views are client-side, fired after hydration)
- `bet_stake_bucket` on settlement events (would require fetching bet before settling)
- PDF download / share events
- Cohort definitions and funnels in PostHog UI

## Files changed

**New:**
- `lib/analytics/events.ts`
- `lib/analytics/buckets.ts`
- `lib/analytics/client.ts`
- `lib/analytics/server.ts`
- `lib/analytics/PageView.tsx`
- `lib/analytics/AnalyticsIdentify.tsx`
- `docs/product/analytics.md`
- `docs/sprints/priority-6-posthog-product-analytics.md`

**Modified:**
- `app/(app)/layout.tsx` — added AnalyticsIdentify
- `app/(app)/dashboard/page.tsx` — PageView component
- `app/(app)/bets/page.tsx` — PageView component
- `app/(app)/bets/[id]/page.tsx` — PageView component
- `app/(app)/ai/page.tsx` — ai_page_viewed, decision actions, place_clicked
- `app/(app)/decisions/[id]/DecisionActions.tsx` — watch/skip/place_clicked
- `app/(app)/bets/[id]/SettleActions.tsx` — bet_settle_clicked
- `app/api/ai/analyst/route.ts` — started/completed/failed/decision_created
- `app/api/ai/scanner/route.ts` — started/completed/failed/express_detected
- `app/api/bets/[id]/settle/route.ts` — won/lost/void/failed

**Dependencies:**
- `posthog-node@5.38.6` added

## Privacy notes

The sanitizer (`BLOCKED_KEYS`) strips these keys from every event payload on both client and server before sending to PostHog:

```
email, notes, prompt, ocr_text, event_name, selection,
reasoning, disclaimer, image, raw_text, stake, pnl, balance
```

Financial values sent via buckets only (e.g. `odds_bucket: "2.00-3.00"`, `edge_bucket: "3% to 7%"`).
