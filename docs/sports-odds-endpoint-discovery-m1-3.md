# M1.3 Odds Endpoint Discovery & Dry-Run Plan

Status: draft PR #80 / read-only planner scaffold

Last updated: 2026-07-05

## Scope

PR #80 prepares M1.3 implementation without starting odds ingestion.

Allowed in PR #80:

- document the endpoint discovery blocker
- add a read-only odds discovery planner
- add tests for safety gates and sanitized reports
- keep all provider calls behind endpoint/cost documentation gates

Not allowed in PR #80:

- odds writes
- migrations
- production provider odds calls
- Supabase writes
- cron
- Scout, Analyst, or UI changes
- enabling `SPORTS_FIXTURE_SYNC_WRITE_ENABLED`
- adding/enabling `SPORTS_ODDS_SYNC_WRITE_ENABLED`

## Endpoint Documentation Status

The exact API-Football odds endpoint, request shape, and quota/request cost remain unconfirmed in this PR.

Reason:

- `https://www.api-football.com/documentation-v3`
- `https://api-sports.io/documentation/football/v3`

Both official documentation hosts returned a browser challenge to the Codex runtime, so the implementation must not treat endpoint/cost as confirmed from this environment.

Rule:

```txt
No production provider odds call is allowed until the exact API-Football odds endpoint, request shape, and quota/request cost are documented in a later implementation PR.
```

If endpoint/cost is unknown:

```txt
stop before provider calls
return sanitized dry-run/planning report
write nothing
```

## Read-Only Planner

PR #80 introduces a provider-layer planner:

```txt
lib/providers/odds-discovery.ts
```

The planner is pure and read-only. It does not:

- call API-Football directly
- create a route
- query Supabase
- write Supabase rows
- expose raw provider payloads
- use odds in Analyst or Scout

The planner must never report writes as allowed in PR #80:

```txt
write.allowed = false
write.writeSkipped = true
```

For every `dryRun=false` request, the planner must include this sanitized blocked reason:

```txt
odds writes are not implemented in M1.3 discovery planner
```

Future code may inject a provider odds fetcher only after endpoint/request/cost are documented and approved.

## Inputs

The planner accepts known fixture candidates:

```txt
canonicalFixtureId
sport
status
kickoffAt
provider
providerFixtureId
mappingConfidence
```

This keeps PR #80 independent from Supabase reads. A later route/service may query `canonical_fixtures` and `fixture_provider_links`, but this PR does not add that production endpoint.

## Required Gates

Provider:

```txt
api_football only
```

Market:

```txt
match_winner only
```

Fixture eligibility:

```txt
sport = football
status = scheduled
kickoff_at is known
kickoff_at > now + 15 minutes
provider = api_football
provider_fixture_id exists
mapping_confidence = exact
```

Blocked fixture cases:

- live
- finished
- cancelled
- abandoned
- postponed
- retired
- walkover
- unknown status
- missing kickoff
- already started
- inside the 15-minute pre-kickoff safety buffer
- missing exact API-Football provider link

## Bookmaker Discovery

Bookmaker allowlist default:

```txt
empty
```

Dry-run may report discovered provider bookmaker IDs and names when a future fetcher is explicitly allowed.

Write mode remains blocked when:

```txt
approved bookmaker allowlist is empty
```

Max approved bookmakers per market remains:

```txt
3
```

## Sanitized Report Shape

The planner report includes:

- fixtures checked
- provider links found
- eligible fixtures
- estimated provider requests
- provider call allowed/blocked
- provider call blocked reasons
- write allowed/blocked
- discovered bookmakers
- discovered markets
- odds available/unavailable counts
- write counters fixed at 0

The report must not include:

- provider tokens
- secret query params
- raw provider payloads
- user-facing betting signals

## Current Validation

Covered by `npm.cmd run test:provider-safety`:

- endpoint/cost unknown blocks provider calls
- non-scheduled fixture blocked before provider calls
- missing kickoff blocked before provider calls
- empty bookmaker allowlist prevents write mode
- `dryRun=false` with all future-looking write gates satisfied still reports `write.allowed=false`
- dry-run returns sanitized bookmaker and market coverage
- raw provider payload/token values are not surfaced
- existing fixture sync safety behavior remains green

## Current State

```txt
SPORTS_FIXTURE_SYNC_WRITE_ENABLED: absent/off
SPORTS_ODDS_SYNC_WRITE_ENABLED: not added/enabled
fixture write mode: off
odds provider calls: not run
odds writes: not run
Supabase writes: not run
Scout/Analyst/UI odds usage: not started
M1.3 controlled odds write validation: not started
```

## Next Milestone After PR #80

Before a real provider odds dry-run can run in production, a later PR/task must confirm:

- exact API-Football odds endpoint
- exact request shape
- quota/request cost
- whether request cost is per fixture, per fixture/market, or per bookmaker
- endpoint support for fixture-specific pre-match 1X2 odds
- provider bookmaker ID/name shape
- provider market ID/name shape

Only then can BetTracker add a real provider fetcher and run an authorized read-only dry-run.

Actual odds write validation belongs to a later PR after endpoint/cost, market mapping, bookmaker allowlist, and storage schema are explicitly accepted.
