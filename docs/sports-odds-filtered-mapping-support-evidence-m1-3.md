# M1.3 Filtered Mapping Support Evidence

Status: EVIDENCE / BLOCKED FOR FILTERED RUNTIME

Last updated: 2026-07-06

## Scope

This document records sanitized evidence for whether API-Football `/odds/mapping` supports filters that can narrow discovery without crawling pages 2-11.

This is documentation/status evidence only:

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

## Context

PR #102 recorded that known BetTracker provider fixture IDs were not present in the existing `/odds/mapping` page-1 sample:

```txt
provider_fixture_id 1576052: NOT PRESENT
provider_fixture_id 1576053: NOT PRESENT
```

Existing `/odds/mapping` page-1 result:

```txt
paging.current: 1
paging.total: 11
resultsCount: 100
mappingCoverage count: 100
```

Safety state:

```txt
page 2+ remains blocked
full mapping crawl remains blocked
no provider call was made for this evidence record
```

## Evidence Source

Source reviewed:

```txt
docs/api-football-odds-provider-evidence-m1-3.md
```

This source contains sanitized operator-side API-Football/API-Sports docs/account evidence captured during PR #82.

No new provider calls were made. No raw provider payload, API key, account data, or secret query parameter is included.

## Confirmed Mapping Endpoint

Confirmed endpoint path:

```txt
GET /odds/mapping
```

Confirmed sanitized response shape:

```txt
get
parameters
errors
results
paging.current
paging.total
response[]
```

Confirmed `response[]` fields:

```txt
league.id
league.season
fixture.id
fixture.date
fixture.timestamp
update
```

Confirmed interpretation:

```txt
/odds/mapping identifies fixtures that have available pre-match odds mappings.
The field required to connect mapping output to BetTracker provider links is fixture.id.
```

## Filter Support Matrix

The sanitized evidence confirms only the unfiltered mapping endpoint path.

| Candidate filter | Confirmed for `/odds/mapping`? | Evidence status |
|---|---:|---|
| `fixture` | No | Not present in sanitized `/odds/mapping` evidence |
| `league` | No | Not present in sanitized `/odds/mapping` evidence |
| `season` | No | Not present in sanitized `/odds/mapping` evidence |
| `date` | No | Not present in sanitized `/odds/mapping` evidence |
| `bookmaker` | No | Not present in sanitized `/odds/mapping` evidence |
| `bet` | No | Not present in sanitized `/odds/mapping` evidence |
| `page` | Not as a documented request parameter | Response pagination is confirmed through `paging.current` / `paging.total`, but the sanitized evidence does not include an exact `/odds/mapping?page={page}` request shape |
| other narrowing parameter | No | Not present in sanitized evidence |

Important distinction:

```txt
GET /odds supports fixture, league, season, date, bookmaker, bet, and page parameters.
Those confirmed /odds filters do not prove the same filters are supported by /odds/mapping.
```

## Exact Documented Request Shapes

Confirmed for mapping:

```txt
GET /odds/mapping
```

Not confirmed for mapping:

```txt
GET /odds/mapping?fixture=1576052
GET /odds/mapping?league={league_id}
GET /odds/mapping?league={league_id}&season={season}
GET /odds/mapping?date={YYYY-MM-DD}
GET /odds/mapping?bookmaker={bookmaker_id}
GET /odds/mapping?bet={bet_id}
GET /odds/mapping?page={page}
```

## Known Fixture-Specific Mapping Check

Known fixture-specific mapping check status:

```txt
blocked / not confirmed
```

Reason:

```txt
No sanitized evidence confirms that /odds/mapping supports a fixture filter.
```

Therefore this PR does not recommend:

```txt
GET /odds/mapping?fixture=1576052
```

as an approved future runtime request.

## League/Season Narrow Check

League/season narrow check status:

```txt
blocked / not confirmed
```

Reason:

```txt
No sanitized evidence confirms that /odds/mapping supports league or season filters.
```

Therefore a league/season mapping scope is not approved by this evidence record.

## Can Page 2+ Crawl Be Avoided?

Current evidence answer:

```txt
not proven
```

The existing sanitized evidence does not confirm a useful `/odds/mapping` narrowing parameter. Without a confirmed filter, BetTracker cannot prove it can avoid a page 2+ crawl while discovering whether fixtures `1576052` or `1576053` appear later in mapping coverage.

## Decision

Filtered `/odds/mapping` runtime is not approved.

Decision:

```txt
Keep full page crawl blocked.
Do not call /odds/mapping?page=2.
Do not call unconfirmed filtered /odds/mapping query shapes.
Obtain stronger provider docs/account evidence before any filtered runtime scope.
```

If future sanitized provider evidence confirms a fixture filter, the next candidate scope may be:

```txt
GET /odds/mapping?fixture=1576052
page 1 only
max provider requests: 1
sanitized report only
```

If future evidence confirms league/season filters but not fixture filters, a later scope must still justify request budget and relevance before runtime.

If no useful filters are confirmed, mapping exploration should remain stopped or require a separate explicit CPO-approved full-crawl budget.

## FP-001 Guardrail

Filtered mapping support evidence does not unlock:

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

Mapping reference evidence is technical only. It does not prove odds coverage, fair value, line movement value, model readiness, or pricing validity.

## Next Step

The next step is not runtime.

Possible next safe actions:

1. Stop mapping exploration for now.
2. Obtain stronger sanitized API-Football docs/account evidence for `/odds/mapping` query parameters.
3. If a filter is confirmed, open a separate CPO-approved runtime scope with exact request shape, max request budget, page limit, stop conditions, sanitized report fields, and FP-001 check.

No future scope may include raw provider payload, token, account data, odds prices, Supabase writes, Scout/Analyst/UI usage, probability, edge, EV, recommendation, or betting signal.
