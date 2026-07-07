# M1.2.e Football Enrichment Endpoint Evidence

Status: DOCS / EVIDENCE ONLY / RUNTIME BLOCKED

Last updated: 2026-07-07

## Scope

This document records sanitized endpoint evidence for future M1.2.e football enrichment planning.

This is documentation/status evidence only:

- no runtime code
- no migrations
- no provider calls
- no Supabase writes
- no env flags
- no Scout, Analyst, or UI changes
- no probability, implied probability, edge, EV, recommendation, Place Bet, or betting signal

Check against FP-001 before any future enrichment, Scout, Analyst, or UI work.

## Evidence Sources

Evidence was collected from official provider documentation pages and existing BetTracker docs/schema notes only.

No provider API endpoint was called.
No account token, API key, raw payload, or account details were copied into this repository.

| Provider | Evidence status |
| --- | --- |
| SportMonks | Official docs are readable from Codex runtime and provide endpoint paths, response summaries, auth shape, pagination notes, and include options for several football enrichment candidates. |
| API-Football / API-Sports | Official docs page was reachable as a URL but not extractable in Codex runtime for enrichment endpoint evidence. API-Football remains a candidate, but enrichment endpoint path/request/cost evidence is not confirmed in this PR. |
| Other licensed provider | Not investigated. Requires explicit CPO approval before evidence collection. |

Source references used:

- SportMonks Fixture by ID: `https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures/get-fixture-by-id`
- SportMonks Latest Updated Fixtures: `https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures/get-latest-updated-fixtures`
- SportMonks Inplay Livescores: `https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/livescores/get-inplay-livescores`
- SportMonks Expected Lineup by Team: `https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/premium-expected-lineups/get-expected-lineup-by-team`
- SportMonks Pre-Match News: `https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/news/get-pre-match-news`
- SportMonks Sidelined entity evidence: `https://docs.sportmonks.com/v3/endpoints-and-entities/entities/team-player-squad-coach-and-referee`
- API-Football docs checked but not extractable in Codex runtime: `https://www.api-football.com/documentation-v3`

## Required Evidence Matrix

| Gap | Best confirmed evidence in this PR | Status |
| --- | --- | --- |
| Injuries / suspensions | SportMonks fixture includes `sidelined`; SportMonks sidelined entity documents player/team/season/start/end/category fields. | Confirmed as documentation evidence; plan/cost/freshness unknown. |
| Lineups / starting elevens | SportMonks fixture-by-ID supports `lineups` include; Premium Expected Lineups endpoint exists by team. | Confirmed as documentation evidence; expected-lineups plan availability unknown. |
| Team news | SportMonks pre-match news endpoints exist and return fixture-linked news summaries within subscription. | Confirmed as documentation evidence; broad endpoint scope and plan availability require separate scope. |
| Event-state freshness / fixture status updates | SportMonks fixture-by-ID returns fixture state fields and has a no-pagination fixture-scoped request; latest-updated fixtures and inplay livescores exist but are broader. | Confirmed as documentation evidence; runtime freshness semantics and plan limits unknown. |
| Recent form inputs | No dedicated recent-form endpoint is approved here. SportMonks fixture/statistics/trends includes may contribute later if licensed and scoped. | Blocked pending endpoint evidence and model-input design. |

## Candidate Endpoint Evidence

### SportMonks Fixture By ID

| Field | Evidence |
| --- | --- |
| Provider | SportMonks |
| Endpoint path | `GET https://api.sportmonks.com/v3/football/fixtures/{ID}` |
| Auth method | `api_token` query parameter shown in provider docs. Secrets must never be written to docs, logs, or client responses. |
| Request parameters | Required path `ID`; optional `include`, `select`, `sortBy`, `filters`, `locale`. |
| Response shape summary | Fixture object with fields such as `id`, `sport_id`, `league_id`, `season_id`, `stage_id`, `state_id`, `name`, `starting_at`, `result_info`, `length`, `has_odds`, `has_premium_odds`, and `starting_at_timestamp`. |
| Enrichment includes relevant to M1.2.e | `state`, `weatherReport`, `lineups`, `events` / `timeline`, `statistics`, `periods`, `participants`, `prematchNews`, `postmatchNews`, `metadata`, `sidelined`, `formations`, `scores`, `xGFixture`, `pressure`, `expectedLineups`, `matchfacts`. |
| Pagination | `NO` in provider docs for fixture-by-ID. |
| Endpoint phase | Mixed: pre-match, live, and post-match depending on fixture state and includes. |
| Scoping | Exact fixture ID. |
| Future read-only dry-run support | Yes, if BetTracker has an exact/high SportMonks provider link for one canonical football fixture and CPO approves one request. |
| Quota/request cost | Unknown from sanitized docs. Requires account/plan evidence before runtime. |
| Rate limits | Unknown from sanitized docs. Requires account/plan evidence before runtime. |
| Plan availability | Unknown for specific includes. Requires account/plan evidence before runtime. |
| Freshness/update semantics | Fixture state fields are present, but source timestamp and stale-after semantics require runtime evidence and local trust rules. |
| Remaining unknowns | Plan access for selected includes, source timestamps, payload size, include-specific response shapes, request cost, and rate limits. |

