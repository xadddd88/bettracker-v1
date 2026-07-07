# M1.2.e.2.b.1 SportMonks Mapping Discovery Endpoint Evidence Scope

## Status

DOCS / EVIDENCE SCOPE ONLY / RUNTIME BLOCKED

Last updated: 2026-07-07

## Purpose

Define the official SportMonks endpoint evidence that must be collected before any read-only mapping discovery runtime is proposed.

This PR does not approve runtime and does not propose a final runtime request shape.

## Scope Controls

- documentation/evidence scope only
- no runtime code
- no SportMonks calls
- no API route
- no migrations
- no Supabase writes
- no provider-link writes
- no enrichment writes
- no env flags
- no Scout/Analyst/UI usage
- no probability, implied probability, edge, EV, recommendation, Place Bet, or betting signal

FP-001 remains active.

## Context

Decision #037 defines a future read-only SportMonks mapping discovery scope for canonical fixture `1576052`.

That scope is blocked until official endpoint evidence confirms how SportMonks fixture discovery can be narrowed from canonical fixture data.

Discovery remains not fixture-by-ID:

```txt
GET /v3/football/fixtures/{ID}
```

Reason:

```txt
The SportMonks fixture ID is unknown.
```

## Candidate Endpoint Families

The evidence step must compare:

- fixtures by date
- fixtures between dates

This PR does not confirm either family as the runtime endpoint.

## Required Evidence Checklist

Official docs/account evidence must record:

- endpoint family: fixtures by date versus fixtures between dates
- exact endpoint paths
- request params
- supported filters
- whether league / season filters exist server-side or require client-side filtering
- pagination mechanism
- exact total-equivalent field name
- page size / per-page behavior if documented
- response shape
- fixture ID field
- participants availability
- home/away marker availability
- `starting_at` / timezone behavior
- league field availability
- season field availability
- state field availability
- freshness/update field availability
- include syntax for participants, league, season, and state
- quota/request cost
- rate limits
- plan availability
- `api_token` query-param redaction requirements

## Endpoint Evidence Questions

The evidence record must answer:

- Can a date request be narrowed enough for a one-fixture mapping search?
- Can a between-dates request be narrowed enough for a one-fixture mapping search?
- Are league and season filters supported server-side?
- If league and season filters are not supported server-side, what client-side comparison fields are available?
- Is pagination present?
- Which field is the source of truth for total pages or total results?
- Can page 1 only plus `paging.total > 1` stop logic be implemented safely?
- Can participants and home/away assignment be requested in one approved endpoint call?
- Can league, season, and state be included in the same response?
- Are freshness/update fields available for mapping evidence?
- What is the documented quota/request cost?
- Is the endpoint available on the current SportMonks plan?

## Token Redaction

SportMonks uses `api_token` as a query parameter.

Hard rule:

```txt
SportMonks api_token must never appear anywhere.
```

The token must never appear in:

- logs
- Vercel
- Sentry
- reports
- docs
- PR body
- copied URLs
- errors
- console output
- screenshots

Any URL must be shown as:

```txt
?api_token=[REDACTED]
```

Do not paste a full provider URL containing a real token into any repository artifact, report, PR body, issue, log, console output, or screenshot.

## What This PR Does Not Approve

This PR does not approve:

- SportMonks provider calls
- runtime code
- API routes
- migrations
- Supabase writes
- provider-link writes
- enrichment writes
- env flags
- Scout usage
- Analyst usage
- UI usage
- Place Bet
- probability
- implied probability
- edge
- EV
- recommendation
- betting signal

## Required Output For Future Evidence Record

A future evidence record may include:

- provider
- endpoint family
- endpoint path with token redacted
- HTTP method
- documented params
- supported filters
- pagination fields
- response-shape summary
- quota/request cost
- rate limits
- plan availability
- include syntax
- redaction confirmation
- remaining unknowns

It must not include:

- raw provider payload
- real `api_token`
- full URL with token
- account details
- secret params
- raw player/team/enrichment text
- odds prices
- prediction fields
- probability
- implied probability
- edge
- EV
- recommendation
- Scout signal
- Analyst signal
- UI signal
- betting signal

## FP-001 Guardrail

Endpoint evidence is not:

- identity confidence
- provider-link approval
- enrichment availability
- model probability
- implied probability
- edge
- EV
- recommendation
- Scout signal
- Analyst signal
- UI signal
- betting signal

Check against FP-001 before any future runtime, write, or downstream usage.

## Current Status

```txt
M1.2.e.2.b Read-Only SportMonks Mapping Discovery Scope - DONE
M1.2.e.2.b.1 SportMonks Mapping Discovery Endpoint Evidence Scope - IN REVIEW
SportMonks endpoint evidence collection - NOT RUN
SportMonks provider calls - NOT RUN
runtime request shape - NOT APPROVED
provider-link writes - NOT STARTED
enrichment writes - NOT STARTED
Scout/Analyst/UI usage - NOT STARTED
betting signals - NOT STARTED
```
