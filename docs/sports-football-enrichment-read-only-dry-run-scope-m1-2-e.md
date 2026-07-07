# M1.2.e Football Enrichment Read-Only Dry-Run Scope

Status: DOCS / SCOPE ONLY / RUNTIME BLOCKED

Last updated: 2026-07-07

## Scope

This document defines the safest possible future read-only football enrichment dry-run scope after M1.2.e endpoint evidence.

This is documentation/status scope only:

- no runtime code
- no migrations
- no provider calls
- no Supabase writes
- no env flags
- no Scout, Analyst, or UI changes
- no probability, implied probability, edge, EV, recommendation, Place Bet, or betting signal

Runtime remains blocked until separate explicit CPO approval.

## Prerequisites

M1.2.e.2 SportMonks Canonical Fixture Mapping Scope is DONE and must be inherited by this read-only dry-run scope.

Production DB has been verified:

```txt
fixture_provider_links:
- 2 api_football / exact rows
- 0 sportmonks rows
```

Current blocker:

```txt
No exact/high SportMonks provider link exists for canonical fixture 1576052.
```

Therefore:

```txt
No SportMonks link -> no canonical enrichment.
No canonical enrichment -> no write.
No write -> no Analyst/Scout/UI.
```

Canonical-linked enrichment dry-run is blocked until M1.2.e.2 or a later mapping follow-up produces an exact/high SportMonks provider link.

## Dry-Run Modes

### SHAPE-ONLY / UNBOUND Dry-Run

A shape-only/unbound dry-run may validate SportMonks response shape using a native SportMonks fixture ID.

It cannot:

- write
- attach to `canonical_fixture_id`
- create or update `fixture_provider_links`
- unlock `football_enrichment` writes
- unlock Scout/Analyst/UI
- unlock probability, implied probability, edge, EV, recommendation, Place Bet, or betting signal

### CANONICAL-LINKED Dry-Run

A canonical-linked dry-run requires:

- exact/high SportMonks provider link
- selected canonical football fixture
- approved include set
- approved request budget
- approved sanitized output shape
- explicit CPO runtime approval

Missing exact/high SportMonks provider link is a hard pre-flight blocker and must abort before any provider call.

## Non-Goals

This scope does not:

- implement a SportMonks client
- add an API route
- add or enable a write flag
- add migrations or storage tables
- select the final runtime fixture
- call SportMonks
- persist raw or sanitized provider data
- fetch lineups, injuries, sidelined data, expected lineups, news, xG, pressure, statistics, events, match facts, predictions, or odds
- expose enrichment in Scout, Analyst, UI, share, PDF, or Place Bet flows
- create probability, implied probability, edge, EV, recommendation, or betting signal

## Provider Candidate

```txt
SportMonks
```

SportMonks is the preferred provider candidate for the first future football enrichment read-only dry-run because M1.2.e endpoint evidence identified a fixture-scoped endpoint with no pagination.

API-Football enrichment remains blocked until operator-side sanitized docs/account evidence confirms endpoint path, request params, response shape, quota/request cost, rate limits, plan availability, and freshness semantics.

## Endpoint Candidate

```txt
GET /v3/football/fixtures/{ID}
```

The future runtime request must use exactly one SportMonks fixture ID from an exact/high provider link.

No fallback endpoint is approved by this scope.

## Fixture Selection Requirements

Future runtime approval must name exactly one canonical football fixture.

The selected fixture must:

- already exist in BetTracker canonical fixture storage
- be football
- have a known `canonical_fixture_id`
- have a known kickoff time if freshness or phase interpretation depends on match timing
- have an exact/high SportMonks provider fixture link
- pass a pre-flight identity check before any provider call

The future runtime must not:

- use fuzzy mapping
- use broad search
- use fixture-name search
- use team-name search
- use date/league fallback discovery
- use fallback endpoints
- call a provider if the provider link is missing or below exact/high confidence

## Provider Link Requirements

Required future pre-flight evidence:

```txt
provider: sportmonks
provider_fixture_id: exact selected ID
mapping_confidence: exact or high
linked canonical fixture exists
sport: football
```

If any provider-link requirement fails, including a missing exact/high SportMonks provider link, the future dry-run must abort before the provider call and return only a sanitized blocked report.

## Include-Set Policy

The future scope may approve a minimal include set, but this PR does not approve runtime include usage.

Recommended safest include policy for the first runtime call:

```txt
fixture base response only
state include only if CPO confirms it is required for state/freshness validation
```

Do not include the following in the first runtime call unless separately approved in the runtime approval checklist:

- lineups
- injuries
- sidelined
- expected lineups
- news
- xG
- pressure
- statistics
- events
- timeline
- match facts
- predictions
- odds

Reason:

