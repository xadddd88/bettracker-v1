# M1.2.b Fixture Sync Runbook

Status: M1.2.b dry-run done; M1.2.c write safety guard draft for PR review

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

## M1.2.c write safety guardrails

These guardrails prepare controlled fixture write validation without enabling write mode.

For `dryRun=false`, the route rejects unsafe request shapes before any provider fetch:

- exactly one provider is required
- `dateFrom` must equal `dateTo`

After the provider fetch, write-shaped requests are still capped before any Supabase write:

- max fetched fixtures: `25`
- if fetched fixtures exceed `25`, the route returns `400` and writes nothing

Dry-run behavior is unchanged. `dryRun=true` can still request multiple providers and multiple days within the existing 7-day M1.2.b date-range limit.

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

## Safety notes

- Keep `SPORTS_FIXTURE_SYNC_WRITE_ENABLED` absent/off until the separate controlled M1.2.c write validation is explicitly approved.
- No provider token is returned in API responses.
- No raw provider payload is returned from dry-run responses.
- Provider request URLs are sanitized through the existing provider error path.
- The route is `nodejs` runtime only because it uses Node crypto for timing-safe token comparison.
