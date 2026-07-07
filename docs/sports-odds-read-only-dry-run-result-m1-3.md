# M1.3 Read-Only Odds Dry-Run Result

Status: EXECUTED / SAFE

Last updated: 2026-07-06

## Scope

This document records the first separately approved production read-only API-Football odds dry-run after PR #85 merged and deployed.

The run was intentionally narrow:

```txt
provider: api_football
providerFixtureId: 1576052
market: match_winner
betId: 1
max provider requests: 1
page: 1 only
```

Production route:

```txt
POST https://btdk.app/api/admin/sports/odds/dry-run
```

Required body:

```json
{
  "dryRun": true,
  "providerFixtureId": "1576052",
  "betId": 1,
  "operatorConfirm": "RUN_READ_ONLY_ODDS_DRY_RUN_M1_3"
}
```

Provider request made by the server after pre-flight passed:

```txt
GET /odds?fixture=1576052&bet=1
```

## Sanitized Result

```txt
status: 200
success: true
dryRun: true
provider: api_football
providerFixtureId: 1576052
market: match_winner
betId: 1
requestAttempted: true
estimatedProviderRequests: 1
actualProviderRequests: 1
paging.current: 1
paging.total: 1
oddsAvailable: false
discoveredBookmakers: []
discoveredMarkets: []
valuesPresent: false
paginationOverflow: false
stopReasons: []
writeSkipped: true
preflight.passed: true
preflight.providerLinkFound: true
preflight.canonicalFixtureFound: true
preflight.blockedReasons: []
```

## Interpretation

- Pre-flight passed.
- Exactly one provider request was executed.
- API-Football returned no odds coverage for fixture `1576052` / `bet=1`.
- No page 2 was requested.
- No pagination overflow occurred.
- No bookmaker or market ids were discovered from this specific call because odds coverage was unavailable.
- No writes occurred.

## Safety Confirmation

The run did not surface or create:

- raw provider payload
- operator token
- provider token
- secret query parameters
- odds prices
- probability
- implied probability
- edge
- EV
- recommendation
- Scout signal
- Analyst signal
- UI odds usage
- Supabase writes

## Current State After Run

```txt
M1.3 Read-Only Odds Dry-Run: EXECUTED / SAFE
M1.3 odds writes: NOT STARTED
SPORTS_ODDS_SYNC_WRITE_ENABLED: NOT ADDED / NOT ENABLED
Scout / Analyst / UI odds usage: NOT STARTED
betting signals from odds: NOT STARTED
```

## Next Gate

Any further runtime provider call requires separate CPO approval.

This includes:

- fallback fixture `1576053`
- page 2 or any pagination follow-up
- broader fixture scope
- bookmaker or market discovery calls
- odds writes
- odds storage/migrations
- Scout, Analyst, or UI usage
- model probability, implied probability, edge, EV, recommendation, or betting signal generation
