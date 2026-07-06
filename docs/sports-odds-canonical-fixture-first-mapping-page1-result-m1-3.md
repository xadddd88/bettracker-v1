# M1.3 Canonical-Fixture-First Mapping Page-1 Comparison Result

Status: DONE / NOT FOUND

Last updated: 2026-07-06

## Scope

This document records the page-1 comparison result for the canonical-fixture-first mapping strategy from PR #101.

This is documentation/status only:

- no runtime code
- no provider calls
- no `/odds/mapping` rerun
- no page 2 fetch
- no odds writes
- no Supabase writes
- no migrations or env flags
- no Scout, Analyst, or UI changes
- no probability, implied probability, edge, EV, recommendation, or betting signal

Check against FP-001 before any future mapping, odds, Scout, Analyst, or UI work.

## Comparison Source

Source:

```txt
already captured sanitized runtime output from the latest reference discovery run
```

No provider was called for this comparison.

Existing `/odds/mapping` page-1 result:

```txt
paging.current: 1
paging.total: 11
resultsCount: 100
mappingCoverage count: 100
```

Confirmed safety outcome:

```txt
page 2 was not requested
odds values endpoint was not called
fixture-specific odds endpoint was not called
no writes occurred
no betting signal surfaced
```

## Known BetTracker Provider Fixture IDs

Checked provider fixture IDs:

```txt
1576052
1576053
```

## Comparison Result

```txt
provider_fixture_id 1576052: NOT PRESENT in existing page-1 mappingCoverage
provider_fixture_id 1576053: NOT PRESENT in existing page-1 mappingCoverage
```

Canonical-fixture-first page-1 check result:

```txt
DONE / NOT FOUND
```

## Interpretation

This is not an integration failure.

It means the known controlled fixtures are not covered on page 1 of the global `/odds/mapping` response.

Current implications:

- `/odds/mapping` page 2+ remains blocked
- full mapping crawl remains blocked
- no additional provider call is authorized by this result
- no storage write is authorized by this result
- no user-facing odds usage is authorized by this result

## FP-001 Guardrail

Mapping reference coverage does not unlock:

- model probability
- implied probability
- edge
- EV
- recommendation
- Place Bet
- Scout score
- Analyst signal
- UI betting signal
- any betting signal

The absence of fixture IDs from page 1 also does not prove lack of odds coverage or lack of future mapping coverage. It only proves they were not present in the already captured page-1 mapping sample.

## Next Decision

Do not automatically:

- fetch `/odds/mapping` page 2
- crawl pages 2-11
- call odds values endpoints
- call fixture-specific odds endpoints
- write odds
- write Supabase data
- use mapping data in Scout, Analyst, or UI
- create probability, edge, EV, recommendation, or betting signals

Next safe decision:

```txt
Evaluate whether API-Football supports a filtered /odds/mapping request, or stop mapping exploration for now.
```

Evidence reference:

```txt
docs/sports-odds-filtered-mapping-support-evidence-m1-3.md
```

Current evidence result:

```txt
Filtered /odds/mapping runtime is not approved.
Existing sanitized evidence confirms GET /odds/mapping only.
Fixture, league, season, date, bookmaker, bet, and exact page request parameters are not confirmed for /odds/mapping.
```

Any future runtime provider call requires a separate CPO-approved scope with explicit request shape, budget, stop conditions, sanitized report fields, and FP-001 check.
