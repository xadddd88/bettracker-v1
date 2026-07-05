# M1.3 API-Football Odds Endpoint & Cost Confirmation

Status: DONE / BLOCKED via PR #81; superseded by PR #82 provider evidence for endpoint/cost planning

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

## PR #82 Provider Evidence Update

After PR #81, the operator provided sanitized API-Football/API-Sports docs/account evidence.

Now confirmed for read-only dry-run planning:

- base URL: `https://v3.football.api-sports.io`
- auth header: `x-apisports-key`
- status endpoint shape: `GET /status`
- observed plan: `Free`
- observed daily request limit shape: `requests.limit_day = 100`
- public pricing / guide evidence indicates one HTTP call counts as one request against plan quota
- no weighted per-endpoint `/odds` cost was identified
- per-minute and daily quota limits both apply
- each paginated odds page must be counted as a separate request
- odds endpoint: `GET /odds`
- odds request params shown in docs: `fixture`, `league`, `season`, `date`, `bookmaker`, `bet`, `page`
- fixture-specific odds request supported: `GET /odds?fixture={fixture_id}`
- mixed filters supported
- pagination supported through `page`
- odds pagination size: 10 results per page
- odds update cadence and history/availability windows are provider-controlled
- mapping endpoint path: `GET /odds/mapping`
- bookmaker endpoint path: `GET /odds/bookmakers`
- bookmaker discovery shape: standard wrapper plus `response[].id` and `response[].name`
- mapping discovery shape: standard wrapper plus `league`, `fixture`, and `update`
- pre-match bet catalog path: `GET /odds/bets`
- `Match Winner` / 1X2 provider bet id: `1`
- `Match Winner` values: `Home`, `Draw`, `Away`
- odds response includes fixture, league, update timestamp, bookmakers, bets, values, and decimal-string odds

Still not run / still requiring separate runtime approval:

- no production provider odds call has been made from BetTracker
- no read-only production odds dry-run has been executed
- no odds write has been executed
- selected canonical fixture IDs for the future dry-run are not yet approved
- pre-match-only must still be enforced by BetTracker's canonical fixture gate unless a later runtime result proves provider-side filtering is sufficient

Reference: `docs/api-football-odds-provider-evidence-m1-3.md`

Decision update:

```txt
endpoint/cost evidence blocker: addressed for planning
production odds dry-run: NOT STARTED
next step: separate CPO-approved read-only dry-run scope
```

## Required Confirmation Checklist

The following fields remain required before any production odds provider call.

| Field | Status | Required evidence |
|---|---|---|
| Exact odds endpoint | CONFIRMED | `GET /odds` |
| Required auth method | CONFIRMED | `x-apisports-key` header |
| Required request parameters | PARTIALLY CONFIRMED | `fixture`, `league`, `season`, `date`, `bookmaker`, `bet`, `page` |
| Request granularity | PARTIALLY CONFIRMED | fixture, league/season, date, bookmaker, bet, mixed filters, page |
| Quota/request cost | CONFIRMED FOR PLANNING | One HTTP call / page counts as one request against plan quota; no weighted endpoint-specific odds cost identified |
| Multiple bookmakers per request | PARTIALLY CONFIRMED | Fixture/date odds shapes can return bookmaker collections; selected fixture coverage still requires dry-run |
| Multiple markets per request | CONFIRMED | Odds response can include multiple `bets[]` for one bookmaker |
| Multiple fixtures per request | PARTIALLY CONFIRMED | date and league/season request shapes exist; response count shape not yet validated for controlled scope |
| Fixture identifier field | CONFIRMED | `response[].fixture.id` |
| Bookmaker id/name shape | CONFIRMED | `bookmakers[].id`, `bookmakers[].name` |
| Bet/market id/name shape | CONFIRMED | `bets[].id`, `bets[].name` |
| Values/selections shape | CONFIRMED | `values[].value` |
| Odds value shape | CONFIRMED | `values[].odd` as decimal string |
| Provider update timestamp | CONFIRMED | `response[].update` |
| Bookmaker discovery path | CONFIRMED FOR PLANNING | `GET /odds/bookmakers`; standard wrapper with `response[].id` and `response[].name` |
| Market/bet discovery path | CONFIRMED FOR PLANNING | `GET /odds/mapping`; standard wrapper with `league`, `fixture`, and `update` |
| Direct `match_winner` / 1X2 request support | CONFIRMED | `bet=1`, `Match Winner`, values `Home` / `Draw` / `Away` |
| Pre-match-only request support | NOT CONFIRMED | Official request filters or lifecycle rules |
| Endpoint restrictions / plan limitations | NOT CONFIRMED | Current account plan or official docs |
| Rate limits | PARTIALLY CONFIRMED | `/status` exposes `requests.limit_day`; observed limit `100`; daily and per-minute limits apply; exact remaining counters must be read from runtime headers in any future dry-run |

## Risk Decision

Because endpoint, request shape, discovery shape, and quota/request cost are now documented for planning, PR #81's evidence blocker is superseded by PR #82.

Runtime remains blocked from execution in this PR:

```txt
production provider odds calls: NOT RUN
read-only production odds dry-run: NOT STARTED
odds writes: NOT STARTED
```

BetTracker must not run a production provider odds call until CPO approves a specific read-only dry-run scope with known canonical fixture IDs, request budget, and sanitized reporting expectations.

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
