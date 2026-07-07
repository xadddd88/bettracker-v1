# M1.2.e.2 SportMonks Canonical Fixture Mapping Scope

Status: DOCS / STATUS SCOPE ONLY / RUNTIME BLOCKED

Last updated: 2026-07-07

## Scope

This document defines the M1.2.e.2 SportMonks canonical fixture mapping scope before any canonical-linked football enrichment dry-run.

This PR is documentation/status only:

- no runtime code
- no provider calls
- no migrations
- no Supabase writes
- no env flags
- no enrichment writes
- no Scout/Analyst/UI usage
- no probability, implied probability, edge, EV, recommendation, Place Bet, or betting signal

Check against FP-001 before any future enrichment, mapping, Scout, Analyst, or UI work.

## Production DB Checkpoint

The operator/CPO verified production DB state:

```txt
fixture_provider_links contains:
- 2 api_football / exact rows
- 0 sportmonks rows
```

New blocker:

```txt
No exact/high SportMonks provider link exists for canonical fixture 1576052.
```

Therefore:

```txt
No SportMonks link -> no canonical enrichment.
No canonical enrichment -> no write.
No write -> no Analyst/Scout/UI.
```

## Why This Scope Exists

PR #107 completed endpoint evidence and identified SportMonks `GET /v3/football/fixtures/{ID}` as the preferred candidate family for a future read-only enrichment dry-run.

That endpoint is SportMonks-fixture scoped. BetTracker cannot attach its result to a canonical fixture unless an exact/high-confidence SportMonks provider link exists first.

The current controlled canonical fixture `1576052` has no verified SportMonks provider link. A native SportMonks fixture ID can validate response shape, but it is not enough for canonical enrichment.

## Required Distinction

### SHAPE-ONLY / UNBOUND Dry-Run

A shape-only dry-run may validate SportMonks response shape using a native SportMonks fixture ID.

Allowed in a later separately approved scope:

- validate response shape
- validate include behavior
- validate sanitized report fields
- validate freshness fields if present

Not allowed:

- write enrichment
- attach to `canonical_fixture_id`
- create or update `fixture_provider_links`
- unlock enrichment writes
- unlock Scout/Analyst/UI
- unlock probability, edge, EV, recommendation, Place Bet, or betting signal

### CANONICAL-LINKED Dry-Run

A canonical-linked dry-run requires:

- selected canonical football fixture
- exact/high SportMonks provider link for that canonical fixture
- approved include set
- approved request budget
- sanitized report shape
- explicit CPO runtime approval

Only canonical-linked dry-runs can become candidates for later enrichment write design.

## M1.2.e.2 Roadmap

### 2.5.a Mapping Scope / Evidence

Status: this document.

Goal: define how BetTracker will prove SportMonks fixture identity before canonical enrichment.

### 2.5.b Read-Only Mapping Discovery

Separate CPO approval required.

Possible future evidence sources:

- SportMonks fixture search or filter documentation
- existing provider fixture metadata
- team/date/league matching evidence
- one-request shape-only probe, if explicitly approved

No provider call is approved by this document.

### 2.5.c Controlled Provider Link Write

Only if exact/high confidence is established.

The provider link write must be a separate controlled operation with:

- explicit write scope
- exact canonical fixture
- exact SportMonks provider fixture ID
- confidence reason
- idempotency check
- no enrichment write
- no Scout/Analyst/UI usage

### 2.5.d Mapping Validation Record

After any controlled provider link write, record:

- canonical fixture ID
- provider
- provider fixture ID
- confidence
- evidence class
- write result
- idempotency result
- downstream non-use status

## Mapping Evidence Requirements

Before a SportMonks link is eligible for controlled write, evidence must include:

- canonical fixture identity
- SportMonks fixture identity
- team/participant match
- kickoff/start time match or acceptable documented difference
- competition/league/season match where available
- status/state compatibility
- evidence source
- confidence classification
- reason why the mapping is exact/high

## Confidence Rubric

Exact/high confidence requires enough independent fields to make a wrong match unlikely.

Acceptable evidence may include:

- same participants
- same kickoff time or documented timezone-equivalent time
- same competition/season
- same fixture date
- same home/away assignment where applicable

Not sufficient alone:

- team name substring match
- same date only
- same league only
- native provider fixture ID without canonical comparison
- unbound response shape

## Sanitized Output Shape

Future read-only mapping discovery should return only sanitized fields such as:

- canonical fixture ID
- provider fixture ID
- provider
- mapping confidence candidate
- compared fields present yes/no
- blockers
- stop reasons
- estimated provider requests
- actual provider requests

Do not return:

- raw provider payload
- tokens
- account data
- secret params
- betting odds
- probability
- edge
- EV
- recommendation
- Scout/Analyst/UI signal

## Write Policy

No SportMonks provider link write is approved by this scope.

A later controlled provider-link write may be proposed only after exact/high confidence evidence exists.

No enrichment write is approved until:

1. exact/high SportMonks provider link exists
2. read-only enrichment dry-run is approved and executed safely
3. schema/write design is accepted
4. controlled enrichment write validation is accepted
5. trust validation is accepted

## Downstream Usage Policy

SportMonks mapping evidence does not unlock:

- Analyst probability
- implied probability
- edge
- EV
- recommendation
- Place Bet
- Scout score
- UI actionability
- betting signal

No SportMonks link -> no canonical enrichment.
No canonical enrichment -> no write.
No write -> no Analyst/Scout/UI.

## FP-001 Guardrail

FP-001 remains active:

```txt
Reference discovery != betting signal
Provider availability != model probability
Enrichment response shape != edge
Lineup/injury fact != recommendation
```

SportMonks fixture mapping is identity evidence only. It is not a betting model and must not be used as a betting signal.

## Current Status

```txt
M1.2.e Football Enrichment Endpoint Evidence - DONE
M1.2.e.2 SportMonks Canonical Fixture Mapping Scope - IN REVIEW
SportMonks provider links in production - 0
canonical fixture 1576052 SportMonks link - MISSING
canonical-linked enrichment dry-run - BLOCKED
shape-only/unbound dry-run - NOT APPROVED
football enrichment writes - NOT STARTED
Scout/Analyst/UI enrichment usage - NOT STARTED
betting signals - NOT STARTED
```
