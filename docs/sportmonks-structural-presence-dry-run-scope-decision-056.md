# Canonical-Linked SportMonks Class A Structural Presence Dry-Run — Decision #056

## Status

**APPROVED 2026-07-14 — IMPLEMENTATION ONLY. RUNTIME PROVIDER CALL NOT APPROVED.**

Founder approval: `APPROVE #056`.

This decision permits a reviewed implementation PR for a new read-only admin dry-run. It does not authorize execution in production, provider quota use, persistence, migrations, environment changes, or downstream consumption.

## Objective

Implement the smallest evidence-only continuation of Decision #055: determine whether the six approved Class A structural relationships are present and structurally consistent for the already linked canonical fixture, without returning relationship content and without writing anything.

The completed Decision #034 route remains immutable in scope: it continues to request the base fixture response with an empty include set. Decision #056 uses a separate module and route.

## Pinned Identity

```text
provider: sportmonks
canonical fixture: 92afd570-399a-48b9-915a-e1ffaf52a71c
SportMonks fixture: 19722203
sport: football / SportMonks sport_id 1
league: SportMonks league_id 8
kickoff minute: 2026-08-21T19:00Z
mapping confidence: exact or high
```

## Pinned Request Contract

One request is implemented, but execution remains separately blocked:

```text
GET https://api.sportmonks.com/v3/football/fixtures/19722203?include=participants;league;season;round;venue;state
```

Rules:

- exact ordered include set: `participants;league;season;round;venue;state`;
- exactly one fixture-by-ID request;
- `maxProviderRequests: 1`;
- token in the `Authorization` header only;
- no `api_token` query parameter;
- no retry, pagination, fallback, second endpoint, filters, select, locale, or sort;
- no nested include;
- no odds, premium odds, in-play odds, predictions, AI overviews, scores, events, periods, lineups, sidelined, weather, statistics, xG, pressure, trends, match facts, metadata, or news include;
- provider redirect blocking and body-read timeout remain inherited from the shared provider transport.

Official provider references:

- <https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures/get-fixture-by-id>
- <https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes>

## Operator Body Contract

The admin route accepts only this exact shape and ordered tuple:

```json
{
  "dryRun": true,
  "provider": "sportmonks",
  "canonicalFixtureId": "92afd570-399a-48b9-915a-e1ffaf52a71c",
  "sportmonksFixtureId": "19722203",
  "requestedIncludeSet": [
    "participants",
    "league",
    "season",
    "round",
    "venue",
    "state"
  ],
  "maxProviderRequests": 1,
  "operatorConfirm": "RUN_SPORTMONKS_STRUCTURAL_PRESENCE_DRY_RUN_D056"
}
```

Any missing, reordered, widened, or additional field returns `400` before DB preflight, provider-token loading, or provider fetch.

## Authorization and Preflight

The route uses the existing timing-safe `SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN` gate:

- missing configured token → `503`;
- missing or wrong bearer → `401`;
- both paths cause zero DB reads and zero provider calls.

After authorization and body validation, a read-only Supabase preflight must pass before the SportMonks token is loaded:

- canonical fixture exists;
- sport is `football`;
- status is `scheduled`;
- kickoff minute is `2026-08-21T19:00Z`;
- the SportMonks provider link exists;
- linked provider fixture ID is `19722203`;
- mapping confidence is `exact` or `high`.

Any preflight failure returns a sanitized blocked report with `requestCount: 0` and `writes: "none"`.

## Provider Identity Validation

The provider response fails closed unless:

- `data` is an object;
- `data.id` is the approved fixture ID;
- `sport_id` is present and equals `1`;
- `league_id` is present and equals `8`;
- `starting_at` is present, parseable, and matches the approved kickoff minute.

Provider values are never reflected in mismatch warnings. IDs are accepted only as bounded digit strings or positive safe integers. Timestamps are bounded, shape checked, parsed, and emitted only as normalized ISO values.

## Sanitized Structural Report

The report exposes no relationship content. For each approved relationship it reports only:

- presence;
- expected shape (`array`, `object`, `absent`, or `invalid`);
- bounded record count;
- schema-valid boolean;
- identifier-valid boolean;
- fixture-reference-match boolean where applicable;
- count of valid versus missing/invalid `updated_at` freshness fields.

`participants` must contain exactly two object records with distinct valid IDs when present. The array is capped at eight records before inspection.

`league`, `season`, `round`, `venue`, and `state` must be objects with valid IDs when present. Each relationship ID must equal the corresponding base fixture foreign-key ID. Present-but-invalid values, invalid shapes, invalid IDs, or reference mismatches produce a sanitized failed report.

Missing requested relationships are valid evidence and remain `absent`; absence does not become trust or write eligibility.

The report additionally contains:

- fixture identity status;
- normalized fixture kickoff;
- fixture source-freshness presence boolean;
- one boolean indicating whether a non-approved Class B/C relationship appeared;
- `collectedAt`, explicitly not source freshness;
- fixed warnings;
- downstream blocks;
- `writes: "none"`.

## Sanitization and Scope Escape Guards

The response and logs must never contain:

- team, competition, season, round, venue, player, bookmaker, or provider names;
- logos, image paths, descriptions, metadata, notes, event content, or market content;
- odds prices, predictions, AI overviews, xG, pressure, statistics, or lineups;
- raw provider objects or payloads;
- operator or provider tokens;
- invalid provider values echoed through warnings.

If a non-approved relationship family appears despite the pinned request, the run fails with a fixed warning and a single boolean. Its content is neither read nor returned.

## Implementation Files

- `lib/providers/sportmonks-structural-presence-dry-run.ts`
- `app/api/admin/sports/enrichment/sportmonks-structural-presence-dry-run/route.ts`
- `scripts/test-provider-safety.mjs`
- `tsconfig.scripts.json`
- decision/state/numbering documentation

Decision #034 files are imported only for approved identity constants; their runtime contract is not widened.

## Validation Contract

Provider-safety coverage must prove:

1. missing/wrong operator token causes zero provider calls;
2. every body widening, include omission, or include reordering is rejected;
3. every preflight failure causes zero provider calls;
4. the approved path makes exactly one request to the exact include URL with header auth;
5. output/logs contain no provider content or tokens;
6. absent relationships stay absence-only evidence;
7. invalid shape, excessive count, invalid/duplicate ID, and reference mismatch fail closed;
8. an unexpected Class B/C relationship fails without content echo;
9. missing or present-invalid fixture identity fields fail closed;
10. missing provider configuration blocks before any request;
11. a provider failure is sanitized and never retried.

All existing FP-001, financial, domain-boundary, agent-boundary, auth, quarantine, rate-limit, CSP, parser, typecheck, lint, and build gates must remain green.

## Runtime Boundary

Merging the implementation does not authorize execution. A later CPO runtime instruction must separately authorize exactly one production POST. Any response — success, blocked, failed, timeout, `401`, `429`, or `5xx` — consumes the authorization and forbids a retry without a new approval.

## Non-Use

```text
provider call during implementation/testing: 0
Supabase writes: 0
migrations: 0
environment changes: 0
structural persistence: 0
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

Structural identity and relationship presence are not model evidence. They cannot become BetTracker probability, fair odds, edge, EV, recommendation, confidence, Place Bet, Scout score, Analyst signal, UI signal, or another betting signal without separate reviewed data-quality and consumer decisions.
