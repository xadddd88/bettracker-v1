# M1.2.b Fixture Sync Runbook

Status: M1.2.b dry-run and M1.2.c controlled fixture write validation complete

## Scope

This milestone implements fixture sync only:

- API-Football football fixtures
- API-Tennis tennis fixtures
- dry-run first in Vercel runtime
- optional guarded writes to `canonical_fixtures` and `fixture_provider_links`

Explicitly out of scope:

- odds
- results
- SportMonks enrichment
- cross-provider mapping
- cron
- Scout / Analyst / settlement / bet-builder
- user-facing UI

## Operator route

```txt
POST /api/admin/sports/fixtures/sync
```

The route requires an operator token on every call:

```txt
Authorization: Bearer <SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN>
```

or:

```txt
x-bettracker-sync-token: <SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN>
```

## Required environment variables

Existing provider env:

- `API_FOOTBALL_KEY`
- `API_TENNIS_KEY`
- `SPORTMONKS_TOKEN` remains required by the shared provider env validation, but M1.2.b does not call SportMonks enrichment.

New sync env:

- `SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN` — required to call the route.
- `SPORTS_FIXTURE_SYNC_WRITE_ENABLED` — must be exactly `true` to allow writes.

## Dry-run request

Dry-run is the first expected production validation path. It fetches and parses provider fixtures, returns sanitized counts, and writes nothing.

```bash
curl -X POST 'https://btdk.app/api/admin/sports/fixtures/sync' \
  -H 'Authorization: Bearer <operator-token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "providers": ["api_football", "api_tennis"],
    "dateFrom": "2026-07-01",
    "dateTo": "2026-07-02",
    "dryRun": true
  }'
```

The response contains only counts and sync metadata. It does not return raw provider payloads.

## Write request

Writes require all three gates:

1. Request body has `"dryRun": false`.
2. Vercel env has `SPORTS_FIXTURE_SYNC_WRITE_ENABLED=true`.
3. Request body has `"operatorConfirm": "WRITE_FIXTURE_SYNC_M1_2_B"`.

```bash
curl -X POST 'https://btdk.app/api/admin/sports/fixtures/sync' \
  -H 'Authorization: Bearer <operator-token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "providers": ["api_football"],
    "dateFrom": "2026-07-01",
    "dateTo": "2026-07-01",
    "dryRun": false,
    "operatorConfirm": "WRITE_FIXTURE_SYNC_M1_2_B"
  }'
```

## Write behavior

The write path touches only:

- `canonical_fixtures`
- `fixture_provider_links`

For a known `(provider, provider_fixture_id)` link, the sync updates the existing canonical fixture and provider link.

For a new provider fixture, the sync inserts a canonical fixture and then inserts the provider link with:

- `mapping_confidence = 'exact'`
- `mapping_method = 'provider_fixture_id'`
- `sync_run_id = <generated sync run id>`

## M1.2.c write safety guard

`SPORTS_FIXTURE_SYNC_WRITE_ENABLED` remains absent/off except during an explicit controlled write validation window.

The write path is intentionally narrower than dry-run:

1. Write requests must include exactly one provider.
2. Write requests must be for exactly one day (`dateFrom === dateTo`).
3. Write requests are capped at 25 fetched fixtures.
4. If fetched fixtures exceed the cap, the route returns `400` with `"fixture write safety cap exceeded"` and writes nothing.

Dry-run behavior is unchanged:

- multiple providers remain allowed
- date ranges up to the existing 7-day safety limit remain allowed
- write counters must remain 0

## M1.2.c controlled write validation record

Completed on 2026-07-05 against production.

Controlled scope:

- provider: `api_football`
- date: `2026-12-31`
- `competitionIds`: none
- fetched fixtures: 2

Final dry-run before write:

- `success`: true
- `dryRun`: true
- `writeEnabled`: false
- `operatorConfirmed`: false
- fetched: 2
- all write counters: 0
- `SPORTS_FIXTURE_SYNC_WRITE_ENABLED`: absent

Temporary write window:

1. `SPORTS_FIXTURE_SYNC_WRITE_ENABLED=true` was added to Vercel Production.
2. Production was redeployed.
3. A dry-run confirmed `writeEnabled=true`, fetched 2, and all write counters remained 0.
4. Only the selected one-provider / one-day scope was written.
5. The same write was repeated once for idempotency.
6. `SPORTS_FIXTURE_SYNC_WRITE_ENABLED` was removed immediately afterward.
7. Production was redeployed and a final dry-run confirmed `writeEnabled=false`.

First controlled write:

- `syncRunId`: `fixture-sync-2026-07-05T11-45-41-382Z-a7th02gl`
- `dryRun`: false
- `writeEnabled`: true
- `operatorConfirmed`: true
- fetched: 2
- `insertedCanonicalFixtures`: 2
- `updatedCanonicalFixtures`: 0
- `insertedProviderLinks`: 2
- `updatedProviderLinks`: 0
- `failedWrites`: 0

Idempotency write:

- `syncRunId`: `fixture-sync-2026-07-05T11-46-00-677Z-sd7qzxxb`
- fetched: 2
- `insertedCanonicalFixtures`: 0
- `updatedCanonicalFixtures`: 2
- `insertedProviderLinks`: 0
- `updatedProviderLinks`: 2
- `failedWrites`: 0

Supabase verification:

- `fixture_provider_links`: 2
- linked `canonical_fixtures`: 2
- `provider_fixture_id` present: 2/2
- `mapping_confidence = 'exact'`: 2/2
- `mapping_method = 'provider_fixture_id'`: 2/2
- `sync_run_id` present: 2/2
- duplicate provider links: 0
- raw provider payload selected or surfaced in the report: no

Final production state:

- `SPORTS_FIXTURE_SYNC_WRITE_ENABLED`: absent/off
- `writeEnabled`: false
- production deployment: `dpl_GiZatcrRAdxaT9ru1QdDSM95BdGP`
- production alias: https://btdk.app
- deployed commit: `ad8ce53645509fbc38697901045f05074e1e89d2`

No broad write, multi-provider write, or multi-day write was run. Odds, results, SportMonks enrichment, cross-provider mapping, cron, Scout, Analyst, and UI remained out of scope.

## Safety notes

- No provider token is returned in API responses.
- No raw provider payload is returned from dry-run responses.
- Provider request URLs are sanitized through the existing provider error path.
- The route is `nodejs` runtime only because it uses Node crypto for timing-safe token comparison.
- Keep `SPORTS_FIXTURE_SYNC_WRITE_ENABLED` absent/off until a future controlled write test is explicitly approved.
- Do not run additional fixture writes without a fresh selected scope, dry-run confirmation, temporary write window, idempotency check, Supabase verification, and immediate write-flag removal.
