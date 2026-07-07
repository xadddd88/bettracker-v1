# M1.2.e Football Enrichment Design

Status: DESIGN ONLY / IMPLEMENTATION NOT STARTED

Last updated: 2026-07-06

## Scope

This document designs M1.2.e football enrichment before any implementation.

This is documentation/design only:

- no runtime code
- no migrations
- no provider calls
- no Supabase writes
- no env flags
- no Scout, Analyst, or UI changes
- no probability, implied probability, edge, EV, recommendation, Place Bet, or betting signal

Check against FP-001 before any future enrichment, Scout, Analyst, or UI work.

## Context

M1.3 mapping exploration is paused. The current M1.3 state does not block football enrichment design, but it also does not authorize odds writes, mapping crawls, Scout usage, Analyst usage, or betting signals.

FP-001 identifies several missing football-specific data gaps from the legacy false-precision analysis:

- live injuries
- team news
- recent form updates
- current line movement
- sport-specific model support
- verified per-leg model inputs

M1.2.e covers the football enrichment design track only. It does not close FP-001 by itself.

## In-Scope Football Enrichment Gaps

M1.2.e may eventually cover these football enrichment gaps if licensed provider evidence supports them:

```txt
injuries / suspensions
lineups / starting elevens
team news
event-state freshness
recent form inputs, if provider-backed and licensed
```

Out of scope for this design:

- odds snapshots
- line movement writes
- Scout ranking
- Analyst pricing
- model probability
- edge / EV
- Place Bet unlock
- betting signals
- tennis enrichment

## Provider Candidates

Allowed candidates are already paid/licensed or already selected providers only:

| Provider | Candidate use | Evidence status |
| --- | --- | --- |
| API-Football / API-Sports | Broad football fixture status, event state, lineups, injuries/sidelined data, recent form if covered by licensed endpoints | Endpoint evidence required before any call |
| SportMonks | Deep football enrichment for mapped fixtures: xG, pressure/momentum, predictions, match facts, lineups or injuries if available on paid plan | Endpoint evidence required before any call |
| Other paid/licensed provider already accepted by CPO | Only if explicitly approved and licensed for commercial use | Separate provider evidence required |

Not allowed:

- scraping
- unlicensed sites
- user-provided third-party context as provider truth
- social/media context as structured truth without a separate legal/source policy

## Required Endpoint Evidence Before Any Provider Call

Before any production provider call, the next evidence PR must document:

```txt
endpoint path
HTTP method
auth method
request parameters
response shape
quota/request cost
rate limits
freshness/update semantics
whether data is pre-match, live, post-match, or mixed
whether source timestamps are included
whether endpoint supports fixture-specific requests
whether endpoint supports league/date/team filters
whether endpoint is available on the current plan
```

If endpoint path, request shape, cost, or plan availability are unknown, provider calls remain blocked.

## Canonical Storage Target

Existing schema evidence:

- migration `013_sports_data_foundation.sql` created `football_enrichment`
- migration `014_sports_data_foundation_cleanup.sql` tightened `football_enrichment` link validation and indexes
- current `football_enrichment` is SportMonks-linked and service-role-only
- current table is latest-state per `canonical_fixture_id`, not append-only history
- current table includes `xg_home`, `xg_away`, `predictions`, `match_facts`, `momentum`, `raw_provider_payload`, `provider_updated_at`, `ingested_at`, and `sync_run_id`
- current write gate requires a SportMonks provider link with exact/high mapping confidence

Design implication:

```txt
Do not assume the current football_enrichment table is sufficient for injuries, suspensions, lineups, team news, event-state freshness, or recent form.
```

Before any write design, M1.2.e needs a schema review that decides whether to:

1. reuse `football_enrichment` for provider-specific deep enrichment only
2. add separate payload-free curated enrichment tables or views
3. add append-only enrichment snapshots for changing data
4. keep raw provider payload service-role-only and expose only sanitized derived fields

No migration is added by this PR.

## Data Freshness Model

Every future enrichment record must distinguish:

```txt
source timestamp: when the provider says the data was updated
collected_at: when BetTracker fetched the data
stale_after: when BetTracker must stop treating the data as current
fixture state: pre-match, live, paused, finished, postponed, cancelled, unknown
```

Initial design rules:

- pre-match injuries and lineups can stale quickly and must have short freshness windows
- confirmed lineups have different freshness semantics than expected lineups
- live event state must not be inferred from stale pre-match enrichment
- missing source timestamps reduce trust and may require shorter stale-after rules
- stale enrichment must keep Analyst gated
- outdated enrichment must never become a recommendation or Place Bet unlock

## Trust Rules

