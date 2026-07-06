# M1.3 Mapping Exploration Pause & Handoff

Status: PAUSED / HANDOFF

Last updated: 2026-07-06

## Scope

This document pauses M1.3 mapping exploration after the filtered mapping support evidence record.

This is documentation/status only:

- no runtime code
- no provider calls
- no `/odds/mapping` rerun
- no page 2 fetch
- no crawl of pages 2-11
- no odds writes
- no Supabase writes
- no migrations or env flags
- no Scout, Analyst, or UI changes
- no probability, implied probability, edge, EV, recommendation, or betting signal

Check against FP-001 before any future mapping, odds, Scout, Analyst, or UI work.

## Current Facts

Current M1.3 mapping path facts:

```txt
/odds/mapping page 1 returned 100 rows
paging.total = 11
page 2 was not requested
full crawl pages 2-11 would require 10 additional provider requests
provider_fixture_id 1576052 was NOT PRESENT in page-1 mappingCoverage
provider_fixture_id 1576053 was NOT PRESENT in page-1 mappingCoverage
filtered /odds/mapping request parameters are not confirmed
page 2+ remains blocked
full mapping crawl remains blocked
```

Confirmed safety outcome:

```txt
no provider call was made for this pause record
no /odds/mapping rerun was made
no page 2 fetch was made
no odds values endpoint was called
no fixture-specific odds endpoint was called
no writes occurred
no betting signal surfaced
```

## Status Record

Record:

```txt
M1.3 Mapping Pagination Strategy — DONE
M1.3 Canonical-Fixture-First Page-1 Check — DONE / NOT FOUND
M1.3 Filtered Mapping Support Evidence — DONE / FILTERED RUNTIME BLOCKED
M1.3 Mapping Exploration — PAUSED
/odds/mapping page 2+ — BLOCKED
full mapping crawl — BLOCKED
filtered /odds/mapping runtime — NOT APPROVED
odds writes — NOT STARTED
Scout/Analyst/UI odds usage — NOT STARTED
betting signals — NOT STARTED
```

## Decision

Pause M1.3 mapping exploration for now.

The current evidence does not justify:

- fetching `/odds/mapping` page 2
- crawling pages 2-11
- calling unconfirmed filtered `/odds/mapping` request shapes
- writing odds
- storing mapping data
- using odds or mapping data in Scout, Analyst, UI, Place Bet, or betting signals

This is not an integration failure. It is a controlled stop at the current evidence boundary.

## Next Unblock

Mapping exploration can resume only after one of these is accepted:

1. Stronger sanitized provider docs/account evidence confirms that `/odds/mapping` supports useful filters, such as `fixture`, `league`/`season`, `date`, `bookmaker`, `bet`, or another narrowing parameter.
2. A separate CPO-approved full-crawl budget strategy explicitly approves page 2+ calls.

No runtime call is approved before one of those exists.

## FP-001 Guardrail

Mapping pause or mapping availability does not unlock:

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

## Handoff

Current handoff state:

```txt
M1.3 Mapping Exploration — PAUSED
next action — provider evidence or explicit full-crawl budget strategy
runtime calls — blocked
page 2+ — blocked
odds writes — blocked
Scout/Analyst/UI usage — blocked
FP-001 — active
```

Related references:

- `docs/sports-odds-mapping-pagination-strategy-m1-3.md`
- `docs/sports-odds-canonical-fixture-first-mapping-scope-m1-3.md`
- `docs/sports-odds-canonical-fixture-first-mapping-page1-result-m1-3.md`
- `docs/sports-odds-filtered-mapping-support-evidence-m1-3.md`
