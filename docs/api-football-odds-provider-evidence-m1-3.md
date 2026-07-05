# M1.3 API-Football Odds Provider Evidence

Status: draft PR #82 / partial evidence captured / production odds dry-run still blocked

Last updated: 2026-07-05

## Scope

PR #82 records sanitized operator-side API-Football odds evidence.

Allowed:

- document endpoint paths and request parameters observed in official docs/account snippets
- document sanitized response shape
- document confirmed `Match Winner` / 1X2 provider market mapping
- document remaining blockers before any production odds dry-run

Not allowed:

- provider calls from BetTracker production
- runtime ingestion code
- migrations
- API routes
- odds writes
- Supabase writes
- env changes
- enabling `SPORTS_ODDS_SYNC_WRITE_ENABLED`
- enabling `SPORTS_FIXTURE_SYNC_WRITE_ENABLED`
- Scout, Analyst, or UI odds usage
- M1.3 controlled odds write validation

## Evidence Sources

Evidence was provided by the operator from API-Football/API-Sports account/docs on 2026-07-05.

Sanitization rules applied:

- no API key copied
- no account secret copied
- no raw provider payload stored in this document
- no secret query parameter copied
- the full odds response sample was reduced to schema and market mapping summaries only

## Confirmed Base And Auth

The API-Football football base URL remains:

```txt
https://v3.football.api-sports.io
```

Observed auth method:

```txt
HTTP header: x-apisports-key
```

The auth method was observed in the provider documentation sample for:

```txt
GET /odds/mapping
```

No token value was copied.

## Status / Quota Shape

Observed status endpoint:

```txt
GET /status
```

Sanitized response shape includes:

- `account`
- `subscription.plan`
- `subscription.active`
- `requests.current`
- `requests.limit_day`

Observed sanitized account state:

```txt
plan: Free
limit_day: 100
```

This confirms the daily request limit shape. It does not by itself prove the odds endpoint cost per HTTP request.

## Odds Endpoint

Confirmed endpoint:

```txt
GET /odds
```

Confirmed request shapes from docs:

```txt
GET /odds?fixture={fixture_id}
GET /odds?league={league_id}&season={season}
GET /odds?date={YYYY-MM-DD}
GET /odds?bookmaker={bookmaker_id}&bet={bet_id}&league={league_id}&season={season}
GET /odds?bet={bet_id}&fixture={fixture_id}
GET /odds?bookmaker={bookmaker_id}&league={league_id}&season={season}
GET /odds?date={YYYY-MM-DD}&page={page}&bet={bet_id}
```

Confirmed request parameters:

- `fixture`
- `league`
- `season`
- `date`
- `bookmaker`
- `bet`
- `page`

Confirmed behavior:

- fixture-specific odds request is supported
- league/season odds request is supported
- date odds request is supported
- docs explicitly allow mixing available parameters
- pagination is present through the `page` parameter

## Odds Response Shape

Sanitized `GET /odds?fixture={fixture_id}&bookmaker={bookmaker_id}` response shape:

```txt
get
parameters
errors
results
paging.current
paging.total
response[]
```

Each `response[]` item contains:

```txt
league.id
league.name
league.country
league.season
fixture.id
fixture.timezone
fixture.date
fixture.timestamp
update
bookmakers[]
```

Each bookmaker contains:

```txt
bookmakers[].id
bookmakers[].name
bookmakers[].bets[]
```

Each bet/market contains:

```txt
bets[].id
bets[].name
bets[].values[]
```

Each value/selection contains:

```txt
values[].value
values[].odd
```

Observed odds format:

```txt
odd: decimal string
```

Observed update timestamp field:

```txt
update
```

## Market Mapping Evidence

Confirmed provider market for M1.3 v1:

```txt
provider bet id: 1
provider bet name: Match Winner
canonical market: match_winner / 1X2
values: Home, Draw, Away
```

This confirms that M1.3 football odds v1 can target:

```txt
GET /odds?fixture={provider_fixture_id}&bet=1
```

after the remaining safety blockers are resolved.

## Bookmaker Evidence

Confirmed from odds response schema:

```txt
bookmaker id field: bookmakers[].id
bookmaker name field: bookmakers[].name
```

Observed sample bookmaker mapping:

```txt
provider bookmaker id: 6
provider bookmaker name: Bwin
```

Confirmed bookmaker discovery endpoint path:

```txt
GET /odds/bookmakers
```

Still missing:

- sanitized `GET /odds/bookmakers` response shape
- whether bookmaker IDs are stable across seasons/leagues
- approved bookmaker allowlist for writes

## Market Discovery Evidence

Confirmed mapping endpoint path:

```txt
GET /odds/mapping
```

Still missing:

- sanitized `GET /odds/mapping` response shape
- whether `/odds/mapping` covers all bets or only supported odds mappings
- whether `GET /odds/bets` exists separately in the current docs/account plan

## Remaining Unknowns

These blockers remain before any production odds dry-run:

1. exact quota/request cost for `GET /odds`
2. whether one `GET /odds` HTTP call costs exactly one daily request on the current plan
3. rate-limit behavior beyond the observed daily limit
4. sanitized `GET /odds/bookmakers` response shape
5. sanitized `GET /odds/mapping` response shape
6. whether a fixture request without `bookmaker` returns multiple bookmakers
7. whether a fixture request with `bet=1` returns all available bookmakers for Match Winner
8. whether odds returned by `/odds` are pre-match only, or whether BetTracker must rely entirely on its canonical fixture pre-match gate
9. whether the Free plan can access current/future fixture odds for the controlled validation scope

## Risk Decision

Evidence is sufficient to update the endpoint/request/response design, but not sufficient to run production provider odds calls.

Current decision:

```txt
allowed to proceed to read-only production odds dry-run: NO
```

Required next evidence before unblock:

```txt
cost per /odds HTTP request
bookmaker discovery response shape
mapping discovery response shape
exact controlled dry-run scope
```

## Safe Future Candidate

Once the remaining blockers are accepted, the likely read-only dry-run shape is:

```txt
GET /odds?fixture={api_football_provider_fixture_id}&bet=1
```

But this must remain blocked until the next CPO-approved milestone.

## Current BetTracker State

```txt
SPORTS_FIXTURE_SYNC_WRITE_ENABLED: absent/off
SPORTS_ODDS_SYNC_WRITE_ENABLED: not added/enabled
fixture write mode: off
odds provider calls from production: not run
odds writes: not run
Supabase writes: not run
Scout/Analyst/UI odds usage: not started
production odds dry-run: blocked
```
