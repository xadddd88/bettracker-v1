# M1.3 Read-Only Odds Dry-Run Scope

Status: DONE via PR #83 / scope approval only / provider call not run

Last updated: 2026-07-05

## Scope

PR #83 records the exact scope for the first API-Football read-only odds dry-run.
PR #84 implements the protected read-only route/helper for this scope, but still does not run the production provider call.

Allowed:

- record operator-verified production fixture candidates
- record the exact provider request shape
- record request budget and pagination guardrails
- record sanitized report expectations
- record stop conditions

Not allowed:

- provider calls from BetTracker production
- runtime ingestion code
- migrations
- API routes
- odds writes
- Supabase writes
- env changes
- adding or enabling `SPORTS_ODDS_SYNC_WRITE_ENABLED`
- enabling `SPORTS_FIXTURE_SYNC_WRITE_ENABLED`
- Scout, Analyst, or UI odds usage
- model probability, implied probability, edge, EV, recommendation, or betting signal output
- M1.3 controlled odds write validation

## Operator Evidence

On 2026-07-05, the operator ran the production Supabase selection SQL in read-only mode and confirmed:

- exactly 2 eligible candidates were returned
- the selected candidates have exact `api_football` provider links
- candidate fields matched the proposed scope:
  - canonical fixture row exists
  - `provider_fixture_id`
  - kickoff
  - `mapping_confidence = exact`
  - mapping method through the provider fixture link
- no Supabase write was run
- no provider odds call was run

The provider fixture IDs are the values used in the external API-Football `/odds` request. The canonical fixture row IDs are the internal Supabase rows verified by the operator-side read-only SQL.

## Candidate Fixtures

Provider:

```txt
api_football
```

Sport:

```txt
football
```

Market:

```txt
Match Winner / 1X2
provider bet id: 1
```

Candidates:

| Role | Provider | Provider fixture ID | Canonical row | Required status | Required kickoff gate | Mapping |
|---|---|---:|---|---|---|---|
| Primary | `api_football` | `1576052` | verified by production read-only SQL | `scheduled` | `kickoff_at > now + 15 minutes` | `exact` |
| Fallback | `api_football` | `1576053` | verified by production read-only SQL | `scheduled` | `kickoff_at > now + 15 minutes` | `exact` |

Primary request shape for the later CPO-approved runtime step:

```txt
GET /odds?fixture=1576052&bet=1
```

Fallback request shape, only if primary is blocked before the provider call:

```txt
GET /odds?fixture=1576053&bet=1
```

## Recommended Variant

Variant A is recommended for the first production odds dry-run:

```txt
request primary only
if paging.total > 1, stop after page 1
do not fetch page 2 unless separately approved
```

Variant B remains available only by separate CPO approval:

```txt
request primary page 1
if paging.total > 1, request remaining pages up to the approved budget
```

PR #83 approves Variant A only.

## Request Budget

Proposed budget for the later runtime dry-run:

```txt
max provider requests: 1
```

Hard stop budget:

```txt
absolute max provider requests without new approval: 3
```

Budget accounting:

- each HTTP request counts as 1 request against API-Football quota
- each paginated `page` counts as a separate request
- primary page 1 = 1 request
- fallback page 1 = 1 request, but only if primary is blocked before any provider call
- page 2 or higher is not approved by PR #83

## Required Pre-Call Gates

Before any provider call, the runtime operator must confirm:

- selected fixture is still in `canonical_fixtures`
- `canonical_fixtures.sport = football`
- `canonical_fixtures.status = scheduled`
- `canonical_fixtures.kickoff_at` is known
- `canonical_fixtures.kickoff_at > now + 15 minutes`
- exact `fixture_provider_links` row exists
- `fixture_provider_links.provider = api_football`
- `fixture_provider_links.provider_fixture_id` matches the selected provider fixture ID
- `fixture_provider_links.mapping_confidence = exact`
- provider request count remains within the CPO-approved runtime budget
- no odds write flag exists or is enabled
- odds will not be used by Scout, Analyst, UI, probability, edge, EV, or recommendations

## Stop Conditions

Stop before provider call if:

- selected fixture is missing
- selected fixture is not `scheduled`
- selected fixture kickoff is missing
- selected fixture kickoff is inside the 15-minute safety buffer
- selected fixture no longer has an exact `api_football` provider link
- selected provider fixture ID differs from the merged PR #83 scope
- estimated request count exceeds 1 for Variant A
- operator token, provider token, or secret would be printed
- raw provider payload would be stored, logged, committed, or returned

Stop after page 1 if:

- `paging.total > 1`
- response includes unexpected raw payload fields that cannot be summarized safely
- response shape differs from the sanitized schema accepted in PR #82
- provider returns errors, auth errors, quota errors, or rate-limit warnings
- selected fixture appears unavailable for current/future odds on the current plan

## Sanitized Report Template

The later runtime report must include only:

```txt
success
dryRun
provider
providerFixtureId
betId
requestCount
paging.current
paging.total
fixturesChecked
fixturesWithOdds
oddsAvailable
discoveredBookmakers: [{ id, name }]
discoveredMarkets: [{ id, name }]
selectionLabels
providerUpdateTimestampPresent
quotaHeadersPresent
rawPayloadReturned: false
tokensReturned: false
supabaseWrites: 0
oddsWrites: 0
userFacingUse: false
```

The report must not include:

- provider token
- operator token
- secret query params
- raw provider payload
- raw odds response blob
- account email
- model probability
- implied probability
- edge
- EV
- betting recommendation
- Scout or Analyst signal

## Expected Outcome

The read-only odds dry-run should answer only:

- whether `GET /odds?fixture={provider_fixture_id}&bet=1` works for a merged exact-linked fixture scope
- whether current plan access returns pre-match Match Winner odds for the selected fixture
- which bookmakers and markets are visible in the sanitized response
- whether pagination appears
- whether the response shape matches PR #82 evidence

It must not answer:

- whether a bet has value
- whether BetTracker should recommend a wager
- any model probability, implied probability, edge, EV, or confidence score

## Current Runtime State

```txt
SPORTS_FIXTURE_SYNC_WRITE_ENABLED: absent/off
SPORTS_ODDS_SYNC_WRITE_ENABLED: not added/enabled
fixture write mode: off
odds provider calls from production: not run by PR #83 or PR #84 implementation
odds writes: not run
Supabase writes: not run
Scout/Analyst/UI odds usage: not started
production odds dry-run: not run by PR #83
```

## Decision

PR #83 is a scope-approval PR only.

PR #84 may implement the protected runtime path for this exact scope. After PR #84 is merged/deployed and CPO separately approves the runtime step, the first provider call may be:

```txt
GET /odds?fixture=1576052&bet=1
```

with Variant A guardrail:

```txt
if paging.total > 1, stop after page 1
```

No fallback call, extra page call, odds write, Supabase write, or user-facing odds usage is proposed by PR #83.