This is the preferred first endpoint family for a future read-only enrichment dry-run because it is fixture-scoped and has no pagination according to provider docs. It is not approved for runtime by this PR.

### SportMonks Latest Updated Fixtures

| Field | Evidence |
| --- | --- |
| Provider | SportMonks |
| Endpoint path | `GET https://api.sportmonks.com/v3/football/fixtures/latest` |
| Auth method | `api_token` query parameter shown in provider docs. |
| Request parameters | Optional `include`, `select`, `sortBy`, `filters`, `locale` per endpoint docs. |
| Response shape summary | Fixture rows with fixture identifiers, league/season/stage/state fields, `starting_at`, `result_info`, `has_odds`, and `starting_at_timestamp`. |
| Endpoint phase | Mixed; updates can apply to different fixture states. |
| Scoping | Broad latest-updated feed. |
| Future read-only dry-run support | Blocked for first enrichment dry-run because it is broader than a single fixture and needs request budget and report-shape approval. |
| Quota/request cost | Unknown. Requires account/plan evidence. |
| Rate limits | Unknown. Requires account/plan evidence. |
| Plan availability | Unknown. Requires account/plan evidence. |
| Freshness/update semantics | Docs describe recently updated fixtures, but BetTracker still needs source timestamp, collected_at, stale-after, and state transition rules before use. |
| Remaining unknowns | Exact page/pagination behavior, request volume, source timestamp semantics, and data fields for selected includes. |

### SportMonks Inplay Livescores

| Field | Evidence |
| --- | --- |
| Provider | SportMonks |
| Endpoint path | `GET https://api.sportmonks.com/v3/football/livescores/inplay` |
| Auth method | `api_token` query parameter shown in provider docs. |
| Request parameters | Endpoint docs provide the inplay endpoint; any include/filter budget requires separate evidence. |
| Response shape summary | Inplay fixture data with fields such as `id`, `sport_id`, `league_id`, `season_id`, `stage_id`, `state_id`, `name`, `starting_at`, `result_info`, and `starting_at_timestamp`. |
| Endpoint phase | Live / inplay. |
| Scoping | Broad live feed, not single known canonical fixture by default. |
| Future read-only dry-run support | Blocked until separate live-state scope and request budget are approved. |
| Quota/request cost | Unknown. Requires account/plan evidence. |
| Rate limits | Unknown. Requires account/plan evidence. |
| Plan availability | Unknown. Requires account/plan evidence. |
| Freshness/update semantics | Candidate for live event-state freshness, but no local stale-after or trust rule is approved. |
| Remaining unknowns | Scope filters, plan access, exact freshness semantics, request budget, and sanitized report shape. |

### SportMonks Expected Lineup By Team

| Field | Evidence |
| --- | --- |
| Provider | SportMonks |
| Endpoint path | `GET https://api.sportmonks.com/v3/football/expected-lineups/teams/TEAM_ID` |
| Auth method | `api_token` query parameter shown in provider docs. |
| Request parameters | Required team ID; optional parameters require separate endpoint evidence. |
| Response shape summary | Expected lineup rows include `fixture_id`, `player_id`, `team_id`, `formation_field`, `position_id`, `detailed_position_id`, `type_id`, `player_name`, and `jersey_number`. |
| Endpoint phase | Pre-match expected lineup, pending provider freshness. |
| Scoping | Team-scoped, not fixture-scoped. |
| Future read-only dry-run support | Blocked for first dry-run unless a team-scoped budget and fixture relevance check are approved. |
| Quota/request cost | Unknown. Requires account/plan evidence. |
| Rate limits | Unknown. Requires account/plan evidence. |
| Plan availability | Premium endpoint; current plan access unknown. |
| Freshness/update semantics | Expected lineups can stale quickly; source timestamp and confirmed-vs-expected distinction remain unknown. |
| Remaining unknowns | Plan access, request budget, team ID selection, fixture relevance, source timestamps, and whether confirmed starting elevens are available elsewhere. |

