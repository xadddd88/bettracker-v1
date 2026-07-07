# M1.2.e.2.b.2 SportMonks Mapping Discovery Implementation Scope (Decision #043)

## Status

IMPLEMENTATION MERGED / EXECUTION OPERATOR-GATED / ZERO WRITES

Last updated: 2026-07-07

## Purpose

Implement the read-only SportMonks mapping discovery runtime defined by Decisions #037/#040/#041, targeting the England Premier League fixtures written under Decision #042.

## Implementation (PR #117)

```txt
route:   POST /api/admin/sports/mapping/sportmonks-discovery
library: lib/providers/sportmonks-mapping-discovery.ts
auth:    SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN bearer (timingSafeEqual, 503 when unset)
```

Scope is structurally pinned in the route schema (zod literals) — widening any
value requires a new PR and approval:

```txt
dryRun: true · provider: sportmonks · sportmonksLeagueId: '8' (EPL, Decision #040 evidence)
canonicalFixtureIds: 1-2 UUIDs · maxProviderRequests: 2
operatorConfirm: RUN_SPORTMONKS_MAPPING_DISCOVERY_M1_2_E_2_B_2
```

## Guardrails (enforced in code, covered by tests)

- max 2 provider requests; same-matchday targets share one request
  (`GET /v3/football/fixtures/date/{UTC-date}?filters=fixtureLeagues:8&include=participants;league;state&per_page=50`)
- page 1 only; `pagination.has_more === true` → stop, targets marked AMBIGUOUS, no page 2 (v3 has no `total` field — Decision #040)
- token in the `Authorization` header only, never in the URL; `redactUrl()` on error paths
- `timezone` parameter omitted — the date bucket stays UTC and matches `kickoff_at`
- match keys read from `canonical_fixtures` + `fixture_provider_links.raw_provider_payload` at runtime (service-role read)
- confidence rubric: exact / high / medium / needs_review; ≥2 exact/high candidates → ambiguous; only a single exact/high candidate sets `eligibleForProviderLink: true`
- ZERO writes (`writes: "none"` in every report); sanitized report only — no raw payload, no token, no odds/probability fields
- tests: 8 cases in `scripts/test-provider-safety.mjs` (61/61 passing)

## Execution (2.5.b.3)

Founder/CPO granted blanket conversation approval on 2026-07-07. Execution follows `docs/sports-operator-runbook-m1-2-e-2-b-2.md` Step 4, only after the Decision #042 write exists. The sanitized discovery report is recorded in the ledger afterwards.

## Result semantics (Decision #037)

```txt
single exact/high candidate  -> eligible for a LATER controlled provider-link write
medium / needs_review        -> mapping blocked, zero writes
ambiguous / not_found        -> mapping blocked, zero writes
failed / target_invalid      -> mapping blocked, zero writes
```

## Not approved

- provider-link writes (next separate scope)
- enrichment calls or writes
- page 2+, crawls, broad searches, fallback endpoints, retries
- Scout/Analyst/UI usage, probability, implied probability, edge, EV, recommendation, Place Bet, betting signal

FP-001 remains active. Mapping discovery is identity evidence only.
