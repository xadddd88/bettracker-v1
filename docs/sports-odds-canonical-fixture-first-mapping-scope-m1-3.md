# M1.3 Canonical-Fixture-First Mapping Discovery Scope

Status: SCOPE / STRATEGY ONLY

Last updated: 2026-07-06

## Scope

This document defines a canonical-fixture-first strategy before any additional `/odds/mapping` provider calls.

This is documentation/status scope only:

- no runtime code
- no provider calls
- no `/odds/mapping` rerun
- no page 2 fetch
- no odds writes
- no Supabase writes
- no migrations or env flags
- no Scout, Analyst, or UI changes
- no probability, implied probability, edge, EV, recommendation, or betting signal

Check against FP-001 before any future implementation or runtime approval.

## Current Known Mapping Result

The latest separately approved production reference discovery after PR #98 returned:

```txt
/odds/mapping:
  requestAttempted: true
  paging.current: 1
  paging.total: 11
  resultsCount: 100
  responseShapeValid: true
  paginationOverflow: true
  mappingCoverage count: 100
```

Confirmed safety outcome:

```txt
page 1 only
page 2 was not requested
odds values endpoint was not called
fixture-specific odds endpoint was not called
no writes
no raw payload
no betting signals
```

PR #100 established that full current mapping discovery would require 10 additional provider requests and is not automatically approved.

## Known BetTracker Provider Fixture IDs

Known controlled fixture candidates from the current M1.3 path:

```txt
provider_fixture_id: 1576052
provider_fixture_id: 1576053
```

These IDs are the first fixtures to check against existing sanitized page-1 `mappingCoverage` before any broader provider request is considered.

## Canonical-Fixture-First Decision

BetTracker should prioritize matching known provider fixture IDs over a full global `/odds/mapping` crawl.

Decision:

```txt
Do not crawl all 11 mapping pages by default.
First compare existing page-1 mappingCoverage against known BetTracker provider_fixture_ids.
```

If `provider_fixture_id=1576052` or `provider_fixture_id=1576053` appears in the existing sanitized page-1 mapping coverage:

- record coverage as found
- do not make another provider request
- do not fetch page 2
- do not write storage
- do not use the coverage as a betting signal

If neither known fixture appears in the existing page-1 mapping coverage:

- evaluate whether API-Football supports filterable `/odds/mapping` discovery
- document the exact supported filters before runtime
- do not fetch page 2+ without separate CPO approval

## Request Budget Options

### Option 1 - Zero Additional Requests

Budget:

```txt
additional provider requests: 0
```

Behavior:

- Compare existing sanitized page-1 `mappingCoverage` only.
- Check whether fixture IDs `1576052` or `1576053` are already present.
- Record found/not-found status as documentation.
- Do not call providers.

This is the preferred immediate next step if the sanitized page-1 report is sufficient.

### Option 2 - Narrow Or Filtered Mapping Request

Budget:

```txt
additional provider requests: TBD after provider filter evidence
```

Behavior:

- First confirm whether `/odds/mapping` supports filtering by fixture, league, season, bookmaker, bet, or another relevant provider field.
- Only then approve a narrow runtime request.
- Keep page 1 only unless a later CPO-approved scope explicitly allows more.

This option remains blocked until filter support is documented.

### Option 3 - Full Crawl Pages 2-11

Budget:

```txt
additional provider requests: 10
```

Status:

```txt
blocked
```

Behavior:

- Do not fetch pages 2-11 under this scope.
- Do not approve full global mapping discovery by default.
- Revisit only if a later CPO-approved budget and stop-condition scope justifies it.

## Stop Conditions

Stop immediately if any future scope attempts to:

- fetch `/odds/mapping` page 2+ without separate approval
- run a full global mapping crawl without separate approval
- call odds values endpoints
- call fixture-specific odds endpoints
- write odds
- write Supabase data
- add odds env flags
- use mapping coverage in Scout, Analyst, or UI
- surface probability, implied probability, edge, EV, recommendation, or betting signal

## FP-001 Guardrail

Mapping reference coverage is not:

- model probability
- implied probability
- edge
- EV
- recommendation
- Place Bet permission
- Scout score
- Analyst signal
- UI betting signal

The presence or absence of provider mapping coverage cannot be used as pricing evidence by itself. FP-001 remains active for any future mapping, odds, bookmaker, line movement, Scout, Analyst, or UI work.

## Next Approved Step

The next approved step is documentation/status only:

```txt
Compare existing sanitized page-1 mappingCoverage against provider_fixture_id 1576052 and 1576053 if that sanitized report is available.
```

Result reference:

```txt
docs/sports-odds-canonical-fixture-first-mapping-page1-result-m1-3.md
```

The page-1 comparison result is:

```txt
DONE / NOT FOUND
```

Neither `provider_fixture_id=1576052` nor `provider_fixture_id=1576053` was present in the existing sanitized page-1 mapping coverage.

If the existing sanitized report is unavailable or does not include the known fixture IDs, do not call the provider automatically. Open a separate scope that documents:

- selected provider-supported filter, if any
- exact request shape
- max provider requests
- page limit
- stop conditions
- sanitized report fields
- no raw payload
- no token or account data
- no odds prices
- no Supabase writes
- no Scout, Analyst, or UI usage
- no probability, edge, EV, recommendation, or betting signal
- FP-001 check

Do not merge or run that future scope without CPO approval.
