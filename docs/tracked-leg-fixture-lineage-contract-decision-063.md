# Decision #063 — Tracked-Leg Fixture Lineage Contract

**Date:** 2026-07-21
**Proposed by:** CPO
**Status:** PROPOSED / DOCS-ONLY. This contract does not authorize a migration, RPC, API change, provider call, result write, matching job, settlement, bankroll mutation, deploy, or production smoke.

## Purpose

Define the minimum identity and provenance contract that must exist before a
Tracker leg can be associated with a canonical fixture or provider result.
Today the Tracker stores coupon text and odds, while the sports-data graph is a
separate system. A result must never be matched to a leg from names alone.

## Repository Evidence Baseline

The current path on `main @ 12a255c2a441b983693f8292599cb49232724c60`
is:

```txt
Scanner screenshot or manual form
  -> textual LegDraft[]
  -> POST /api/bets/tracked
  -> create_tracked_bet(...)
  -> bets + bet_legs

Separate sports-data graph
  canonical_fixtures
  -> fixture_provider_links
  -> fixture_results / football_enrichment
```

Confirmed gaps:

| Priority | Evidence | Consequence |
|---|---|---|
| P0 | `lib/bets/tracked-bet.ts` leg contract contains only sport, event name, market, selection, and odds | A leg has no fixture identity |
| P0 | `app/api/bets/tracked/route.ts` forwards only those leg fields to the RPC | The server receives no authoritative fixture reference |
| P0 | `supabase/migrations/024_create_tracked_bet.sql` rejects extra leg keys and inserts only the textual contract | A client cannot safely preserve lineage through the current RPC |
| P0 | `bet_legs` in `supabase/migrations/001_initial_schema.sql` has no fixture/provider foreign key or kickoff snapshot | Stored legs cannot be joined safely to results |
| P0 | `canonical_fixtures` and `fixture_provider_links` exist in `supabase/migrations/013_sports_data_foundation.sql`, but have no Tracker relationship | The authoritative identity graph is disconnected from financial records |
| P1 | Scanner output exposes only a coupon-level optional `event_start_text` | A coupon timestamp is not per-leg identity evidence |
| P1 | `scannerDataToDrafts()` intentionally discards scanner noise, including time and possible IDs | Existing scanner drafts are explicitly unresolved |
| P1 | Tracker uses `soccer`, while provider types use `football` | Sport normalization must be explicit and allowlisted |
| P1 | Migration 024 idempotency hashing has no fixture lineage input | The current RPC cannot distinguish two lineage claims for the same text |
| P2 | Mobile draft/scanner DTOs mirror the textual web contract | Native adoption must be a separate phase |

## Decision

Future lineage is additive and server-verified. The existing
`create_tracked_bet` contract remains unchanged for rollback and legacy
compatibility. A future `create_tracked_bet_v2` may add lineage only after a
separate implementation approval.

### Minimum additive storage contract

Candidate nullable columns on `bet_legs`:

```txt
canonical_fixture_id          uuid
fixture_provider_link_id      uuid
fixture_provider              text
provider_fixture_id           text
fixture_kickoff_at_snapshot   timestamptz
fixture_timezone              text
lineage_state                 verified | unresolved | needs_review
lineage_source                text
lineage_contract_version      smallint
mapping_confidence_snapshot   text
mapping_method_snapshot       text
lineage_verified_at           timestamptz
```

Required foreign keys use `ON DELETE RESTRICT`. `fixture_timezone` is either
canonical `UTC` or a valid IANA timezone derived from an authoritative fixture
or provider-link record. User profile timezone, OCR text, `Today`, `Tomorrow`,
and coupon-local display text are never authoritative timezone sources.

Provider, provider fixture ID, kickoff, timezone, mapping confidence, and
mapping method are immutable snapshots derived by the RPC inside the same
transaction that creates the leg. The client does not supply snapshot values.

### State contract

`verified`

- `canonical_fixture_id` and `fixture_provider_link_id` are both present;
- the provider link belongs to that canonical fixture;
- provider, provider fixture ID, kickoff snapshot, timezone, source, version,
  confidence/method snapshots, and `lineage_verified_at` are present;
- mapping confidence is exactly `exact`; `high`, including `name_time_match`,
  is insufficient;
- sport compatibility passes an explicit allowlist (`soccer -> football` is
  allowed only by that list).

`unresolved`

- all authoritative identity and fixture snapshot fields are `NULL`;
- the leg remains valid for manual Tracker display and manual settlement only;
- scanner-created legs default here unless exact provider evidence is already
  available through a separately approved picker flow.

`needs_review`

- all authoritative identity and fixture snapshot fields are also `NULL`;
- a possible, ambiguous, stale, incomplete, or contradictory candidate was
  observed, but no candidate is promoted into trusted fields;
- no result matching or automated financial action is allowed.

