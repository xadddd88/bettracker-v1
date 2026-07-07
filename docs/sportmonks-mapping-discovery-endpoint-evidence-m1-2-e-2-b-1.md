# M1.2.e.2.b.1 SportMonks Mapping Discovery Endpoint Evidence Record

## Status

DOCS / EVIDENCE RECORD ONLY / RUNTIME BLOCKED

Last updated: 2026-07-07

## Purpose

Record the official SportMonks Football API v3 documentation evidence required by Decision #038 (`docs/sportmonks-mapping-discovery-endpoint-evidence-scope-m1-2-e-2-b-1.md`) so a later read-only mapping discovery runtime scope (2.5.b.2) can be written against confirmed endpoint facts instead of assumptions.

## Scope Controls

- documentation/evidence record only
- ZERO SportMonks API calls were made while collecting this evidence
- no `api_token` was used, read, or included anywhere
- sources are public documentation and marketing pages only
- no runtime code
- no API route
- no migrations
- no Supabase writes
- no provider-link writes
- no enrichment writes
- no env flags
- no Scout/Analyst/UI usage
- no probability, implied probability, edge, EV, recommendation, Place Bet, or betting signal

FP-001 remains active.

## Method and Sources

Evidence was collected on 2026-07-07 by fetching official SportMonks documentation pages. Every claim below cites its source. Key sources:

- `https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/fixtures` (endpoint family overview)
- `https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/fixtures/get-fixtures-by-date`
- `https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/fixtures/get-fixtures-by-date-range`
- `https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/fixtures/get-fixtures-by-date-range-for-team`
- `https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/livescores-and-fixtures/fixtures` (date format + subscription scoping)
- `https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/introduction/pagination`
- `https://docs.sportmonks.com/v3/welcome/differences-between-api-2-and-api-3/api-changes` (v2→v3 removal of total fields)
- `https://docs.sportmonks.com/v3/api/syntax` (include syntax)
- `https://docs.sportmonks.com/football/api/request-options/filtering`
- `https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/participants` (home/away marker)
- `https://docs.sportmonks.com/v3/welcome/authentication`
- `https://docs.sportmonks.com/football/api/rate-limit`
- `https://docs.sportmonks.com/v3/api/meta-description` (response envelope)
- `https://docs.sportmonks.com/football/endpoints-and-entities/entities/fixture` (fixture entity)
- `https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/introduction/set-your-time-zone`
- `https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/timezone-parameters-on-different-endpoints`
- `https://www.sportmonks.com/football-api/plans-pricing/`
- `https://www.sportmonks.com/football-api/free-plan/`

Note: several older docs paths (e.g. `/football/api/pagination`, `/football/api/authentication`) now redirect or 404; current locations are recorded above.

## Endpoint Family Evidence

### Fixtures by date

```txt
GET https://api.sportmonks.com/v3/football/fixtures/date/{date}
```

- `{date}` format: `YYYY-MM-DD` (documented by tutorial examples, e.g. `date/2022-09-03`)
- returns fixtures for that date **from the account's subscription leagues only** ("all fixtures from your subscription for a given date")
- supports includes (max 3 nested), server-side filters, select, sort/order
- `order` sorts by `starting_at` asc/desc, default asc

### Fixtures between dates

```txt
GET https://api.sportmonks.com/v3/football/fixtures/between/{start_date}/{end_date}
```

- same query parameters, includes, and filters as by-date
- documented maximum date range: **100 days**

### Fixtures between dates for team

```txt
GET https://api.sportmonks.com/v3/football/fixtures/between/{start_date}/{end_date}/{team_id}
```

- requires a **SportMonks** `{team_id}`, which BetTracker does not have before mapping — not usable as the primary discovery path
- no maximum date range documented on this endpoint page

### Ancillary endpoints (recorded, not selected)

- `GET Fixtures by Search by Name` exists in the family; matching semantics (partial match, searched fields, ranking) are not documented on fetched pages — recorded as unknown
- `GET Last Updated Fixtures` exists and is the documented freshness mechanism for fixtures
- in-play fixtures require livescores endpoints (out of scope)

## Request Parameters (documented, identical across the by-date/between family)

