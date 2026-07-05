# M1.3 Odds Snapshot Sync Design

Status: design only / implementation not started

Last updated: 2026-07-05

## Scope

M1.3 designs a controlled odds snapshot pipeline. It does not implement the pipeline.

This design covers:

- provider selection for odds v1
- supported sport and market scope
- bookmaker scope
- manual pull cadence and future cadence limits
- provider quota protection
- provider cost model
- storage growth controls
- append-only snapshot behavior
- raw provider payload handling
- market normalization dependencies
- safety gates before first odds write
- validation plan
- explicit non-use in user-facing Analyst until verified

Out of scope for PR #79:

- runtime code
- database migrations
- provider calls
- odds writes
- cron
- Scout changes
- Analyst changes
- user-facing UI changes
- results, settlement, SportMonks enrichment, or cross-provider mapping

## Design Goals

Odds snapshots should become a reliable data foundation without creating provider cost spikes, storage bloat, noisy duplicate data, or premature betting signals.

The first implementation after this design should prove only this:

```txt
known canonical fixture -> provider odds fetch -> normalized snapshot report -> controlled append-only write
```

It must not prove this yet:

```txt
odds snapshots -> model probability -> edge -> user-facing betting recommendation
```

## Provider V1

Provider v1 should be:

```txt
api_football
```

Reason:

- M1.2.c validated controlled fixture writes for `api_football`.
- `fixture_provider_links` now has exact API-Football provider IDs for the first controlled scope.
- Starting with the same provider reduces mapping uncertainty.
- API-Tennis odds should wait for a separate tennis-specific design because tennis market structure, live status, and set/game markets have different risk.

Non-goals for v1:

- do not combine API-Football and API-Tennis odds in one run
- do not use SportMonks odds or enrichment
- do not compare providers
- do not create cross-provider odds mapping

## Sport And Market Scope

Sport v1:

```txt
football only
```

Market v1 should start with one market:

```txt
match_winner / 1X2
```

Candidate markets for later expansion:

- totals, starting with full-match over/under 2.5
- both teams to score
- Asian handicap

These later markets require explicit market catalog mapping before downstream use. They should not be included in the first controlled odds write unless the implementation PR explicitly narrows and validates them.

## Bookmaker Scope

The first implementation must use a bookmaker allowlist.

Initial cap:

```txt
max bookmakers per market: 3
```

The implementation PR must record:

- provider bookmaker ID
- provider bookmaker display name
- internal bookmaker code, if available
- whether the bookmaker is allowed for snapshot writes

If bookmaker IDs are unavailable or unstable, the first implementation must stop at dry-run reporting and must not write odds snapshots.

## Pull Cadence

M1.3 v1 starts manual-only:

```txt
cron: disabled
manual operator run: allowed after dry-run validation
```

No live odds polling in v1.

Future cadence must be accepted separately. Candidate future cadence:

- pre-match fixtures only
- at most 1 to 3 snapshots per fixture per day
- no polling in the final 15 minutes before kickoff until live/late-line semantics are designed
- no in-play/live odds ingestion until a separate live-odds design exists

## Provider Quota Protection

Every odds sync request must estimate cost before provider fetches and before writes.

Required caps for the first implementation:

```txt
max providers per run: 1
max fixtures per run: 10
max markets per fixture: 1
max bookmakers per market: 3
max snapshots per fixture per day: 3
```

The implementation should return a sanitized 400 before provider calls or writes when the requested scope exceeds configured caps.

The run report should include:

- requested provider count
- requested fixture count
- requested market count
- requested bookmaker count
- estimated provider request count, if known
- whether quota caps allowed the run
- sanitized provider fetch counts
- write counters

The run report must not include:

- provider tokens
- secret query parameters
- raw provider response payloads

## Provider Cost Model

The implementation PR must document the exact API-Football odds endpoint cost before any provider call is run in production.

Until the endpoint cost is confirmed from the provider plan, BetTracker should use the conservative estimate:

```txt
estimated_provider_requests = fixtures * markets
```

If the provider endpoint requires bookmaker-specific calls, the estimate becomes:

```txt
estimated_provider_requests = fixtures * markets * bookmakers
```

The run must stop before provider calls when:

- estimated requests exceed the configured per-run cap
- estimated requests exceed the remaining daily operator budget
- the provider plan cost is unknown
- the endpoint would require live odds polling

The first implementation should include these configurable limits:

```txt
max estimated provider requests per run: 10
max estimated provider requests per day: 30
```

These are starting safety limits for validation, not product-scale ingestion limits.

## Storage Growth Model

The first implementation must include a storage estimate before writes.

Required estimate fields:

- fixtures per run
- markets per fixture
- bookmakers per market
- selections per market
- snapshots per fixture per day
- projected rows per day
- projected rows per 30 days
- projected rows per 180 days

Baseline v1 estimate:

```txt
10 fixtures * 1 market * 3 bookmakers * 3 selections * 3 snapshots/day = 270 rows/day
270 rows/day * 30 days = 8,100 rows
270 rows/day * 180 days = 48,600 rows
```

