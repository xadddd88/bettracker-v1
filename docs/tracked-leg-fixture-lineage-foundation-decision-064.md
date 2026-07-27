# Decision #064 — Tracked-Leg Fixture Lineage Foundation

**Date:** 2026-07-21  
**Proposed by:** CPO  
**Authorized by:** Founder  
**Status:** EXECUTED / VERIFIED / CLOSED — implementation merged via PR #186, PostgreSQL 17 Gate 3 merged via PR #231, and migration 025 applied once as `20260727060234_tracked_leg_fixture_lineage_025`. `create_tracked_bet_v2` remains service-role-only with no application caller.

## Purpose

Implement step 2 of the closed Decision #063 contract: an additive database
foundation that can preserve trusted fixture lineage on newly created Tracker
legs without changing the current application path.

The existing `create_tracked_bet` RPC remains the only application caller.
Decision #064 adds `create_tracked_bet_v2` for later controlled adoption; the application still does not call it.

## Baseline

Source of truth at authorization:

```txt
main: 696000616ee47db4ac9566d993cce13be3da8ed0
open PRs: 0
Decision #063: EXECUTED / CLOSED, DOCS-ONLY
Decision #064: next unreserved before this authorization
```

The current Tracker path stores ordered textual legs through migration 024.
The authoritative sports graph remains separate:

```txt
canonical_fixtures
  -> fixture_provider_links

POST /api/bets/tracked
  -> create_tracked_bet
  -> bets + bet_legs
```

Decision #064 does not connect the application route to the new RPC.

## Authorized Draft Artifacts

1. `supabase/migrations/025_tracked_leg_fixture_lineage.sql`
   - additive lineage and immutable snapshot columns on `bet_legs`;
   - legacy/v1 default state `unresolved / legacy / version 0`;
   - canonical fixture and provider-link foreign keys with
     `ON DELETE RESTRICT`;
   - fail-closed shape constraint;
   - insert-time live tuple/snapshot validation;
   - update-time lineage immutability trigger;
   - `create_tracked_bet_v2`.
2. `docs/decision-064-rollback.sql`
   - kept outside `supabase/migrations`;
   - blocks rollback if any non-legacy lineage row exists;
   - removes only Decision #064 objects.
3. Decision/status documentation.

## `create_tracked_bet_v2` Authority

The v2 input preserves the migration 024 financial and idempotency contract.
Each leg adds exactly one `lineage` object:

```json
{
  "contractVersion": 1,
  "source": "manual_unresolved",
  "canonicalFixtureId": null,
  "fixtureProviderLinkId": null
}
```

Allowed v1 lineage sources:

- `manual_unresolved`
- `scanner_unresolved`
- `fixture_picker_exact`
- `manual_candidate_review`

The client cannot supply `lineage_state`, provider, provider fixture ID,
kickoff, timezone, mapping confidence/method, or verification time.

For `fixture_picker_exact`, v2:

1. requires both UUID references;
2. locks and reads the canonical fixture and provider-link rows;
3. requires the link to belong to that fixture;
4. requires `mapping_confidence='exact'`;
5. requires a non-empty mapping method;
6. applies the explicit sport allowlist (`soccer -> football`,
   `tennis -> tennis`);
7. derives every trusted snapshot inside the transaction;
8. stores timezone as canonical `UTC`.

`high`, `medium`, `low`, `needs_review`, fuzzy name/time evidence, missing
mapping method, cross-fixture links, and unsupported sport mappings fail
closed before the first write.

## State and Immutability

- `verified`: complete exact tuple and server-derived snapshots.
- `unresolved`: all authoritative identity/snapshot fields are null.
- `needs_review`: all authoritative identity/snapshot fields are null.
- `legacy` version 0: the default for pre-existing rows and rows created by
  the unchanged v1 RPC.

All lineage fields are immutable after insert. Later correction requires a
separate one-way audited RPC and Decision; Decision #064 does not add one.

Both foreign keys use `ON DELETE RESTRICT`, so an identified fixture or link
cannot be deleted while a tracked leg references it.

## Idempotency

The v2 request hash contains:

- the normalized migration 024 payload;
- an explicit `create_tracked_bet_v2` contract marker;
- ordered per-leg contract version, source, canonical fixture ID, and provider
  link ID.

Server-derived snapshots are excluded from the hash. Therefore:

- identical replay returns the original bet and original snapshots;
- any lineage reference/source/version change conflicts with zero writes;
- later canonical kickoff or provider-link changes do not rewrite a stored
  snapshot and do not turn an exact replay into a new write.

## Validation Boundary

Decision #064 completed step 2 of the Decision #063 small-PR sequence. Financial/domain adversarial tests and migration apply/catalog verification are complete. The following remain separate future gates:

1. authenticated non-provider smoke;
2. shared DTO/Zod and versioned API adapter;
3. fixture picker;
4. mobile adoption;
5. legacy manual resolution;
6. result ingestion/grading;
7. settlement and financial production validation.

## Initial Draft Non-Authorization

The initial Decision/Draft performed or authorized:

```txt
Supabase migration apply: 0
Supabase reads/writes: 0
application caller changes: 0
web/mobile/API adoption: 0
provider calls: 0
provider result matching: 0
result writes: 0
grading callers: 0
schedulers: 0
settlement/payout/refund: 0
production deployment or smoke: 0
```

Decision #057 result/settlement holds and FP-001 remain active.


## Execution Receipt — 2026-07-27

- PR #231 merged Gate 3 as `f5f17385d711ccd1df323cd71be3448dd3e08d85`; the hermetic PostgreSQL 17 verifier and all repository CI jobs passed.
- Migration 025 applied successfully on the first attempt as `20260727060234_tracked_leg_fixture_lineage_025`.
- Read-only verification confirmed 12/12 columns, 3/3 validated constraints, 2/2 indexes, 2/2 enabled triggers, 3/3 functions, and `create_tracked_bet_v2` EXECUTE only for `service_role`.
- No bet was created, no rollback or retry ran, and env, application callers, provider/result/settlement paths, and production DB data were unchanged.
