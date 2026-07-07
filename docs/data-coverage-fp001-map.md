# FP-001 Data Coverage Map

Status: roadmap aid / documentation only

Last updated: 2026-07-07

## Purpose

This document maps the missing data requirements from `FP-001 - Legacy False Precision Analysis` to possible provider candidates, canonical storage targets, milestones, current status, and blockers.

This is not an implementation milestone. It does not start football enrichment, odds writes, Scout usage, Analyst usage, UI usage, or any provider call.

Reference: `docs/analysis-trust-regression-cases.md`

## Current Boundary

M1.3 mapping exploration is now paused. This document does not supersede the current M1.3 pause/handoff boundary.

It also does not start:

```txt
M1.2.e football enrichment implementation
M1.3 odds write implementation
Scout / Analyst / UI odds usage
betting signals
```

## Core Rule

FP-001 remains active:

```txt
Reference discovery != betting signal
Odds availability != model probability
Odds snapshot != edge
Bookmaker odds != recommendation
Line movement != value unless separately validated
```

No data source, provider availability, reference mapping, or partial enrichment can unlock model probability, implied probability, edge, EV, recommendation, Place Bet, Scout score, or betting signal until the relevant trust gates and model inputs are validated.

## Coverage Map

| FP-001 missing requirement | Provider candidate | Canonical storage target | Milestone | Status | Blocker / next step |
| --- | --- | --- | --- | --- | --- |
| Provider-backed odds / line movement | API-Football odds v1 for football pre-match odds; future approved licensed odds provider if API-Football coverage is insufficient | Future odds snapshot storage and market mapping tables; no active odds write storage approved yet | M1.3 odds reference discovery, then read-only odds dry-runs, then separate controlled odds write validation | Partially scoped. First read-only fixture odds dry-run executed safely and returned no coverage. Bookmaker/mapping reference discovery executed safely, then paused on mapping pagination/filter evidence boundaries. | Mapping exploration is paused. Future odds work requires separate provider evidence, sanitized reports, endpoint shape validation, storage design, write gates, and trust validation. Line movement requires repeated validated snapshots and separate interpretation rules. |
| Live status / event state | API-Football fixtures/status for football; API-Tennis or another licensed tennis provider for tennis if approved later | `canonical_fixtures.status`, `kickoff_at`, `fixture_provider_links`, future live-state audit/snapshot storage if needed | Fixtures foundation and future live-state validation | Football scheduled/fixture foundation exists for controlled fixture writes. Live status trust still limited. Tennis live status is not pricing-supported. | Define provider-backed live-state sync, freshness rules, stale-data rules, and sport-specific status normalization. Do not use user-provided third-party context as provider truth. |
| Team news / lineups | API-Football lineups endpoint if confirmed by sanitized evidence; SportMonks fixture-by-ID includes and pre-match news endpoints if plan evidence supports them; another licensed football enrichment provider only if approved | Existing `football_enrichment` table requires schema review before reuse; future curated enrichment storage may be needed for lineups, starting elevens, formations, player availability, source timestamp | M1.2.e football enrichment design, endpoint evidence, M1.2.e.2 canonical fixture mapping, then read-only dry-run | Design DONE. Endpoint evidence DONE. SportMonks canonical mapping scope in review. Implementation not started. | No exact/high SportMonks provider link exists for canonical fixture `1576052`. Approve M1.2.e.2 mapping evidence before canonical-linked enrichment. Shape-only/unbound dry-runs cannot unlock enrichment writes or downstream usage. |
| Injuries / suspensions | API-Football injuries/sidelined endpoints if confirmed by sanitized evidence; SportMonks `sidelined` include/entity if plan evidence supports it; alternative licensed football enrichment provider if needed | Existing `football_enrichment` table requires schema review before reuse; future curated enrichment storage may be needed for injuries, suspensions, availability status, source timestamp, confidence/freshness metadata | M1.2.e football enrichment design, endpoint evidence, M1.2.e.2 canonical fixture mapping, then read-only dry-run | Design DONE. Endpoint evidence DONE. SportMonks canonical mapping scope in review. Implementation not started. | No SportMonks link -> no canonical enrichment -> no write -> no Analyst/Scout/UI. Confirm exact/high provider link, provider coverage, plan access, request cost, response shape, player/team mapping, freshness, legal/licensed usage, write gates, and trust validation. |
| Sport-specific model support | Football model layer for football; deep tennis provider plus tennis-specific model before tennis pricing | Analyst model input contracts and validation artifacts; no raw provider payload as model truth | Future Analyst model validation milestones | Not satisfied for mixed-sport pricing. Football can be designed later; tennis remains unsupported for pricing. | Define sport-specific features, calibration, validation sets, missing-data behavior, and quality gates. Data purchase alone is not sufficient. |
| Per-leg model inputs | Provider-backed fixtures, odds, line movement, status, team news, injuries, sport-specific features, and model availability per leg | Analyst decision input ledger or equivalent validated per-leg input record; future storage only after design | Future Analyst trust validation milestone | Not started | Define required per-leg inputs, minimum coverage threshold, missing-data checklist, and blocking rules before any combined probability or parlay price. |