If the chosen provider returns odds in a shape where a row represents the market instead of the selection, the implementation PR must adjust this estimate before write approval.

## Append-Only Snapshot Behavior

Odds snapshots should be append-only by default.

Do:

- insert a new snapshot when price, line, market status, bookmaker, fixture, or snapshot bucket changes
- preserve provider timestamp when available
- record BetTracker ingestion timestamp
- record sync run ID
- record canonical fixture ID
- record provider fixture link ID when available

Do not:

- overwrite old prices
- delete old snapshots during normal sync
- collapse line movement into a single mutable current value
- expose unverified line movement to Analyst

Idempotency for a repeated controlled run should prevent exact duplicate snapshots for the same:

```txt
provider + provider_fixture_id + bookmaker + market + selection + line + odds + provider_timestamp_or_snapshot_bucket
```

The exact uniqueness strategy belongs in the implementation PR and must be validated before writes.

## Raw Provider Payload Handling

Raw odds payloads are sensitive operational data.

Rules:

- raw provider payloads must not be returned from public or admin API responses
- raw provider payloads must not be logged
- provider URLs must be sanitized before reporting errors
- provider tokens and secret query parameters must never appear in run reports
- if raw payload retention is implemented later, it must be service-role only and excluded from user-facing APIs

Proposed retention:

```txt
raw payload retention: 30 days maximum
normalized snapshot retention: 180 days initially
```

Retention jobs are not part of PR #79 and should not be implemented until a separate retention milestone.

## Market Catalog Dependency

Odds are not safe for downstream use until markets are normalized.

Required dependency before user-facing consumption:

```txt
market_catalog
```

The market catalog must define:

- canonical market code
- provider market ID or provider market name
- sport code
- period scope, such as full_match
- line semantics, such as total goals 2.5
- selection semantics, such as home/draw/away or over/under
- supported bookmaker/provider combinations
- status: mapped, experimental, blocked

First implementation may write only mapped markets. Unmapped markets must be blocked or reported in dry-run only.

## Safety Gates Before First Odds Write

The first odds write must require all gates:

1. separate odds write env flag is enabled, for example `SPORTS_ODDS_SYNC_WRITE_ENABLED=true`
2. operator token is valid
3. request has `dryRun=false`
4. request has an explicit odds operator confirmation string
5. exactly one provider
6. known canonical fixture IDs only
7. fixture count within cap
8. market count within cap
9. bookmaker count within cap
10. daily snapshot cap not exceeded
11. market catalog mapping exists and is allowed
12. dry-run for the exact scope passed first

The fixture write flag must not be reused for odds writes:

```txt
SPORTS_FIXTURE_SYNC_WRITE_ENABLED
```

remains fixture-only and absent/off by default.

## Validation Plan

The first implementation PR after this design must include tests for:

- dry-run returns sanitized odds counts with no writes
- write attempt is blocked when the odds write flag is absent
- multi-provider odds write attempt is blocked
- fixture count above cap is blocked before provider writes
- market count above cap is blocked
- bookmaker count above cap is blocked
- unmapped market is blocked from write
- daily snapshot cap is enforced
- cap overflow writes nothing
- raw provider payload is not returned
- provider token and secret query params are not surfaced
- exact repeated write does not create duplicates

Runtime validation order:

1. production dry-run against known `api_football` canonical fixture IDs
2. confirm estimated rows and provider request count are within cap
3. enable the separate odds write flag temporarily
4. redeploy production
5. run exact same dry-run with `writeEnabled=true`
6. run one controlled write
7. verify odds snapshot rows
8. repeat same write for idempotency
9. remove odds write flag immediately
10. redeploy production
11. confirm final dry-run has `writeEnabled=false`

## Analyst And Scout Non-Use Rule

Odds snapshots must not affect user-facing decisions until a later trust validation milestone.

Blocked uses:

- Model probability
- Implied probability
- Edge
- EV
- recommendation labels
- Place Bet visibility
- Scout opportunity scoring
- line movement claims
- risk labels based on provider odds

Allowed before validation:

- admin-only run reports
- internal storage verification
- documentation of provider coverage

This keeps the Analysis Quality Gate intact:

```txt
No verified model inputs -> no model probability
No valid model probability -> no edge
Unverified odds snapshots -> no betting signal
```

## Open Questions For CPO Approval

Before implementation, CPO must approve:

- exact API-Football odds endpoint and quota cost
- bookmaker allowlist
- whether market v1 is only 1X2 or also includes totals
- max fixtures per run
- max snapshots per fixture/day
- normalized snapshot retention
- raw payload retention, if any
- exact odds write confirmation string
- exact implementation milestone name after PR #79

## Current Production State

At the time of this design:

- M1.2.c Fixture Write Safety Guard: DONE
- M1.2.c Controlled Fixture Write Validation: DONE
- `SPORTS_FIXTURE_SYNC_WRITE_ENABLED`: absent/off
- fixture write mode: not currently enabled
- odds ingestion: not started
- provider odds calls: not run
- M1.3 implementation: not started
