# Canonical-Linked SportMonks Class A Structural Presence Dry-Run — Decision #056

## Status

**IMPLEMENTED / DEPLOYED. ONE RUNTIME POST APPROVED 2026-07-28 BUT NOT RUN; AUTHORIZATION REMAINS UNCONSUMED.**

Founder approval: `APPROVE #056`.

The original decision permitted a reviewed implementation PR for a new read-only admin dry-run. On 2026-07-28, Founder separately approved exactly one production POST, but the call could not be authenticated through the existing Vercel Sensitive operator token and was not sent. The authorization remains unconsumed.

The GitHub Actions OIDC hardening PR includes a reviewed durable execution-ledger migration, but does not authorize merge, deployment, migration application, workflow dispatch, production execution, provider quota use, environment changes, or downstream consumption.

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

Any missing, reordered, widened, or additional field returns `400` before fixture DB preflight, provider-token loading, or provider fetch. A cryptographically valid production OIDC authorization is durably consumed before body parsing.

## GitHub Actions OIDC Authorization and Preflight

The Decision #056 route accepts only a short-lived GitHub Actions OIDC bearer token:

- issuer `https://token.actions.githubusercontent.com`;
- audience `urn:btdk:decision-056:production`;
- exact repository, immutable repository/owner IDs, actor/actor ID, environment, manual event, `main` ref, workflow name/ref, first run attempt, and GitHub-hosted runner claims;
- token `sha` and `workflow_sha` must both equal the production deployment's `VERCEL_GIT_COMMIT_SHA`;
- RS256 signature verified from GitHub's official JWKS;
- required `iat`, `nbf`, `exp`, and bounded unique `jti`;
- maximum token lifetime ten minutes and clock tolerance 30 seconds;
- missing production deployment identity → `503`;
- missing, invalid, expired, replayed, or mismatched bearer → `401`;
- invalid OIDC paths cause zero ledger writes, fixture DB reads, and provider calls.

There is no static operator-token or `x-bettracker-sync-token` fallback on this route. Other admin routes remain unchanged.

The manual workflow uses the protected GitHub Environment `decision-056-production`, accepts only the exact approved production SHA and confirmation string, requests one OIDC token, and contains one POST with no retry.

After OIDC verification, the endpoint atomically claims the fixed key `decision-056:sportmonks-structural-presence-dry-run` in the Supabase execution ledger before parsing the body. The primary key blocks the same JWT, a new JWT, a new dispatch, a cold start, and another Vercel instance. Duplicate claims return `401`; ledger unavailability returns `503`. Only `service_role` may insert, and no application role may read, update, or delete the row.

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
- `lib/security/github-actions-oidc.ts`
- `lib/security/decision-056-execution-ledger.ts`
- `app/api/admin/sports/enrichment/sportmonks-structural-presence-dry-run/route.ts`
- `supabase/migrations/*_decision_056_execution_ledger.sql`
- `.github/workflows/decision-056-production.yml`
- `.github/workflows/preview-tests.yml`
- `scripts/test-decision-056-oidc.mjs`
- `scripts/verify-decision-056-ledger.sh`
- `scripts/test-provider-safety.mjs`
- `tsconfig.scripts.json`
- decision/state/numbering documentation

Decision #034 files are imported only for approved identity constants; their runtime contract is not widened.

## Validation Contract

Provider-safety coverage must prove:

1. missing/unavailable/wrong OIDC authorization causes zero provider calls;
2. wrong issuer, audience, subject, repository, repository ID, owner ID, actor, environment, event, ref, workflow, deployment SHA, workflow SHA, run attempt, runner, expiry, lifetime, or `jti` fails closed;
3. twelve concurrent ledger claims produce exactly one winner;
4. a new dispatch/JTI cannot bypass the immutable execution key;
5. ledger unavailability fails closed before parsing or provider work;
6. the workflow requires `success: true`, `responseStatus: "ok"`, and exactly one provider request;
7. every body widening, include omission, or include reordering is rejected;
8. every preflight failure causes zero provider calls;
9. the approved path makes exactly one request to the exact include URL with header auth;
10. output/logs contain no provider content or tokens;
11. absent relationships stay absence-only evidence;
12. invalid shape, excessive count, invalid/duplicate ID, and reference mismatch fail closed;
13. an unexpected Class B/C relationship fails without content echo;
14. missing or present-invalid fixture identity fields fail closed;
15. missing provider configuration blocks before any request;
16. a provider failure is sanitized and never retried.

All existing FP-001, financial, domain-boundary, agent-boundary, auth, quarantine, rate-limit, CSP, parser, typecheck, lint, and build gates must remain green.

## Runtime Boundary

The 2026-07-28 approval permits exactly one future production POST and remains unconsumed because no POST was sent and the ledger migration has not been applied. This OIDC PR does not authorize merge, migration application, deployment, workflow dispatch, or execution. Those steps remain separately gated. Once a valid production OIDC token claims the ledger key, every eventual outcome — invalid body, success, blocked, failed, timeout, `401`, `429`, or `5xx` — consumes the authorization and forbids a retry without a new approval.

## Non-Use

```text
provider call during implementation/testing: 0
production Supabase writes: 0
execution-ledger production writes: 0
migrations authored: 1
migrations applied to production: 0
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
