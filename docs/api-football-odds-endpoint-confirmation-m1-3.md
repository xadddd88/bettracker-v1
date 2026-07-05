# M1.3 API-Football Odds Endpoint & Cost Confirmation

Status: DONE / BLOCKED via PR #81; partially superseded by PR #82 evidence

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

## PR #81 Confirmation Result

The API-Football odds endpoint and cost were not confirmed from the Codex runtime.

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

## Confirmed From Existing BetTracker Code At PR #81

The existing API-Football fixture adapter confirms only the already-used football API base and auth pattern for fixture/status work:

```txt
base URL: https://v3.football.api-sports.io
auth header: x-apisports-key
env var: API_FOOTBALL_KEY
```

This does not confirm the odds endpoint, odds request shape, odds availability, bookmaker discovery shape, market discovery shape, or odds request cost.

## PR #82 Partial Evidence Update

After PR #81, the operator provided sanitized API-Football/API-Sports docs/account evidence.

Now partially confirmed:

- base URL: `https://v3.football.api-sports.io`
- auth header: `x-apisports-key`
- status endpoint shape: `GET /status`
- observed plan: `Free`
- observed daily request limit shape: `requests.limit_day = 100`
- odds endpoint: `GET /odds`
- odds request params shown in docs: `fixture`, `league`, `season`, `date`, `bookmaker`, `bet`, `page`
- fixture-specific odds request supported: `GET /odds?fixture={fixture_id}`
- mixed filters supported
- pagination supported through `page`
- mapping endpoint path: `GET /odds/mapping`
- bookmaker endpoint path: `GET /odds/bookmakers`
- `Match Winner` / 1X2 provider bet id: `1`
- `Match Winner` values: `Home`, `Draw`, `Away`
- odds response includes fixture, league, update timestamp, bookmakers, bets, values, and decimal-string odds

Still not confirmed:

- exact quota/request cost for `GET /odds`
- whether one odds HTTP call consumes exactly one daily request
- rate-limit behavior beyond daily limit
- sanitized response shape for `GET /odds/bookmakers`
- sanitized response shape for `GET /odds/mapping`
- whether fixture requests without a bookmaker return multiple bookmakers
- whether pre-match-only is guaranteed by API-Football, or must be enforced only by BetTracker's canonical fixture gate

Reference: `docs/api-football-odds-provider-evidence-m1-3.md`

Decision remains:

```txt
allowed to proceed to read-only production odds dry-run: NO
```

## Required Confirmation Checklist

The following fields remain required before any production odds provider call.

| Field | Status | Required evidence |
|---|---|---|
| Exact odds endpoint | CONFIRMED | `GET /odds` |
| Required auth method | CONFIRMED | `x-apisports-key` header |
| Required request parameters | PARTIALLY CONFIRMED | `fixture`, `league`, `season`, `date`, `bookmaker`, `bet`, `page` |
| Request granularity | PARTIALLY CONFIRMED | fixture, league/season, date, bookmaker, bet, mixed filters, page |
| Quota/request cost | NOT CONFIRMED | Current API-Football/API-Sports account plan cost per request |
| Multiple bookmakers per request | NOT CONFIRMED | Need fixture request without bookmaker filter |
| Multiple markets per request | CONFIRMED | Odds response can include multiple `bets[]` for one bookmaker |
| Multiple fixtures per request | PARTIALLY CONFIRMED | date and league/season request shapes exist; response count shape not yet validated for controlled scope |
| Fixture identifier field | CONFIRMED | `response[].fixture.id` |
| Bookmaker id/name shape | CONFIRMED | `bookmakers[].id`, `bookmakers[].name` |
| Bet/market id/name shape | CONFIRMED | `bets[].id`, `bets[].name` |
| Values/selections shape | CONFIRMED | `values[].value` |
| Odds value shape | CONFIRMED | `values[].odd` as decimal string |
| Provider update timestamp | CONFIRMED | `response[].update` |
| Bookmaker discovery path | PARTIALLY CONFIRMED | `GET /odds/bookmakers`; response shape not confirmed |
| Market/bet discovery path | PARTIALLY CONFIRMED | `GET /odds/mapping`; response shape not confirmed |
| Direct `match_winner` / 1X2 request support | CONFIRMED | `bet=1`, `Match Winner`, values `Home` / `Draw` / `Away` |
| Pre-match-only request support | NOT CONFIRMED | Official request filters or lifecycle rules |
| Endpoint restrictions / plan limitations | NOT CONFIRMED | Current account plan or official docs |
| Rate limits | PARTIALLY CONFIRMED | `/status` exposes `requests.limit_day`; observed limit `100`; per-endpoint cost still not confirmed |

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
