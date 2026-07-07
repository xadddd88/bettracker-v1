# M1.2.e.2.b.2 API-Football EPL Dry-Run & Controlled Write Scope (Decision #042)

## Status

SCOPE APPROVED FOR OPERATOR EXECUTION / WRITE FLAG DEFAULT OFF

Last updated: 2026-07-07

## Purpose

Execute steps 2–3 of the Decision #041 re-target sequence: select and write **at most 2** England Premier League 2026-27 canonical fixtures via the validated API-Football fixture-sync path, so they can become the SportMonks mapping discovery targets.

## Approval

Founder/CPO granted blanket conversation approval on 2026-07-07 for the Decision #041 sequence. Execution remains operator-gated: the calls require `SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN`, and the write additionally requires the `SPORTS_FIXTURE_SYNC_WRITE_ENABLED` env flag plus the `WRITE_FIXTURE_SYNC_M1_2_B` confirmation. See `docs/sports-operator-runbook-m1-2-e-2-b-2.md`.

## Scope

```txt
provider:        api_football only
league:          39 (England Premier League, from COMPETITION_MAP)
season:          2026 (2026-27; league-filtered requests now REQUIRE season — PR #116)
dry-run:         single-day probes, 1 provider request each, max 4 attempts
write:           exactly one day with 1-2 fetched fixtures; single provider,
                 single day, write cap 25 enforced in code, scope cap 2 by
                 operator check of report.providers[0].fetched
write flag:      SPORTS_FIXTURE_SYNC_WRITE_ENABLED set only for the single
                 write call, removed immediately after (M1.2.c precedent)
mapping:         provider_fixture_id -> mapping_confidence 'exact' (id-based)
pagination:      multi-page responses now throw 'pagination overflow' (PR #116)
plan evidence:   operator records the API-Football account plan name observed
                 in the dashboard (closes the Decision #039 OPEN plan question)
```

## Not approved

- any other league, season, or provider
- writes above 2 fixtures for this scope
- odds, results, or enrichment calls
- Scout/Analyst/UI usage, probability, edge, EV, recommendation, betting signal

FP-001 remains active. Fixture identity is not a betting signal.

## Consequences

- The written fixtures supersede the Welsh targets per Decision #041; a follow-up ledger record captures their UUIDs.
- The Welsh canonical fixtures (`api_football` 1576052/1576053) remain in the database untouched.
