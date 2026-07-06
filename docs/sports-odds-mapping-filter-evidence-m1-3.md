# M1.3 API-Football /odds/mapping Filter Evidence

Status: EVIDENCE / FILTERED RUNTIME BLOCKED

Last updated: 2026-07-06

## Scope

This document records sanitized provider documentation/account evidence for API-Football `/odds/mapping` filters.

This is documentation/status evidence only:

- no runtime code
- no provider calls
- no `/odds/mapping` rerun
- no page 2 fetch
- no crawl of pages 2-11
- no odds writes
- no Supabase writes
- no migrations or env flags
- no Scout, Analyst, or UI changes
- no probability, implied probability, edge, EV, recommendation, Place Bet, or betting signal

Check against FP-001 before any future mapping, odds, Scout, Analyst, or UI work.

## Current Context

Existing M1.3 mapping evidence:

```txt
GET /odds/mapping confirmed
/odds/mapping page 1 returned 100 rows
paging.total = 11
provider_fixture_id 1576052 was NOT PRESENT in page-1 mappingCoverage
provider_fixture_id 1576053 was NOT PRESENT in page-1 mappingCoverage
/odds/mapping page 2+ remains blocked
full mapping crawl remains blocked
filtered /odds/mapping runtime is not approved
```

This document does not approve runtime calls. It only records whether current evidence confirms useful `/odds/mapping` request filters.

## Evidence Sources

Evidence sources reviewed:

- `docs/api-football-odds-provider-evidence-m1-3.md`
- `docs/sports-odds-filtered-mapping-support-evidence-m1-3.md`
- `docs/sports-odds-mapping-exploration-pause-m1-3.md`
- sanitized operator-provided official API-Football / API-Sports docs/account evidence recorded in PR #82

Additional public documentation check:

- URL checked: `https://www.api-football.com/documentation-v3`
- Result: non-interactive Codex fetch received a JavaScript/cookie browser challenge and did not expose extractable documentation content.
- Interpretation: this adds no positive evidence for `/odds/mapping` filters.

No provider API endpoint was called for this evidence record. No raw provider payload, token, account data, odds prices, or secret query parameters were stored.

## Confirmed Request Shapes

Confirmed for the odds values endpoint `GET /odds`:

```txt
GET /odds?fixture={fixture_id}
GET /odds?league={league_id}&season={season}
GET /odds?date={YYYY-MM-DD}
GET /odds?bookmaker={bookmaker_id}&bet={bet_id}&league={league_id}&season={season}
GET /odds?bet={bet_id}&fixture={fixture_id}
GET /odds?bookmaker={bookmaker_id}&league={league_id}&season={season}
GET /odds?date={YYYY-MM-DD}&page={page}&bet={bet_id}
```

Confirmed for the mapping reference endpoint:

```txt
GET /odds/mapping
```

Confirmed `/odds/mapping` response fields:

```txt
paging.current
paging.total
response[].league.id
response[].league.season
response[].fixture.id
response[].fixture.date
response[].fixture.timestamp
response[].update
```

No additional `/odds/mapping` query shape is confirmed by current evidence.

## Filter Support Matrix

| Candidate filter | Confirmed for `/odds/mapping`? | Evidence status |
|---|---:|---|
| `fixture` | No | Not present in current sanitized mapping evidence |
| `league` | No | Not present in current sanitized mapping evidence |
| `season` | No | Not present in current sanitized mapping evidence |
| `date` | No | Not present in current sanitized mapping evidence |
| `bookmaker` | No | Not present in current sanitized mapping evidence |
| `bet` | No | Not present in current sanitized mapping evidence |
| `page` | Not as exact request shape | Response pagination exists, but exact `/odds/mapping?page={page}` request shape is not confirmed |
| other narrowing parameter | No | Not present in current sanitized mapping evidence |

## Endpoint Distinction

The evidence confirms that `GET /odds` supports filters such as `fixture`, `league`, `season`, `date`, `bookmaker`, `bet`, and `page`.

That does not prove those parameters are supported by `GET /odds/mapping`.

Using `/odds` parameters on `/odds/mapping` is not supported by current evidence and is not approved for runtime.

## Fixture-Specific Mapping

Fixture-specific mapping is not confirmed.

These calls are not approved:

```txt
GET /odds/mapping?fixture=1576052
GET /odds/mapping?fixture=1576053
```

If future official provider docs/account evidence confirms a fixture filter, a later CPO-approved scope may propose:

```txt
GET /odds/mapping?fixture=1576052
page 1 only
max provider requests: 1
sanitized report only
```

## League / Season Mapping

League and season filters are not confirmed for `/odds/mapping`.

These calls are not approved:

```txt
GET /odds/mapping?league={league_id}
GET /odds/mapping?league={league_id}&season={season}
```

If future official evidence confirms league/season filters, a later scope must justify request budget and relevance before any runtime call.

## Date, Bookmaker, Bet, and Page

Current evidence does not confirm these `/odds/mapping` filters:

```txt
date
bookmaker
bet
```

Current runtime evidence proves response pagination:

```txt
paging.current = 1
paging.total = 11
```

It does not confirm the exact request syntax for page 2 on `/odds/mapping`, and page 2 remains blocked.

## Decision

Do not call:

```txt
/odds/mapping?fixture=1576052
/odds/mapping?fixture=1576053
/odds/mapping?league=...
/odds/mapping?season=...
/odds/mapping?date=...
/odds/mapping?bookmaker=...
/odds/mapping?bet=...
/odds/mapping?page=2
```

Do not crawl pages 2-11.

Keep M1.3 mapping exploration paused unless one of these happens:

1. stronger official provider docs/account evidence confirms a useful `/odds/mapping` filter, or
2. a separate CPO-approved full-crawl budget strategy explicitly approves page 2+ calls.

## FP-001 Guardrail

Mapping filter evidence does not unlock:

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

Reference discovery, mapping coverage, and provider availability remain technical evidence only.