### SportMonks Pre-Match News

| Field | Evidence |
| --- | --- |
| Provider | SportMonks |
| Endpoint path | `GET https://api.sportmonks.com/v3/football/news/pre-match` |
| Auth method | `api_token` query parameter shown in provider docs. |
| Request parameters | Provider docs show the endpoint and auth; include/filter behavior needs separate evidence. |
| Response shape summary | News article rows include `id`, `fixture_id`, `league_id`, `title`, and `type`. |
| Endpoint phase | Pre-match. Provider docs state pre-match news is available within subscription and at minimum 48 hours before match start. |
| Scoping | Broad pre-match news, with fixture linkage in response. |
| Future read-only dry-run support | Blocked for first dry-run because scope is broad and plan access/request budget are unknown. |
| Quota/request cost | Unknown. Requires account/plan evidence. |
| Rate limits | Unknown. Requires account/plan evidence. |
| Plan availability | Subscription-limited; current plan access unknown. |
| Freshness/update semantics | News availability window is documented, but source timestamp and stale-after behavior are not validated. |
| Remaining unknowns | Request filters, plan access, cost, pagination, language/localization, source timestamp, and sanitized report shape. |

### SportMonks Pre-Match News For Upcoming Fixtures

| Field | Evidence |
| --- | --- |
| Provider | SportMonks |
| Endpoint path | `GET https://api.sportmonks.com/v3/football/news/pre-match/upcoming` |
| Auth method | `api_token` query parameter shown in provider docs. |
| Request parameters | Provider docs show the endpoint and auth; include/filter behavior needs separate evidence. |
| Response shape summary | News article rows include fixture and league references plus title/type fields. |
| Endpoint phase | Pre-match upcoming fixtures. |
| Scoping | Broad upcoming fixture news. |
| Future read-only dry-run support | Blocked for first dry-run because it is not restricted to one canonical fixture by default. |
| Quota/request cost | Unknown. Requires account/plan evidence. |
| Rate limits | Unknown. Requires account/plan evidence. |
| Plan availability | Subscription-limited; current plan access unknown. |
| Freshness/update semantics | News availability window is documented, but source timestamp and stale-after behavior remain unknown. |
| Remaining unknowns | Request filters, plan access, cost, pagination, language/localization, source timestamp, and sanitized report shape. |

### SportMonks Sidelined Entity / Include

| Field | Evidence |
| --- | --- |
| Provider | SportMonks |
| Endpoint path | No standalone runtime endpoint is approved here. Evidence confirms a `sidelined` entity and `sidelined` include options. |
| Auth method | Same SportMonks token model as endpoint pages. |
| Request parameters | Depends on endpoint using the include, such as fixture-by-ID with `include=sidelined`. |
| Response shape summary | Sidelined fields include `id`, `player_id`, `type_id`, `category`, `team_id`, `season_id`, `start_date`, `end_date`, `games_missed`, and `completed`. |
| Endpoint phase | Mixed; injury/suspension records may be active or historical. |
| Scoping | Best future candidate is fixture-scoped through fixture-by-ID includes if plan supports it. |
| Future read-only dry-run support | Possible as part of fixture-by-ID include scope after CPO approval. |
| Quota/request cost | Unknown. Requires account/plan evidence. |
| Rate limits | Unknown. Requires account/plan evidence. |
| Plan availability | Unknown. Requires account/plan evidence. |
| Freshness/update semantics | Requires source timestamp/freshness validation before trust use. |
| Remaining unknowns | Include availability, active vs historical distinction, player/team mapping, source timestamp, and storage shape. |

### API-Football / API-Sports Enrichment Candidates

| Field | Evidence |
| --- | --- |
| Provider | API-Football / API-Sports |
| Endpoint path | Not confirmed for M1.2.e enrichment in this PR. Official docs page was not extractable in Codex runtime. |
| Auth method | API-Sports key header is known from prior approved odds evidence, but no enrichment endpoint call or endpoint-specific auth evidence is recorded here. |
| Request parameters | Not confirmed. |
| Response shape summary | Not confirmed. |
| Candidate coverage | Potentially injuries, lineups, fixture status, team/statistics/recent-form data if available on the current plan. |
| Endpoint phase | Not confirmed. |
| Scoping | Not confirmed. |
| Future read-only dry-run support | Blocked until operator-side sanitized docs/account evidence confirms endpoint path, request shape, cost, rate limits, plan availability, and response shape. |
| Quota/request cost | Not confirmed. |
| Rate limits | Not confirmed. |
| Plan availability | Not confirmed. |
| Freshness/update semantics | Not confirmed. |
| Remaining unknowns | All endpoint-specific enrichment evidence. |

