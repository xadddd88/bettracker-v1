# Operator Runbook — EPL Re-Target & SportMonks Mapping Discovery (M1.2.e.2.b.2)

## Status

EXECUTED 2026-07-09 — see `docs/sportmonks-discovery-execution-record-m1-2-e-2-b-2.md` (Decision #044). Kept for reference; re-execution requires a new scope decision.

Last updated: 2026-07-09

Executes the Decision #041 sequence via Decisions #042 (API-Football EPL dry-run + controlled write) and #043 (SportMonks discovery run). Founder granted blanket conversation approval on 2026-07-07; execution remains operator-gated by the bearer token, which exists only in Vercel env (`SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN`).

Hard rules:

- never paste the operator token, provider keys, or raw provider payloads into chat, docs, PRs, or issues
- paste back only the sanitized JSON reports the routes return
- run steps in order; stop on any unexpected result

Set once in your shell (value from Vercel env, never echo it):

```bash
export OP_TOKEN='<SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN>'
export BASE='https://btdk.app'
```

## Step 1 — EPL single-day dry-run (Decision #042; 1 provider request per attempt)

Goal: find an England Premier League 2026-27 match day with **1-2 fixtures** (typical: opening Friday, or a Monday). Start with a candidate Friday in August 2026 and adjust the date by what the report shows.

```bash
curl -sS -X POST "$BASE/api/admin/sports/fixtures/sync" \
  -H "Authorization: Bearer $OP_TOKEN" -H "content-type: application/json" \
  -d '{
    "providers": ["api_football"],
    "dateFrom": "2026-08-14",
    "dateTo":   "2026-08-14",
    "competitionIds": ["39"],
    "season": "2026",
    "dryRun": true
  }'
```

- `report.providers[0].fetched` = number of EPL fixtures that day.
- If `fetched` is 0 → try the next candidate day (2026-08-15, 2026-08-17, …). Each attempt = 1 provider request.
- If `fetched` is 1 or 2 → this is the write day, go to Step 2.
- If `fetched` > 2 → try another day (Decision #041 caps the controlled write at 2 fixtures).
- Budget: stop after 4 attempts and report back.
- Also note the API-Football account plan shown in your dashboard (closes the Decision #039 OPEN plan question) — plan name only, no keys.

## Step 2 — Controlled fixture write (Decision #042; 1 provider request)

1. In Vercel → Project → Settings → Environment Variables: set `SPORTS_FIXTURE_SYNC_WRITE_ENABLED=true` (Production), redeploy.
2. Repeat the Step 1 command for the chosen day with:

```bash
    "dryRun": false,
    "operatorConfirm": "WRITE_FIXTURE_SYNC_M1_2_B"
```

3. Expect `report.totals.insertedCanonicalFixtures` ∈ {1,2} (or `updated…` if re-run — idempotent).
4. **Immediately** remove `SPORTS_FIXTURE_SYNC_WRITE_ENABLED` in Vercel, redeploy.
5. Paste the sanitized report back into the chat.

## Step 3 — Capture the new canonical fixture UUIDs

Claude can read them via the Supabase MCP after Step 2 (no action needed), or view them in Supabase → Table Editor → `canonical_fixtures`.

## Step 4 — SportMonks mapping discovery (Decision #043; max 2 provider requests, read-only)

Replace the UUIDs with the Step 3 values (1 or 2):

```bash
curl -sS -X POST "$BASE/api/admin/sports/mapping/sportmonks-discovery" \
  -H "Authorization: Bearer $OP_TOKEN" -H "content-type: application/json" \
  -d '{
    "dryRun": true,
    "provider": "sportmonks",
    "sportmonksLeagueId": "8",
    "canonicalFixtureIds": ["<uuid-1>", "<uuid-2>"],
    "maxProviderRequests": 2,
    "operatorConfirm": "RUN_SPORTMONKS_MAPPING_DISCOVERY_M1_2_E_2_B_2"
  }'
```

- The route is read-only (`writes: "none"`), page 1 only, token travels in a header.
- Paste the sanitized report back. Expected outcomes per Decision #037: only a single `exact`/`high` candidate makes a target `eligibleForProviderLink: true`; ambiguous/not_found/medium block mapping with zero writes.

## Step 5 — After discovery

Claude records the result in the ledger. If a target is `eligibleForProviderLink`, the **controlled provider-link write** is the next separately scoped step (Decision #044 candidate) — do not write anything manually.

## Failure notes

- `503` = operator token not configured; `401` = wrong token.
- `429` from the provider = rate limit; stop and report.
- Fixture-sync `pagination overflow` error = the day had a multi-page response; pick another day.
- Discovery `has_more=true` stop = league-day exceeded 50 fixtures (should never happen for one EPL day); report back.