```txt
api_token   required (query param; header alternative exists — see Authentication)
include     optional
select      optional
sortBy      optional (supported fields: starting_at, name)
filters     optional
locale      optional
order       optional (asc/desc, default asc)
per_page    optional (default 25, max 50)
page        optional (legacy pagination)
```

## Server-Side Filtering

- syntax: `filters=<filterName>:<comma-separated IDs>`; multiple filters combined with `;`
- **league filter is documented on both by-date and between endpoints**: dynamic filter `fixtureLeagues`, documented example `filters=fixtureLeagues:501,271`
- `fixtureStates` filter documented ("filter the states of fixtures")
- `seasons` is listed among dynamic filter targets on both endpoints; the exact literal filter spelling (e.g. `fixtureSeasons`) was not shown in any fetched example — recorded as unknown
- static filter `participantSearch` exists on these endpoints (team-name search); matching semantics undocumented — recorded as unknown
- each endpoint docs page lists its own supported filters under "Static Filters" / "Dynamic Filters" tabs

## Includes

- syntax separators: `;` separates include chains, `.` nests, `:` selects fields inside an include, `,` separates IDs/fields
- `participants`, `league`, `season`, `state` are all valid includes on by-date and between endpoints
- max 3 nested includes per request on these endpoints
- **home/away marker**: each participant object carries `meta.location` = `home` or `away` (plus `meta.winner`, `meta.position`). Docs explicitly warn not to rely on participants array order
- participant object fields include: `id, sport_id, country_id, venue_id, gender, name, short_code, image_path, founded, type, placeholder, last_played_at`
- includes do NOT cost extra rate-limit units

## Pagination — Critical Guardrail Translation

v3 pagination object (verbatim fields):

```txt
"pagination": { "count", "per_page", "current_page", "next_cursor", "has_more" }
```

- **v3 has NO total / total_pages field.** The api-changes page states v3 "will no longer provide a count and total_pages property in the meta of the response" (v2 fields removed)
- `count` = items on the CURRENT page, not across pages
- `has_more` (boolean) is the documented way to know whether more pages exist
- cursor pagination (`cursor` param + `next_cursor`) is recommended for new integrations; legacy `page` continues to work
- `per_page` range 1–50, default 25

**Consequence for Decision #037's guardrail:** "stop if `paging.total > 1`" has no direct v3 equivalent. The 2.5.b.2 runtime scope must restate the guardrail as:

```txt
request page 1 with per_page=50
stop / flag AMBIGUOUS if pagination.has_more === true
```

## Response Shape

Envelope (documented meta description):

```txt
data          fixture array
subscription  { meta { current_timestamp, next_billing_cycle }, plans, add_ons, widgets, bundles }
rate_limit    { resets_in_seconds, remaining, requested_entity }
timezone      e.g. "UTC"
pagination    (on list endpoints)
```

Fixture object fields shown in the by-date example response:

```txt
id, sport_id, league_id, season_id, stage_id, group_id, aggregate_id, round_id,
state_id, venue_id, name, starting_at, starting_at_timestamp, result_info, leg,
details, length, placeholder, has_odds, has_premium_odds
```

- identity-relevant fields: `id`, `name` (participants-based match name; exact format NOT guaranteed by docs), `league_id`, `season_id`, `state_id`, `starting_at`, `starting_at_timestamp`
- no per-fixture `updated_at`/freshness field is documented on the Fixture entity or shown in the example response; `GET Last Updated Fixtures` is the documented freshness mechanism

## Timezone Behavior

- all v3 datetimes are UTC by default
- a per-request `timezone={tz}` parameter exists; on fixtures-by-date it makes the DATE BUCKET timezone-aware (changes which fixtures fall on the requested date), not just display
- **consequence:** BetTracker stores kickoff in UTC → the future runtime must OMIT the `timezone` parameter so the `{date}` bucket stays UTC and matches `kickoff_at::date`

## Authentication and Token Redaction

Two documented methods:

```txt
1. query parameter: ?api_token=[REDACTED]
2. HTTP header:     Authorization: [REDACTED]   (raw token, no "Bearer" prefix shown in docs)
```

