# M1.3 API-Football Odds Endpoint & Cost Confirmation

Status: draft PR #81 / confirmation blocked

Last updated: 2026-07-05

## Scope

PR #81 is documentation/status/read-only confirmation only.

Allowed:

- record the current API-Football odds endpoint and cost confirmation state
- document what must be confirmed from official API-Football/API-Sports docs or account plan
- decide whether BetTracker may proceed to the first read-only production odds dry-run

Not allowed:

- runtime ingestion code
- migrations
- API routes
- production provider odds calls
- odds writes
- Supabase writes
- env changes
- enabling `SPORTS_ODDS_SYNC_WRITE_ENABLED`
- enabling `SPORTS_FIXTURE_SYNC_WRITE_ENABLED`
- Scout, Analyst, or UI changes
- M1.3 controlled odds write validation

## Current Confirmation Result

The API-Football odds endpoint and cost are not confirmed from the Codex runtime.

Official documentation URLs checked:

- `https://www.api-football.com/documentation-v3`
- `https://api-sports.io/documentation/football/v3`

Result:

- both official documentation hosts returned a browser challenge to the Codex runtime
- no provider API endpoint was called
- no provider token was used
- no account/dashboard plan information was available in the repo
- no quota/request cost was confirmed

Decision:

```txt
blocked until an operator confirms endpoint, request shape, and quota cost from the API-Football/API-Sports account or official docs
```

## Confirmed From Existing BetTracker Code

The existing API-Football fixture adapter confirms only the already-used football API base and auth pattern for fixture/status work:

```txt
base URL: https://v3.football.api-sports.io
auth header: x-apisports-key
env var: API_FOOTBALL_KEY
```

This does not confirm the odds endpoint, odds request shape, odds availability, bookmaker discovery shape, market discovery shape, or odds request cost.

## Required Confirmation Checklist

The following fields remain required before any production odds provider call.

| Field | Status | Required evidence |
|---|---|---|
| Exact odds endpoint | NOT CONFIRMED | Official docs/account page showing endpoint path |
| Required auth method | PARTIALLY CONFIRMED | Existing fixture adapter uses `x-apisports-key`; odds endpoint must still be confirmed |
| Required request parameters | NOT CONFIRMED | Official docs/account request schema |
| Request granularity | NOT CONFIRMED | Whether odds are requested by fixture, league, date, bookmaker, bet/market, page, or a combination |
| Quota/request cost | NOT CONFIRMED | Current API-Football/API-Sports account plan cost per request |
| Multiple bookmakers per request | NOT CONFIRMED | Official response/request docs |
| Multiple markets per request | NOT CONFIRMED | Official response/request docs |
| Multiple fixtures per request | NOT CONFIRMED | Official response/request docs |
| Fixture identifier field | NOT CONFIRMED | Official response schema |
| Bookmaker id/name shape | NOT CONFIRMED | Official response schema or bookmaker discovery endpoint |
| Bet/market id/name shape | NOT CONFIRMED | Official response schema or market/bet discovery endpoint |
| Values/selections shape | NOT CONFIRMED | Official response schema |
| Odds value shape | NOT CONFIRMED | Official response schema |
| Provider update timestamp | NOT CONFIRMED | Official response schema |
| Bookmaker discovery path | NOT CONFIRMED | Official endpoint and cost |
| Market/bet discovery path | NOT CONFIRMED | Official endpoint and cost |
| Direct `match_winner` / 1X2 request support | NOT CONFIRMED | Official market id/name and request filtering rules |
| Pre-match-only request support | NOT CONFIRMED | Official request filters or lifecycle rules |
| Endpoint restrictions / plan limitations | NOT CONFIRMED | Current account plan or official docs |
| Rate limits | NOT CONFIRMED | Current account plan or official docs |

## Risk Decision

Because endpoint, request shape, and quota/request cost remain unconfirmed:

```txt
allowed to proceed to read-only production odds dry-run: NO
```

BetTracker must not run a production provider odds call until a later PR records all required evidence and CPO approves the dry-run scope.

## Required Operator Evidence For Unblock

The next unblock step must provide sanitized evidence from the provider account or official docs:

1. exact endpoint path
2. exact HTTP method
3. auth method
4. accepted request parameters
5. whether the endpoint supports fixture-specific odds
6. whether the endpoint supports `match_winner` / 1X2 filtering directly
7. whether bookmaker and market filters are supported
8. whether pagination is required
9. current plan quota/request cost
10. current daily/monthly rate or request limit
11. response sample with tokens and raw payload omitted or redacted
12. bookmaker discovery endpoint/shape/cost, if separate
13. market/bet discovery endpoint/shape/cost, if separate

No raw provider payload, provider token, account secret, or secret query parameter should be copied into the repo or PR body.

## Interim Implementation Rule

Until the above evidence is accepted:

```txt
endpointDocumentation.documented = false
providerCall.allowed = false
odds writes = not started
SPORTS_ODDS_SYNC_WRITE_ENABLED = not added/enabled
```

The PR #80 read-only planner remains the only M1.3 odds implementation artifact.

## Next Step

Open a later confirmation/unblock PR only after operator-side docs/account evidence is available.

That later PR may then decide whether BetTracker can run:

```txt
known canonical fixture IDs -> API-Football odds dry-run -> sanitized coverage report
```

It still must not start odds writes unless a separate controlled odds write milestone is approved.
