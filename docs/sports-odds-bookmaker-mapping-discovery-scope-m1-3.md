# M1.3 Bookmaker & Mapping Discovery Scope

Status: scope DONE via PR #88 / implementation merged via PR #92 / first runtime result PARTIAL / SAFE

Last updated: 2026-07-06

## Context

The first production read-only odds dry-run executed safely for:

```txt
GET /odds?fixture=1576052&bet=1
```

Result:

```txt
status: 200
success: true
preflight.passed: true
requestAttempted: true
actualProviderRequests: 1
paging.current: 1
paging.total: 1
oddsAvailable: false
writeSkipped: true
```

Ground-truth fixture context:

```txt
providerFixtureId: 1576052
status: scheduled
kickoff date: 2026-12-31
coverage interpretation: about 178 days away at runtime, so no odds coverage is expected and not an integration defect
```

## Decision

The next safer step is reference discovery, not a new near-term fixture odds call and not an odds write milestone.

PR #88 only scopes a future controlled discovery run for:

```txt
GET /odds/bookmakers
GET /odds/mapping
```

PR #88 did not run those provider calls. PR #92 later implemented the protected read-only route. The first separately approved runtime reference discovery attempted `/odds/bookmakers` only, then stopped before `/odds/mapping` because the bookmaker response shape differed from expected evidence.

## Approved Discovery Scope Proposal

Endpoints:

```txt
GET /odds/bookmakers
GET /odds/mapping
```

Budget:

```txt
max provider requests: 2 total
page: 1 only for each endpoint
stop if paging.total > 1 on either endpoint
```

Explicitly out of scope:

- pagination crawling
- page 2
- odds values endpoint
- fixture-specific odds call
- odds writes
- Supabase writes
- migrations
- API routes
- Scout, Analyst, or UI usage
- model probability, implied probability, edge, EV, recommendation, or betting signal

## Report Shape

The future sanitized report may include only:

- request attempted per endpoint
- endpoint name
- `paging.current`
- `paging.total`
- results count
- discovered bookmaker ids/names from `/odds/bookmakers`
- mapping coverage fields from `/odds/mapping`:
  - `league.id`
  - `league.season`
  - `fixture.id`
  - `update`

The report must not include:

- raw provider payload
- provider token
- operator token
- account details
- secret query parameters
- odds prices
- probability
- implied probability
- edge
- EV
- recommendation
- Scout signal
- Analyst signal
- UI signal
- betting signal

## Stop Conditions

The future runtime step must stop before or during discovery if:

- estimated provider requests exceed 2
- `paging.total > 1` on either endpoint
- a response shape differs from accepted provider evidence
- any raw payload would be exposed
- report construction attempts to include odds prices
- report construction attempts to include probability, implied probability, edge, EV, recommendation, Scout signal, Analyst signal, UI signal, or betting signal

## Current State

```txt
M1.3 Read-Only Odds Dry-Run: EXECUTED / SAFE
M1.3 Bookmaker & Mapping Discovery Scope: DONE
M1.3 Bookmaker & Mapping Discovery Implementation: MERGED
M1.3 Bookmaker Discovery: PARTIAL / SAFE
M1.3 Mapping Discovery: NOT RUN
M1.3 Bookmaker & Mapping Discovery: NOT DONE
M1.3 odds writes: NOT STARTED
SPORTS_ODDS_SYNC_WRITE_ENABLED: NOT ADDED / NOT ENABLED
Scout / Analyst / UI odds usage: NOT STARTED
betting signals from odds: NOT STARTED
```

## First Runtime Result

Approved production route:

```txt
POST https://btdk.app/api/admin/sports/odds/reference-discovery
```

Approved body:

```json
{
  "dryRun": true,
  "endpoints": ["bookmakers", "mapping"],
  "maxProviderRequests": 2,
  "operatorConfirm": "RUN_BOOKMAKER_MAPPING_DISCOVERY_M1_3"
}
```

Sanitized result:

```txt
HTTP status: 200
success: false
dryRun: true
provider: api_football
scope: bookmaker_mapping_reference
estimatedProviderRequests: 2
actualProviderRequests: 1
writeSkipped: true
paginationOverflow: false
stopReasons:
  - provider response shape differs from expected evidence for /odds/bookmakers

/odds/bookmakers:
  requestAttempted: true
  paging.current: 1
  paging.total: 1
  resultsCount: 33
  paginationOverflow: false
  responseShapeValid: false
  discoveredBookmakers count: 32, as reported by sanitized output

/odds/mapping:
  requestAttempted: false
  mappingCoverage: []
  reason: stopped after bookmaker response shape guard
```

Interpretation:

- The bookmaker endpoint is reachable and returned bookmaker ids/names.
- The route correctly stopped before `/odds/mapping`.
- This is safe partial discovery, not full successful discovery.
- No page 2, odds values endpoint, or fixture-specific odds endpoint was called.
- No raw provider payload, token, account data, odds prices, probability, edge, EV, recommendation, Scout/Analyst/UI signal, or betting signal surfaced.

Reference result record: `docs/sports-odds-bookmaker-mapping-discovery-result-m1-3.md`

## Runtime Gate

Any next runtime bookmaker/mapping discovery step still requires separate CPO approval.

That later approval must restate:

- exact endpoints
- max request budget
- page-1-only rule
- pagination stop condition
- sanitized report fields
- no raw payload
- no odds prices
- no writes
- no downstream Scout/Analyst/UI use