- **header auth keeps the token out of URLs entirely** — recommended for the future runtime as primary defense; `redactUrl()` remains mandatory defense-in-depth for any URL that is logged
- tokens never expire until manually deleted; shown only once at creation; docs warn against frontend exposure (backend-only)
- `401` = invalid token; `403` = valid token but the requested feed is NOT in the subscription plan — a useful diagnostic to distinguish auth failure from plan-coverage failure

## Rate Limits and Request Cost

- limits are per ENTITY per hour (all fixtures endpoints share the Fixture entity counter); plan-based: Starter 2,000 / Growth 2,500 / Pro 3,000 / Enterprise 5,000 calls per entity per hour
- rolling 1-hour window anchored to the first request to that entity
- every successful response carries `rate_limit { resets_in_seconds, remaining, requested_entity }`
- exceeding returns HTTP 429 with `retry_after` in the JSON body; no rate-limit HTTP headers are documented
- **each HTTP request costs exactly 1 unit regardless of includes** — a discovery call with `include=participants;league;season;state` costs 1 unit
- the planned max-2-request discovery budget is negligible against any tier's hourly budget

## Plan Availability — Open Coverage Gate

- fixtures endpoints are included in ALL Football API tiers; tiers differ by league selection count and hourly rate limit: Starter €29/mo — any 5 leagues; Growth €99 — 30 leagues; Pro €249 — 120 leagues; Enterprise — all 2,300+ leagues (prices as listed 2026-07-07)
- a free plan exists covering exactly two leagues: Danish Superliga and Scottish Premiership
- **fixtures-by-date returns only fixtures from the subscription's selected leagues.** If the target league is not selected in the plan, the target fixture is invisible and discovery returns a FALSE "not found"
- BetTracker's target canonical fixtures are in the **Welsh Premier League (Cymru Premier)** — see Identity Context below
- **GATE (founder action, before any runtime approval):** confirm in my.sportmonks.com that the subscription exists and that the Welsh Premier League is among the selected/covered leagues, and record the plan tier. This cannot be read from public docs
- the `403 Forbidden` semantics above give the runtime a deterministic way to detect a non-covered feed if the gate is ever wrong

## Canonical Identity Context (sanitized, from production DB — no provider call)

Discovery target recorded by Decision #037:

```txt
canonical fixture: 5a42d721-b517-4251-8448-d62bff513c19
sport: football · status: scheduled
kickoff_at: 2026-12-31 12:30:00+00 (UTC)
competition: Premier League (Wales) · season 2026
home: Cardiff MET (api_football:team:353)
away: Barry Town (api_football:team:361)
venue: Cyncoed Campus (Cardiff)
provider link: api_football 1576052 (exact)
```

Fallback candidate: canonical `3c37358c-…` / api_football `1576053`, same league/date, kickoff 14:30 UTC.

- all comparison keys needed for client-side matching (date, kickoff UTC, league+country, season, team names, home/away, venue) are available server-side; team names come from `fixture_provider_links.raw_provider_payload` (service-role-only table)
- **name-variant risk:** SportMonks may spell these teams differently (e.g. "Cardiff Metropolitan University" vs "Cardiff MET", "Barry Town United" vs "Barry Town"). Exact/high confidence rules in Decision #037 must account for normalized-name comparison plus kickoff/league/home-away agreement; the fixture `name` field format is not guaranteed by docs

## Answers to the Scope's Endpoint Evidence Questions

