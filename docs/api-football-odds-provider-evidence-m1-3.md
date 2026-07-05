# M1.3 API-Football Odds Provider Evidence

Status: DONE via PR #82 / provider evidence captured / production odds dry-run not started

Last updated: 2026-07-05

## Scope

PR #82 recorded sanitized operator-side API-Football odds evidence.

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

Evidence was provided by the operator from API-Football/API-Sports account/docs and official pricing / guide pages on 2026-07-05.

Sanitization rules applied:

- no API key copied
- no account secret copied
- no raw provider payload stored in this document
- no secret query parameter copied
- the full odds response sample was reduced to schema and market mapping summaries only

Operator-provided reference URLs for docs-sourced evidence:

- `https://www.api-football.com/pricing`
- `https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide`
- `https://www.api-football.com/documentation-v3`

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

Operator-provided pricing / guide evidence confirms the cost model for M1.3 planning:

- API-Football counts API usage as requests against the plan quota.
- No weighted per-endpoint odds cost was identified in the docs-sourced evidence.
- Treat each HTTP call, including each paginated `page`, as one request against the daily quota.
- Free plan daily quota is 100 requests.
- Higher public plan examples observed: Pro 7,500 / day, Ultra 75,000 / day, Mega 150,000 / day.
- Daily quota and per-minute limits both matter.
- Remaining request counters are exposed through response headers such as request-limit / rate-limit remaining fields.
- When the daily quota is exhausted, no overage billing is expected; the API stops serving more requests until quota resets.

Operational implication:

```txt
estimated requests = number of HTTP calls, including pagination
```

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
- odds responses are paginated at 10 results per page
- each extra page is a separate API request
- pre-match odds history is limited to the provider's documented recent window
- odds are generally available only in a provider-defined pre-match window before kickoff
- odds are updated on the provider's documented cadence, not continuously

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

Docs-sourced bookmaker discovery request shape:

```txt
GET /odds/bookmakers
GET /odds/bookmakers?id={bookmaker_id}
GET /odds/bookmakers?search={bookmaker_name_fragment}
```

Sanitized response shape:

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
response[].id
response[].name
```

Operational notes:

- endpoint is reference/catalog style, not odds snapshot storage
- bookmaker list changes slowly enough for manual or daily cache planning
- approved bookmaker allowlist remains empty until a later CPO-approved dry-run review

Still missing before writes, but not before read-only dry-run planning:

- whether bookmaker IDs are stable across seasons/leagues
- approved bookmaker allowlist for writes

## Market Discovery Evidence

Confirmed mapping endpoint path:

```txt
GET /odds/mapping
```

Docs-sourced mapping response shape:

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
league.season
fixture.id
fixture.date
fixture.timestamp
update
```

Interpretation:

- `/odds/mapping` identifies fixtures that have available pre-match odds mappings.
- It is a discovery/mapping endpoint, not the odds values endpoint.
- The field required to connect mapping output to BetTracker provider links is `fixture.id`.
- The provider update timestamp is `update`.

Confirmed pre-match bet catalog endpoint:

```txt
GET /odds/bets
```

This is distinct from live odds catalog endpoints such as:

```txt
GET /odds/live/bets
```

Live odds endpoints remain out of scope for M1.3 v1.

Still missing before writes, but not before read-only dry-run planning:

- whether `/odds/mapping` covers all bets or only supported odds mappings

## Remaining Unknowns

These blockers remain before any production odds write or user-facing odds usage:

1. exact controlled production dry-run scope
2. exact canonical fixture IDs and API-Football provider links for the dry-run
3. whether the selected fixture request with `bet=1` returns enough bookmaker coverage
4. whether the selected current/future fixture odds are available on the current account plan
5. whether API-Football guarantees pre-match-only odds in all cases, or whether BetTracker must rely entirely on its canonical fixture pre-match gate
6. approved bookmaker allowlist for any later write milestone
7. storage schema and retention approval before odds writes

For read-only dry-run planning, the endpoint/cost/bookmaker/mapping evidence blocker is now addressed by docs-sourced evidence. The dry-run itself still requires separate CPO approval and must not be executed by this PR.

## Risk Decision

Evidence is sufficient to update the endpoint/request/response/cost design and plan a tightly scoped read-only production odds dry-run.

Current runtime decision:

```txt
production odds dry-run executed by PR #82: NO
provider odds calls from BetTracker production: NOT RUN
```

Required next approval before any production provider odds call:

```txt
CPO-approved read-only dry-run scope using known canonical fixture IDs
```

PR #83 is the scope-approval step for the first candidate fixture and does not run the provider call.

## Safe Future Candidate

Once the separate runtime dry-run scope is accepted, the likely read-only dry-run shape is:

```txt
GET /odds?fixture={api_football_provider_fixture_id}&bet=1
```

The request budget must count one request per page.

## Current BetTracker State

```txt
SPORTS_FIXTURE_SYNC_WRITE_ENABLED: absent/off
SPORTS_ODDS_SYNC_WRITE_ENABLED: not added/enabled
fixture write mode: off
odds provider calls from production: not run
odds writes: not run
Supabase writes: not run
Scout/Analyst/UI odds usage: not started
production odds dry-run: not started; scoped by PR #83 before any runtime approval
```