```txt
The first dry-run should validate endpoint access, fixture identity, response shape, freshness fields, and sanitized reporting.
It should not consume all enrichment families at once.
```

## Request Budget

Future runtime budget:

```txt
max provider requests: 1
pagination: none
retry loops: none
crawl: none
fallback endpoint calls: none
page 2+: not applicable / not approved
```

If the request cannot complete within one provider request, stop and return a sanitized blocked report.

## Sanitized Output Shape

The future dry-run report may include only normalized and sanitized fields:

```txt
provider
endpoint_family
canonical_fixture_id
provider_fixture_id
request_count
requested_include_set
response_status
fixture_identity_match: exact / high / failed
provider_state_id if available
provider_starting_at if available
provider_has_odds if available
provider_has_premium_odds if available
enrichment_families_present as boolean flags only
freshness_fields_present as boolean flags only
source_updated_at if explicitly present and safe
warnings
blocked_downstream_usage
```

The report must not include:

- raw provider payload
- player-level raw details
- team news text
- injury text
- lineup player lists
- sidelined player lists
- odds prices
- prediction fields
- probability
- implied probability
- edge
- EV
- recommendation
- Scout score
- Analyst signal
- UI signal
- betting signal

## Failure Handling

Future runtime failure handling must be sanitized:

| Failure | Required behavior |
| --- | --- |
| Missing SportMonks provider fixture link | Abort before provider call. |
| Mapping confidence below exact/high | Abort before provider call. |
| Linked canonical fixture missing | Abort before provider call. |
| Non-football canonical fixture | Abort before provider call. |
| Non-exact fixture identity after provider response | Return sanitized failure report only. |
| Endpoint error | Return sanitized error category only. |
| Auth blocked | Return sanitized blocked report; do not expose token or provider body. |
| Plan blocked | Return sanitized blocked report. |
| Unexpected response shape | Return sanitized schema warning. |
| Timeout or network error | Return sanitized error category; no retry without separate approval. |

No retry is approved by this scope.

## Freshness Semantics

Future runtime must explicitly report which freshness fields are available.

Expected freshness-related fields may include:

```txt
provider_starting_at
provider_state_id
source_updated_at if the provider response includes a safe explicit update timestamp
collected_at generated by BetTracker runtime
```

Rules:

- missing freshness fields keep downstream usage blocked
- stale data must not be treated as model-ready
- provider state does not become Analyst actionability
- fixture state freshness must be interpreted only after a separate trust validation milestone
- collected_at is not the same as provider source freshness

If source freshness cannot be established, the report must say so explicitly.

## Raw Payload Policy

Raw provider payload must not be:

- committed to the repository
- persisted in Supabase
- returned from the route
- logged
- copied into docs
- used in Scout, Analyst, UI, share, PDF, or Place Bet flows

Only a sanitized technical report is allowed.

## Write Policy

No writes are approved:

- no Supabase writes
- no migrations
- no schema change
- no storage tables
- no raw payload persistence
- no sanitized payload persistence
- no write env flag
- no write operator confirmation

Future write design must be separate from read-only dry-run scope.

## Downstream Usage Policy

The future dry-run, even if successful, does not unlock:

- Scout
- Analyst
- UI enrichment display
- probability
- implied probability
- edge
- EV
- recommendation
- Place Bet
- betting signal

Any downstream usage requires separate trust validation and CPO approval.

## FP-001 Guardrail

Check against FP-001.

Endpoint evidence, reference evidence, enrichment availability, fixture state, lineup availability, injury availability, xG, pressure, statistics, events, match facts, or news availability does not become:

- probability
- implied probability
- edge
- EV
- recommendation
- Place Bet
- Scout signal
- Analyst signal
- UI signal
- betting signal

Provider facts are not model validation.

## CPO Approval Checklist

Before any runtime provider call, CPO must approve:

```txt
exact selected canonical fixture
exact SportMonks provider_fixture_id
provider link evidence
include list
request budget
expected sanitized output shape
failure handling
freshness semantics
no raw payload persistence rule
explicit runtime command/body if implemented behind an admin route
```

This PR does not provide runtime approval.

## Current Status

```txt
M1.2.e Football Enrichment Endpoint Evidence - DONE
M1.2.e.2 SportMonks Canonical Fixture Mapping Scope - DONE
M1.2.e Football Enrichment Read-Only Dry-Run Scope - IN REVIEW
M1.2.e canonical-linked read-only dry-run - BLOCKED ON EXACT/HIGH SPORTMONKS PROVIDER LINK
M1.2.e shape-only/unbound dry-run - NOT APPROVED
runtime football enrichment provider calls - NOT RUN
football enrichment writes - NOT STARTED
Scout / Analyst / UI enrichment usage - NOT STARTED
betting signals - NOT STARTED
FP-001 - ACTIVE
```
