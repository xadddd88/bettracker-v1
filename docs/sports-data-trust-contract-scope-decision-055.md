# Sports Data Trust Contract & Football Enrichment Storage Boundary — Decision #055

## Status

**APPROVED 2026-07-14 — DOCUMENTATION / EVIDENCE ONLY.**

Founder approval: `APPROVE #055`.

This decision does not approve runtime code, provider calls, migrations, Supabase writes, environment changes, enrichment writes, odds ingestion, or downstream product use.

## Objective

Define the trust and storage contract that must exist before SportMonks fixture relationships can be persisted or consumed by BetTracker.

Decision #034 proved one canonical-linked fixture-by-ID request can succeed with a matching identity and a sanitized response. It did not prove that any enrichment family is available, fresh, safe to persist, or eligible for Scout, Analyst, UI, probability, edge, EV, recommendation, Place Bet, or another betting signal.

## Evidence Baseline

### Decision #034 runtime result

The accepted run for canonical fixture `92afd570-399a-48b9-915a-e1ffaf52a71c` and SportMonks fixture `19722203` recorded:

- one provider request, no retry;
- HTTP 200 and fixture identity match;
- empty include set;
- all ten enrichment-family presence flags false;
- `starting_at` and `starting_at_timestamp` present;
- provider `updated_at` absent or invalid;
- `sourceUpdatedAt: null`;
- zero database writes and zero runtime errors;
- all downstream usage blocked.

`collectedAt` is the operator/server wall clock. It is not source freshness.

### Production inventory

Read-only verification on 2026-07-14:

| Table | Rows |
|---|---:|
| `canonical_fixtures` | 3 |
| `fixture_provider_links` | 4 |
| `football_enrichment` | 0 |
| `fixture_results` | 0 |
| `odds_snapshots` | 0 |

### Provider capability evidence

The official SportMonks Fixture-by-ID documentation exposes a broad include surface on one endpoint, including structural entities, event data, provider-derived analytics, news, odds, and predictions:

- <https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures/get-fixture-by-id>
- <https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes>

Availability in an API response does not establish BetTracker trust, freshness, storage fitness, licensing/retention fitness, or downstream eligibility.

### Current schema boundary

The current `football_enrichment` table contains `xg_home`, `xg_away`, `predictions`, `match_facts`, `momentum`, provenance/freshness columns, and a raw-provider-payload column. It is not a canonical home for teams, leagues, seasons, rounds, venues, lineups, events, scores, or odds.

No generic provider response may be written into `football_enrichment` merely because the table exists.

## Trust Classes

### Class A — identity and relatively stable structure

Candidate relationships:

- `participants`
- `league`
- `season`
- `round`
- `venue`
- `state`

Rules:

- exact/high canonical-provider mapping is required;
- provider IDs must be bounded and validated;
- canonical ownership must be explicit;
- names, logos, countries, and other attributes require an allowlisted normalized contract;
- Class A is identity/context evidence, not a betting signal;
- Class A does not belong in a generic `football_enrichment` JSON blob.

### Class B — dynamic event context

#### B1 observed/event facts

Candidate relationships:

- `scores`
- `periods`
- `events`
- `lineups`
- `sidelined`
- `weatherReport`
- `statistics`

#### B2 provider-derived analytics

Candidate relationships:

- `xGFixture`
- `pressure`
- `trends`
- `matchfacts`
- `expectedLineups`

Rules for both subclasses:

- every family needs an explicit schema, provenance, freshness definition, and stale-data policy;
- observed facts and provider-derived metrics must remain distinguishable;
- xG, pressure, trends, expected lineups, and match facts are not BetTracker model probability;
- missing source freshness keeps the family internal and blocked;
- snapshots/history versus latest-state semantics must be decided family by family;
- no Class B family may reach Scout, Analyst, UI, settlement, or betting signals under this decision.

### Class C — markets and model/opinion outputs

Relationships include:

- `odds`
- `premiumOdds`
- `inplayOdds`
- `predictions`
- `AIOverviews`

Rules:

- remain HOLD;
- must not be fetched by the first post-#055 structural dry-run;
- must not be stored in `football_enrichment`;
- require separate market normalization, provenance, timestamp, bookmaker/source, licensing, and FP-001 decisions;
- provider predictions or AI overviews can never be relabelled as BetTracker probability, fair odds, edge, EV, recommendation, or confidence.

## Required Record Contract

Before any family becomes write-eligible, its proposed schema must define at least:

- canonical fixture/entity ownership;
- provider and provider entity ID;
- source relationship/family;
- source-updated timestamp or an explicitly reviewed equivalent;
- ingestion timestamp, kept semantically separate from source freshness;
- mapping confidence at write time;
- schema version;
- sync/run identifier;
- validation status and manual-review state;
- allowlisted fields and size bounds;
- update/history semantics;
- retention/licensing posture;
- approved consumers.

Raw provider payload is not a product contract. Any future raw retention requires a separately approved internal-only purpose, strict access controls, bounded size/retention, and a licensing review.

## Promotion Gates

A provider family remains internal/blocked until all applicable gates pass:

1. exact/high canonical linkage;
2. documented response schema and type validation;
3. field-level allowlist and sanitization;
4. source freshness contract and stale threshold;
5. mismatch/ambiguity/manual-review handling;
6. normalized storage ownership;
7. curated payload-free read boundary;
8. production quality verification;
9. explicit consumer approval;
10. FP-001 review.

Passing identity validation alone passes only gate 1.

## Candidate Next Runtime Scope

A later decision may propose a single structural presence dry-run with the exact include set:

```text
participants;league;season;round;venue;state
```

That future scope must still require:

- a new implementation PR and separate CPO runtime authorization;
- exactly one pinned fixture-by-ID request;
- no retries, pagination, fallback, or additional endpoint;
- no nested includes;
- no odds, predictions, AI overviews, lineups, injuries, statistics, events, scores, xG, pressure, trends, weather, or news;
- sanitized presence/count/schema output only;
- no names, logos, descriptions, or raw objects in the operator report;
- zero writes.

Decision #055 does not authorize that request.

## Deliverables and DONE

Decision #055 is DONE when a docs-only PR:

- records this trust classification and storage boundary;
- records the Decision #034 evidence baseline and production row counts;
- reconciles `PROJECT_STATE.md`;
- occupies #055 in the numbering ledger and advances the next unreserved number to #056;
- leaves all runtime, provider, database, and downstream gates unchanged.

## Non-Use

```text
provider calls: 0
runtime code: 0
Supabase writes: 0
migrations: 0
environment changes: 0
football_enrichment writes: 0
fixture_results writes: 0
odds_snapshots writes: 0
Scout / Analyst / UI: HOLD
probability / implied probability / edge / EV / recommendation / Place Bet: HOLD
betting signals: HOLD
CSP Phase B: untouched
Decision #050 SMTP round-trip: remains PENDING
```

## FP-001

Provider presence, identity, observed facts, provider statistics, xG, predictions, odds, and AI overviews do not become BetTracker probability, fair odds, edge, EV, recommendation, confidence, Place Bet, Scout score, Analyst signal, UI signal, or another betting signal without a separate reviewed quality gate and consumer decision.