Football enrichment availability does not unlock model probability by itself.

Trust rules:

- injuries do not become recommendations
- suspensions do not become recommendations
- lineups do not become recommendations
- team news does not become recommendations
- recent form does not become value without validated model use
- missing enrichment keeps Analyst gated
- partial enrichment must produce a missing-data checklist, not false precision
- provider-backed enrichment is a fact layer, not a betting signal layer

## Safety Gates

Future M1.2.e implementation must use the same safety discipline as fixture and odds work:

```txt
endpoint evidence first
read-only dry-run first
sanitized report only
no raw provider payload in responses, logs, docs, or UI
separate write flag from fixture and odds flags
explicit operator confirmation for any future write
small controlled write validation later
idempotency validation later
write flag removed/off immediately after controlled validation
trust validation before any downstream use
```

The future write flag must not reuse:

```txt
SPORTS_FIXTURE_SYNC_WRITE_ENABLED
SPORTS_ODDS_SYNC_WRITE_ENABLED
```

Candidate future flag name, pending approval:

```txt
SPORTS_FOOTBALL_ENRICHMENT_WRITE_ENABLED
```

Candidate future operator confirmation, pending approval:

```txt
WRITE_FOOTBALL_ENRICHMENT_M1_2_E
```

These are design candidates only. They are not added or enabled by this PR.

## Explicit Non-Use

Until a later trust validation PR is accepted, football enrichment must not be used for:

- Scout score
- Analyst probability
- implied probability
- edge
- EV
- recommendation
- Place Bet
- UI actionability
- betting signal

The first enrichment milestones may produce only sanitized technical reports and internal validation records.

## Relationship To FP-001

M1.2.e can eventually help close these FP-001 provider-layer gaps for football:

| FP-001 requirement | M1.2.e relationship |
| --- | --- |
| live injuries | can be provider-backed if endpoint evidence, freshness, and storage pass |
| team news | can be provider-backed only if licensed structured endpoint exists |
| recent form updates | can be provider-backed if derived from licensed fixtures/results/stats |
| event-state freshness | can be provider-backed if fixture status/live state sync is validated |
| per-leg model inputs | enrichment can contribute facts but cannot define the model contract |

M1.2.e does not close these Analyst-layer requirements by itself:

- sport-specific model support
- calibrated model probability
- implied probability comparison
- edge / EV calculation
- per-leg minimum input contract
- mixed-sport pricing readiness
- tennis pricing readiness

Data purchase is not model validation.

## Milestone Sequencing

Recommended sequence:

1. M1.2.e endpoint evidence PR
   - document endpoint paths, request params, response shapes, cost, limits, freshness/update semantics, and plan availability
   - no provider calls unless separately approved
2. M1.2.e read-only dry-run PR
   - protected admin route/helper
   - explicit operator confirmation
   - exact fixture scope
   - sanitized report only
   - no writes
3. M1.2.e schema/write design PR
   - schema review of existing `football_enrichment`
   - decide whether new tables/views are needed
   - define raw payload handling and curated output
4. M1.2.e controlled write validation PR
   - separate write flag
   - explicit confirmation
   - small fixture cap
   - idempotency check
   - write flag removed/off after validation
5. M1.2.e trust validation PR
   - prove freshness rules, missing-data behavior, and non-use boundaries
   - only then consider Scout/Analyst/UI integration in a separate milestone

## Stop Conditions

Stop before provider calls if:

- endpoint path is unknown
- request shape is unknown
- quota/request cost is unknown
- plan availability is unknown
- freshness/update semantics are unknown
- response shape would require raw payload exposure
- fixture/provider link mapping confidence is not exact/high where enrichment depends on mapped providers
- request budget is not CPO-approved

Stop before writes if:

- schema review is incomplete
- write flag is missing or reused from another domain
- operator confirmation is missing
- raw payload exposure is not contained
- idempotency behavior is not tested

Stop before Scout/Analyst/UI if:

- trust validation is incomplete
- stale-after rules are undefined
- missing enrichment does not gate output
- any probability, edge, EV, recommendation, Place Bet, or betting signal would be inferred from enrichment alone

## Current Status

```txt
M1.2.e Football Enrichment Design — DONE
M1.2.e endpoint evidence — IN REVIEW
M1.2.e read-only dry-run — NOT STARTED
M1.2.e schema/write design — NOT STARTED
M1.2.e controlled write validation — NOT STARTED
M1.2.e trust validation — NOT STARTED
football enrichment provider calls — NOT RUN
football enrichment writes — NOT STARTED
Scout/Analyst/UI enrichment usage — NOT STARTED
betting signals — NOT STARTED
```