## Football Conclusion

Football can eventually close several FP-001 gaps using existing paid providers, but only after each layer passes the same discipline used in M1.2 and M1.3:

```txt
provider evidence
read-only dry-run
sanitized report
storage design
write safety gate
controlled write validation
idempotency validation
trust validation
non-use in Analyst/Scout/UI until approved
```

For football, the most realistic sequence is:

1. Keep M1.3 mapping exploration paused until stronger filter evidence or a separate full-crawl budget is accepted.
2. Keep football enrichment design complete and separate from M1.3 mapping.
3. Keep endpoint evidence DONE, with SportMonks fixture-by-ID as the preferred candidate family for a future dry-run.
4. Complete M1.2.e.2 SportMonks canonical fixture mapping before canonical-linked enrichment.
5. Run enrichment read-only dry-runs only under explicit request budgets and only after exact/high provider-link prerequisites are met.
6. Design enrichment storage/write gates separately.
7. Add Analyst-layer per-leg input contracts only after provider-backed data coverage is validated.

## Tennis Conclusion

Tennis remains unsupported for pricing.

Tennis cannot produce model probability, implied probability, edge, EV, recommendation, Place Bet, Scout score, or betting signal until all of the following exist:

- approved deep tennis provider evidence
- tennis fixture and event-state mapping
- tennis odds/reference coverage
- tennis enrichment storage
- tennis-specific model input contract
- tennis-specific model validation
- per-leg trust gates for tennis markets

Mixed football plus tennis parlays remain blocked from final pricing unless every leg has sport-specific support and valid per-leg model inputs.

## Analyst-Layer Conclusion

Sport-specific model support and per-leg model inputs are Analyst-layer requirements. They are not solved by buying provider data alone.

Provider data can supply facts. It does not by itself create:

- calibrated model probability
- implied probability comparison logic
- edge
- EV
- recommendation
- actionability
- betting signal

The Analyst layer must prove how each input is used, how missing inputs block output, and how the model is validated before any priced betting analysis is allowed.

## Non-Use Rule

Until separately approved, the coverage map must not be used to:

- create provider requests
- write odds
- write enrichment records
- start M1.2.e implementation
- alter M1.3 reference discovery scope
- show Scout signals
- show Analyst recommendations
- change UI actionability
- unlock Place Bet
- infer probability, edge, EV, or value

## Next Steps

The M1.3 mapping exploration path is paused:

```txt
M1.3 Mapping Exploration — PAUSED
/odds/mapping page 2+ — BLOCKED
full mapping crawl — BLOCKED
filtered /odds/mapping runtime — NOT APPROVED
```

M1.2.e football enrichment is now a separate design/mapping-scope track only. It does not start provider calls, migrations, writes, Scout usage, Analyst usage, UI usage, Place Bet, or betting signals.
