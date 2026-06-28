# Product Analytics — BetTracker AI

PostHog EU region (project 211367). All events use `user.id` (Supabase UUID) as `distinctId`.

## Privacy rules

**Never send:** email, raw prompts, OCR text, event names, selections, notes, exact stake, exact P&L, exact balance.

All financial values are bucketed before sending. A shared sanitizer (`BLOCKED_KEYS`) strips banned keys from every event on both client and server.

### Bucket functions (`lib/analytics/buckets.ts`)

| Function | Ranges |
|---|---|
| `bucketStake` | <5, 5-10, 10-25, 25-50, 50-100, 100-250, 250+ |
| `bucketOdds` | <1.20, 1.20-1.50, 1.50-2.00, 2.00-3.00, 3.00-5.00, 5.00+ |
| `bucketPnl` | <-100, -100 to -50, -50 to 0, 0 to 50, 50 to 100, 100+ |
| `bucketEdge` | <-5%, -5% to 0%, 0% to 3%, 3% to 7%, 7% to 15%, 15%+ |
| `bucketConfidence` | low (<40), medium (40-64), high (65-79), very_high (80+) |
| `bucketCount` | 0, 1-5, 6-20, 21-50, 51-100, 100+ |

---

## Events

### AI Analyst

| Event | Origin | Key properties |
|---|---|---|
| `ai_analysis_started` | server | sport, odds_bucket, has_bookmaker, has_notes, language |
| `ai_analysis_completed` | server | sport, recommendation, risk_level, edge_bucket, confidence_bucket, odds_bucket, decision_id |
| `ai_analysis_failed` | server | sport, error_type (ai_parse / ai_schema / persist / rate_limit / unknown) |
| `decision_created` | server | decision_id, sport, recommendation, risk_level |

### Decision Actions

| Event | Origin | Key properties |
|---|---|---|
| `decision_action_place_clicked` | client | decision_id, odds_bucket, from_page |
| `decision_action_watch` | client | decision_id, from_page |
| `decision_action_skip` | client | decision_id, from_page |

`from_page` is `'ai_page'` or `'decision_detail'`.

### Bet Settlement

| Event | Origin | Key properties |
|---|---|---|
| `bet_settle_clicked` | client | bet_id, outcome |
| `bet_settle_won` | server | bet_id, outcome |
| `bet_settle_lost` | server | bet_id, outcome |
| `bet_settle_void` | server | bet_id, outcome |
| `bet_settle_failed` | server | bet_id, error_type (already_settled / not_found / rpc_error) |

### Scanner

| Event | Origin | Key properties |
|---|---|---|
| `scanner_started` | server | media_type |
| `scanner_completed` | server | sport, has_odds, has_stake, is_express |
| `scanner_failed` | server | error_type (too_large / api_error / parse_failed / schema_mismatch / unknown) |
| `scanner_express_detected` | server | sport |

### Page Views

| Event | Origin | Key properties |
|---|---|---|
| `dashboard_viewed` | client | bet_count |
| `ai_page_viewed` | client | — |
| `bets_list_viewed` | client | bet_count |
| `bet_detail_viewed` | client | sport, status, is_parlay |

_Note: generic `$pageview` events are also captured automatically by PostHogProvider on every route change._

---

## Architecture

```
lib/analytics/
  events.ts          — EVENTS const with all event name strings
  buckets.ts         — bucketing functions (pure, no deps)
  client.ts          — trackClientEvent(), identifyAnalyticsUser() — browser only
  server.ts          — trackServerEvent() using posthog-node (flushAt=1, flushInterval=0)
  PageView.tsx       — <PageView event="..." /> client component for server pages
  AnalyticsIdentify.tsx — <AnalyticsIdentify userId="..." /> identifies user on mount
```

User identification runs on every authenticated page via `AnalyticsIdentify` in `app/(app)/layout.tsx`.