```txt
Q: Can a date request be narrowed enough for a one-fixture mapping search?
A: YES, likely 1 request: fixtures/date/{YYYY-MM-DD} + filters=fixtureLeagues:{id}
   + include=participants;league;season;state, per_page=50, page 1.
   Requires the SportMonks league ID for the Welsh Premier League (see unknowns)
   and plan coverage of that league (see gate).

Q: Can a between-dates request be narrowed enough?
A: YES (max 100 days; same filters/includes). Not needed for a known single date;
   kept as fallback family only.

Q: Are league and season filters supported server-side?
A: League — YES, documented: filters=fixtureLeagues:{ids}. Season — listed as a
   dynamic filter target on both endpoints, but exact literal spelling is not
   shown in fetched examples; treat as unconfirmed until observed.

Q: If not server-side, what client-side comparison fields are available?
A: league_id, season_id, state_id, starting_at (UTC), starting_at_timestamp,
   name, participants (id, name, meta.location home/away).

Q: Is pagination present?  A: YES.

Q: Which field is the source of truth for total pages / total results?
A: NONE EXISTS in v3. has_more (boolean) is the only "more pages" signal;
   count is per-page only. Guardrail must be restated on has_more.

Q: Can page 1 only + stop logic be implemented safely?
A: YES: per_page=50, page 1, stop/flag if pagination.has_more === true.

Q: Can participants and home/away be requested in one call?
A: YES: include=participants → meta.location = home/away per participant.

Q: Can league, season, and state be included in the same response?
A: YES: include=participants;league;season;state (4 top-level includes, but the
   3-include limit applies to NESTED includes; these are flat chains — verify
   in 2.5.b.2 if all four are accepted together, else drop season/derive from
   season_id).

Q: Are freshness/update fields available?
A: NOT on the fixture entity/response; GET Last Updated Fixtures is the
   documented freshness mechanism. ingested_at remains BetTracker's freshness
   anchor for mapping evidence.

Q: What is the documented quota/request cost?
A: 1 rate-limit unit per HTTP request, includes free; per-entity hourly buckets
   2,000–5,000 by plan tier.

Q: Is the endpoint available on the current SportMonks plan?
A: Endpoint — all tiers. LEAGUE COVERAGE is the real gate: requires founder
   confirmation in my.sportmonks.com that the Welsh Premier League is selected.
```

## Endpoint Family Comparison (evidence-based; runtime shape NOT approved here)

`fixtures/date/{date}` is the stronger family for this discovery case: the kickoff date is known exactly, one UTC day-bucket keeps the result set minimal, the league filter is documented on it, and the has_more guardrail is implementable on page 1. `between/{start}/{end}` adds nothing for a known date and only widens the result set; `between/…/{team_id}` requires a SportMonks team ID we do not have. Per Decision #038, the final runtime request shape must still be proposed and approved in the 2.5.b.2 read-only implementation scope.

## Remaining Unknowns (carried into 2.5.b.2)

- SportMonks league ID for the Welsh Premier League (Cymru Premier) — needs a league-list lookup (an approved runtime step or dashboard check); no unapproved call may be made to find it
- whether the account's plan covers the Welsh Premier League (founder gate above)
- exact literal spelling of the season filter (e.g. `fixtureSeasons`) and whether league+season filters combine in one `filters=` parameter on these endpoints
- `participantSearch` static filter matching semantics (exact vs fuzzy)
- whether all four flat includes (`participants;league;season;state`) are accepted together on these endpoints
- whether legacy `page` responses still include a `next_page` field (cursor pagination is the recommended path)
- whether the `Authorization` header also accepts a `Bearer` prefix (docs show raw token only)
- free-plan rate limit numbers (only paid tiers are documented)
- fixture `name` field format guarantees (do not exact-match on it)
- `GET Fixtures by Search by Name` semantics

## What This Record Does Not Approve

This record does not approve:

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

## FP-001 Guardrail

Endpoint evidence is not identity confidence, provider-link approval, enrichment availability, model probability, implied probability, edge, EV, recommendation, Scout signal, Analyst signal, UI signal, or betting signal.

## Current Status

```txt
M1.2.e.2.b Read-Only SportMonks Mapping Discovery Scope - DONE
M1.2.e.2.b.1 Endpoint Evidence Scope - DONE
M1.2.e.2.b.1 Endpoint Evidence Record - DONE (Decision #040)
Plan/league coverage gate - CLOSED: FAILED for Cymru Premier (Decision #041,
  see docs/sportmonks-plan-coverage-gate-result-and-discovery-retarget-m1-2-e-2-b.md);
  discovery re-targets to England Premier League
2.5.b.2 read-only discovery implementation scope - NOT STARTED
SportMonks provider calls - NOT RUN
runtime request shape - NOT APPROVED
provider-link writes - NOT STARTED
enrichment writes - NOT STARTED
Scout/Analyst/UI usage - NOT STARTED
betting signals - NOT STARTED
```