## Decisions

### First Endpoint Family For Future Read-Only Dry-Run

Preferred candidate:

```txt
SportMonks fixture-by-ID enrichment dry-run
GET /v3/football/fixtures/{ID}
```

Rationale:

- exact fixture scope
- provider docs say pagination is `NO`
- fixture state fields are present
- relevant includes exist for `state`, `lineups`, `sidelined`, `prematchNews`, `metadata`, `scores`, `xGFixture`, `pressure`, and `matchfacts`
- matches the existing `football_enrichment` table's SportMonks-linked design better than a broad feed

This preference does not approve runtime. Future runtime requires a separate scope with:

- selected canonical fixture
- exact/high SportMonks provider link
- exact include set
- max provider requests
- operator confirmation
- sanitized report shape
- no writes

### Endpoints Remaining Blocked

Blocked until separate evidence/scope:

- API-Football enrichment endpoints, because endpoint shape/cost/plan evidence is not confirmed here
- SportMonks Latest Updated Fixtures, because it is broad
- SportMonks Inplay Livescores, because it is broad/live and needs stronger freshness rules
- SportMonks Expected Lineup by Team, because it is team-scoped and premium plan access is unknown
- SportMonks broad pre-match news endpoints, because scope, filters, pagination, and plan access need separate approval
- any prediction/value/advice endpoint, because it is betting-signal adjacent and conflicts with FP-001 trust boundaries unless separately designed

### Preferred Provider For First Enrichment Dry-Run

Preferred provider for the first future read-only enrichment dry-run:

```txt
SportMonks
```

Condition:

```txt
Only if BetTracker has an exact/high SportMonks provider link for the selected canonical fixture.
```

If no suitable SportMonks provider link exists, the future dry-run remains blocked or must first add a separate mapping/evidence milestone.

### Safest Initial Scope

Recommended future scope, not approved by this PR:

```txt
one canonical football fixture
one exact/high SportMonks provider_fixture_id
GET /v3/football/fixtures/{ID}
max provider requests: 1
no pagination
selected includes only
sanitized report only
no raw payload
no writes
no Scout/Analyst/UI
```

The include list should be approved separately. A minimal first include set should prioritize technical coverage and freshness validation over breadth.

### Must Remain Non-User-Facing

All M1.2.e endpoint evidence and future dry-run results remain non-user-facing until separate trust validation.

Not approved:

- Scout score
- Analyst probability
- implied probability
- edge
- EV
- recommendation
- Place Bet
- UI actionability
- betting signal

## Trust Rules

Endpoint availability does not unlock model probability.
Injuries, suspensions, lineups, team news, event-state fields, xG, pressure, match facts, and recent form facts do not become recommendations by themselves.
Missing or stale enrichment keeps Analyst gated.

Provider-backed enrichment can only become useful after:

1. endpoint evidence
2. read-only dry-run
3. schema/write design
4. controlled write validation
5. trust validation
6. Analyst-layer input contract and model validation

Data purchase is not model validation.

## Current Status

```txt
M1.2.e Football Enrichment Design - DONE
M1.2.e Football Enrichment Endpoint Evidence - DONE
M1.2.e.2 SportMonks Canonical Fixture Mapping Scope - IN REVIEW
M1.2.e canonical-linked read-only dry-run - BLOCKED ON EXACT/HIGH SPORTMONKS PROVIDER LINK
M1.2.e shape-only/unbound dry-run - NOT APPROVED
M1.2.e schema/write design - NOT STARTED
M1.2.e controlled write validation - NOT STARTED
M1.2.e trust validation - NOT STARTED
football enrichment provider calls - NOT RUN
football enrichment writes - NOT STARTED
Scout/Analyst/UI enrichment usage - NOT STARTED
betting signals - NOT STARTED
```

Canonical-linked enrichment prerequisite:

```txt
Production DB verified:
fixture_provider_links contains 2 api_football/exact rows and 0 sportmonks rows.

No exact/high SportMonks provider link exists for canonical fixture 1576052.
No SportMonks link -> no canonical enrichment.
No canonical enrichment -> no write.
No write -> no Analyst/Scout/UI.
```

A SHAPE-ONLY / UNBOUND SportMonks dry-run may validate response shape with a native SportMonks fixture ID, but it cannot write, attach to a canonical fixture, unlock enrichment writes, or unlock Scout/Analyst/UI. A CANONICAL-LINKED enrichment dry-run requires M1.2.e.2 mapping evidence and an exact/high SportMonks provider link.
