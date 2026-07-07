# M1.2.e.2.b Read-Only SportMonks Mapping Discovery Scope

Last updated: 2026-07-07

## Status

DOCS / SCOPE ONLY / RUNTIME BLOCKED

## Scope

This document defines a future read-only SportMonks mapping discovery scope for canonical fixture `1576052`.

This document does not approve runtime.

This PR is documentation/status only:

- no runtime code
- no provider calls
- no migrations
- no Supabase writes
- no env flags
- no provider-link writes
- no enrichment writes
- no Scout/Analyst/UI usage
- no probability, implied probability, edge, EV, recommendation, Place Bet, or betting signal

FP-001 remains active.

## Existing State

Production DB checkpoint:

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

## Non-Goals

- no runtime code
- no provider calls
- no migrations
- no Supabase writes
- no env flags
- no provider-link writes
- no enrichment writes
- no Scout/Analyst/UI
- no probability
- no implied probability
- no edge
- no EV
- no recommendation
- no Place Bet
- no betting signal

## Discovery Is Not Fixture-By-ID

SportMonks `GET /v3/football/fixtures/{ID}` requires a known SportMonks fixture ID.

This mapping discovery does not have that ID yet.

Therefore it must not use fixture-by-ID as the discovery mechanism.

`GET /v3/football/fixtures/{ID}` is valid only after a SportMonks `provider_fixture_id` exists.

## Future Discovery Inputs

Future runtime must read match keys from canonical storage at runtime.

Do not hardcode match identity except for the selected `canonical_fixture_id`.

Inputs:

- `canonical_fixture_id = 1576052`
- canonical kickoff date
- kickoff tolerance window
- league / competition if available
- season if available
- home team / away team
- normalized participant names
- provider link state

## Candidate Endpoint Evidence Requirement

Possible SportMonks discovery endpoint families:

- fixtures by date
- fixtures between dates

Before runtime, a separate evidence step must confirm:

- exact SportMonks endpoint path
- request params
- whether date/between endpoints support required filters
- pagination shape
- response shape
- quota/request cost
- rate limits
- plan availability
- freshness semantics
- whether pagination metadata can be safely interpreted

This PR does not confirm endpoint shape and does not approve a runtime request shape.

Do not assume runtime request shape from memory or speculation.

## Pagination / Request Guardrails

Future approved runtime scope must obey:

- max provider requests: 2
- page 1 only
- stop if `paging.total > 1`
- no page 2
- no crawl
- no broad search
- no fallback endpoint calls
- no retries without separate approval

If an endpoint requires more than the approved budget, return a sanitized blocked report only.

## Token Redaction

SportMonks uses `api_token` as a query parameter.

This is a special risk.

`api_token` must never appear in:

- logs
- sanitized report
- Vercel logs
- Sentry
- docs
- PR body
- console output
- errors
- screenshots
- raw URLs
- copied request examples

Any URL shown must redact query params:

```txt
?api_token=[REDACTED]
```

If redaction cannot be guaranteed, abort before provider call.

## Confidence Rubric

Use the inherited M1.2.e.2 rubric:

- exact
- high
- medium
- needs_review
- failed

Only exact/high may become eligible for a later controlled provider-link write.

Medium / needs_review / failed:

- write zero rows
- keep mapping blocked
- no enrichment
- no downstream usage

## Evidence Required For Exact/High

Exact/high requires enough independent fields to make wrong-match risk low:

- same participants
- same home/away assignment where applicable
- same kickoff time or timezone-equivalent time within approved tolerance
- same fixture date
- same competition/league/season where available
- status/state compatibility if available

Not sufficient alone:

- team name substring match
- same date only
- same league only
- native provider fixture ID without canonical comparison
- unbound response shape

## Sanitized Output Shape

Future report may include:

- provider
- endpoint family
- canonical_fixture_id
- candidate_provider_fixture_id
- request_count
- endpoint_attempted
- page_attempted
- paging_current
- paging_total
- results_count
- compared_fields_present
- mapping_confidence_candidate
- blockers
- stop_reasons
- warnings
- redaction_confirmed
- write_skipped
- downstream_usage_blocked

Must not include:

- raw provider payload
- api_token
- full provider URL with query token
- account data
- secret params
- player-level raw details
- team news text
- injury text
- lineup lists
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

- Missing canonical fixture -> abort before provider call
- Missing required canonical match keys -> abort before provider call
- Endpoint evidence unconfirmed -> abort before provider call
- Token redaction not guaranteed -> abort before provider call
- `paging.total > 1` -> stop, no page 2
- no candidate found -> NOT FOUND report, zero writes
- multiple candidates -> AMBIGUOUS report, zero writes
- medium/needs_review confidence -> zero writes
- endpoint error -> sanitized error category only
- auth/plan blocked -> sanitized blocked report
- unexpected response shape -> sanitized schema warning
- timeout/network error -> sanitized error category, no retry

## Write Policy

This PR approves no writes.

No provider-link write is approved.

Future controlled provider-link write requires a separate PR and CPO approval.

## Downstream Usage Policy

Mapping discovery does not unlock:

- enrichment writes
- Scout
- Analyst
- UI
- probability
- edge
- EV
- recommendation
- Place Bet
- betting signal

FP-001 remains active.

## Future Sequence

- 2.5.b.1 Endpoint evidence for SportMonks mapping discovery endpoint
- 2.5.b.2 Read-only mapping discovery implementation/scope
- 2.5.b.3 Explicit CPO runtime approval
- 2.5.b.4 Runtime read-only mapping discovery
- 2.5.c Controlled provider-link write only if exact/high
- 2.5.d Mapping validation record

## Current Status

```txt
M1.2.e Football Enrichment Endpoint Evidence - DONE
M1.2.e.2 SportMonks Canonical Fixture Mapping Scope - DONE
M1.2.e Football Enrichment Read-Only Dry-Run Scope - DONE
M1.2.e.2.b Read-Only SportMonks Mapping Discovery Scope - IN REVIEW
SportMonks provider links in production - 0
canonical fixture 1576052 SportMonks link - MISSING
canonical-linked enrichment dry-run - BLOCKED
shape-only/unbound dry-run - NOT APPROVED
runtime provider calls - NOT RUN
provider-link writes - NOT STARTED
football enrichment writes - NOT STARTED
Scout/Analyst/UI enrichment usage - NOT STARTED
betting signals - NOT STARTED
```
