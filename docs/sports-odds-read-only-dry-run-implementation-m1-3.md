# M1.3 Read-Only Odds Dry-Run Implementation

Status: PR #85 merged / read-only runtime path implemented / first production dry-run executed safely

Last updated: 2026-07-06

## Scope

PR #85 implements the protected read-only runtime path approved by PR #83. GitHub assigned this implementation as PR #85 because PR #84 already exists. The first separately approved production dry-run was executed after PR #85 merged and is recorded here plus in `docs/sports-odds-read-only-dry-run-result-m1-3.md`.

Allowed:

- add an admin-only server route for the read-only odds dry-run
- add a server helper that performs Supabase pre-flight reads
- use server-side `API_FOOTBALL_KEY` only when a separately approved runtime call is executed
- make at most one provider request from the helper after pre-flight passes
- return a sanitized coverage report only
- add mocked tests for pre-flight, one-request behavior, pagination guardrail, sanitization, and no writes

Not allowed:

- production provider odds call during PR #85 implementation or validation
- odds writes
- Supabase writes
- migrations
- adding or enabling `SPORTS_ODDS_SYNC_WRITE_ENABLED`
- enabling `SPORTS_FIXTURE_SYNC_WRITE_ENABLED`
- Scout, Analyst, or UI odds usage
- model probability, implied probability, edge, EV, recommendation, or betting signal output

## Implemented Runtime Path

Route:

```txt
POST /api/admin/sports/odds/dry-run
```

Protection:

- requires the existing operator bearer token
- uses server-only Supabase admin client after authorization
- never exposes `API_FOOTBALL_KEY` to the client

Approved fixed scope:

```txt
provider: api_football
providerFixtureId: 1576052
market: Match Winner / 1X2
provider bet id: 1
request shape: GET /odds?fixture=1576052&bet=1
page: 1 only
max provider requests: 1
operatorConfirm: RUN_READ_ONLY_ODDS_DRY_RUN_M1_3
```

Required request body:

```json
{
  "dryRun": true,
  "providerFixtureId": "1576052",
  "betId": 1,
  "operatorConfirm": "RUN_READ_ONLY_ODDS_DRY_RUN_M1_3"
}
```

## Pre-Flight Gates

Before any API-Football call, the helper verifies:

- exact `fixture_provider_links` row exists
- `provider = api_football`
- `provider_fixture_id = 1576052`
- `mapping_confidence = exact`
- linked `canonical_fixtures` row exists
- `sport = football`
- `status = scheduled`
- `kickoff_at` is known
- `kickoff_at > now + 15 minutes`

If any pre-flight gate fails:

```txt
requestAttempted = false
actualProviderRequests = 0
```

## Provider Call Guardrails

If pre-flight passes, the helper may make exactly one request:

```txt
GET /odds?fixture=1576052&bet=1
```

Rules:

- do not fetch page 2
- if `paging.total > 1`, set `paginationOverflow = true`
- return stop reason: `provider pagination total exceeds approved page-1 budget`
- do not store, log, or return the raw provider payload

## Sanitized Report

The route/helper returns only:

- `providerFixtureId`
- `requestAttempted`
- `paging.current`
- `paging.total`
- `oddsAvailable`
- discovered bookmaker ids/names
- discovered market ids/names
- `valuesPresent`
- `estimatedProviderRequests`
- `actualProviderRequests`
- `paginationOverflow`
- stop reasons
- pre-flight summary

The report must not include:

- provider token
- operator token
- raw provider payload
- raw odds values/prices
- account details
- model probability
- implied probability
- edge
- EV
- recommendation
- Scout or Analyst signal

## Validation

Covered by `npm.cmd run test:provider-safety`:

- pre-flight failure blocks provider call
- successful pre-flight allows exactly one provider call
- `paging.total > 1` stops after page 1
- sanitized report contains no token, raw payload, odds prices, or betting-signal fields
- route requires operator authorization before Supabase/provider calls
- route rejects empty body before Supabase/provider calls
- route rejects missing or wrong `operatorConfirm` before Supabase/provider calls
- route accepts the exact approved request body under mocks and still makes at most one provider call
- no Supabase writes happen
- existing fixture sync and discovery planner safety tests remain green

Additional required PR validation:

- `npm.cmd run test:extract-json`
- `npm.cmd run test:analysis-quality-gate`
- `npm.cmd run build` with dummy public Supabase env

## Production Read-Only Dry-Run Result

Approved production route:

```txt
POST https://btdk.app/api/admin/sports/odds/dry-run
```

Approved body:

```json
{
  "dryRun": true,
  "providerFixtureId": "1576052",
  "betId": 1,
  "operatorConfirm": "RUN_READ_ONLY_ODDS_DRY_RUN_M1_3"
}
```

Sanitized result:

```txt
status: 200
success: true
dryRun: true
provider: api_football
providerFixtureId: 1576052
market: match_winner
betId: 1
preflight.passed: true
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
```

Interpretation:

- Pre-flight passed.
- Exactly one provider request was executed.
- API-Football returned no odds coverage for fixture `1576052` / `bet=1`.
- No page 2 was requested.
- No writes occurred.
- No raw payload, token, odds prices, probability, implied probability, edge, EV, recommendation, Scout/Analyst/UI signal, or betting signal surfaced.

## Current Runtime State

```txt
SPORTS_FIXTURE_SYNC_WRITE_ENABLED: absent/off
SPORTS_ODDS_SYNC_WRITE_ENABLED: not added/enabled
fixture write mode: off
production provider odds dry-run: executed once, safely, with oddsAvailable=false
odds writes: not run
Supabase writes: not run
Scout/Analyst/UI odds usage: not started
```

## Decision

PR #85 implements the approved read-only dry-run path. The separately approved production read-only dry-run executed safely and found no odds coverage for the selected fixture/market.

Any further runtime step still requires separate CPO approval before calling API-Football again, including fallback fixtures, page 2, broader scopes, writes, or downstream Scout/Analyst/UI usage.

```txt
GET /odds?fixture=1576052&bet=1
```