Legacy rows are represented as `unresolved`, `lineage_source=legacy`, and
`lineage_contract_version=0`. New contract rows use version `1`.

Version 1 sources are a DB allowlist, initially limited to
`manual_unresolved`, `scanner_unresolved`, `fixture_picker_exact`, and
`manual_candidate_review`. Free-form client provenance is rejected.

### API authority

For an unresolved scanner/manual leg, a client may send only:

```json
{
  "lineage": {
    "contractVersion": 1,
    "source": "scanner_unresolved",
    "canonicalFixtureId": null,
    "fixtureProviderLinkId": null
  }
}
```

For an explicit fixture selection, the client may send the canonical fixture
ID and provider-link ID. The RPC locks and reads both rows, validates their
relationship and exact confidence, and derives every trusted snapshot. A
client can never assert `verified`, provider/provider-fixture values, kickoff,
timezone, mapping evidence, or `lineage_verified_at`.

### Idempotency and immutability

A future `create_tracked_bet_v2` request hash includes the normalized existing
payload plus, for every ordered leg, lineage contract version, source,
canonical fixture reference, and provider-link reference.

- same UUID + identical normalized payload and lineage references -> exact
  replay of the original stored bet;
- same UUID + any changed lineage reference/source/version -> conflict and
  zero writes;
- server-derived snapshots are not recomputed on replay;
- verified lineage is immutable through generic DML or ordinary edit routes;
- correction requires a separately approved, one-way audited RPC with its own
  idempotency UUID and audit record.

## Fail-Closed Rules

- `event_name` is display text only.
- Name-only, participant-only, odds-only, and fuzzy matching are prohibited.
- Name + kickoff does not create `verified` lineage.
- A coupon-wide timestamp does not identify any individual leg.
- `high`, `medium`, ambiguous, missing, stale, or contradictory mapping evidence
  never becomes `verified`.
- A provider link belonging to a different canonical fixture is rejected.
- Multiple Bet Builder legs may reference the same verified fixture; preserved
  `leg_index` still defines coupon order.
- `unresolved` and `needs_review` legs cannot enter result matching,
  result ingestion promotion, automatic grading, settlement, payout, refund,
  bankroll writes, or derived financial analytics.
- Direct authenticated client DML, unauthenticated RPC use, service-role
  credentials in clients, and raw provider payload persistence remain blocked.

## Legacy Policy

There is no bulk backfill from event names, participant names, odds, approximate
dates, or OCR text. Legacy legs stay unresolved.

A future manual resolution flow may attach one legacy leg only after the user
explicitly selects an authoritative canonical fixture and provider link. That
flow requires a separate one-way audited RPC, a fresh idempotency UUID, row
locking, immutable snapshot creation, and its own approval and tests.

## Required Future Adversarial Tests

- exact canonical/provider link passes; `high/name_time_match`, medium, and
  ambiguous mappings block;
- same participant names at different kickoffs never cross-link;
- provider link from another canonical fixture blocks with zero writes;
- sport normalization is allowlist-only;
- a verified tuple missing any required ID/snapshot/timezone is rejected by DB
  constraints or trigger;
- same idempotency UUID with changed lineage conflicts with zero writes;
- replay after canonical kickoff changes returns the original immutable
  snapshot;
- 2-leg and 20-leg Expresses preserve order and independent lineage;
- multiple legs may intentionally reference one fixture;
- legacy rows remain unresolved and no name-based backfill exists;
- concurrent provider-link modification is blocked by transactional locking;
- direct client DML, unauthenticated invocation, and raw provider payloads stay
  prohibited.

## Small-PR Implementation Sequence

1. This docs-only contract and approval boundary.
2. Additive migration + `create_tracked_bet_v2` + constraints/triggers, kept
   unapplied and without an application caller.
3. Financial/domain boundary tests for lineage, immutability, and idempotency.
4. Separately controlled migration apply, catalog verification, and an
   authenticated non-provider smoke.
5. Shared Zod/DTO contract and versioned `/api/bets/tracked` adapter, retaining
   the old RPC for rollback.
6. Read-only canonical fixture picker; manual/scanner default to explicit
   `unresolved`.
7. Separate mobile DTO/UI adoption.
8. Legacy presentation plus separately scoped audited manual resolution.
9. Only after verified lineage validation, open a new scope for result
   ingestion/grading; automatic settlement remains a later independent gate.

## Non-Authorization

This decision records a trust contract only. It performs and authorizes zero
runtime code changes, migrations, Supabase reads/writes, provider calls,
provider-result matching, result writes, scheduler jobs, grading callers,
settlement, payouts/refunds, bankroll changes, production deploys, or smokes.
Draft PRs #181 and #182 are not part of the `main` baseline for this decision.
Decision #057's result and settlement holds remain active. FP-001 remains
active.
