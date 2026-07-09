# Execution Record — EPL Controlled Write & SportMonks Mapping Discovery (M1.2.e.2.b.2)

## Status

EXECUTED 2026-07-09 · Operator = Founder · Sanitized reports only — no tokens, no raw provider payloads.

Executes Decisions #042 (API-Football EPL dry-run + controlled write) and #043 (SportMonks
mapping discovery run) per `docs/sports-operator-runbook-m1-2-e-2-b-2.md`. Recorded by
Decision #044.

## Step 1 — EPL single-day dry-runs (Decision #042)

3 probes of the approved max 4 (league 39, season 2026, `dryRun: true`, 1 provider request each):

| Attempt | Date (UTC) | `fetched` | Result |
|---------|------------|-----------|--------|
| 1 | 2026-08-14 (Fri) | 0 | no EPL fixtures |
| 2 | 2026-08-15 (Sat) | 0 | no EPL fixtures |
| 3 | 2026-08-21 (Fri) | **1** | **write day selected** |

Sync run ids: `fixture-sync-2026-07-09T04-17-10-846Z-s928a176`,
`fixture-sync-2026-07-09T04-17-27-391Z-hpgl1kwm`,
`fixture-sync-2026-07-09T04-17-53-824Z-c3ifd4cd`.

The EPL 2026-27 season opens 2026-08-21 with a single Friday fixture — ideal for the
Decision #041 cap of 2 fixtures.

## Step 2 — Controlled fixture write (Decision #042)

**Deviation D1 (recorded):** the first write call ran before the Vercel redeploy had
propagated `SPORTS_FIXTURE_SYNC_WRITE_ENABLED=true` (env var was saved but no redeploy had
been triggered). The route behaved exactly as designed: `operatorConfirmed: true`,
`writeEnabled: false`, **zero writes**, but the provider fetch was consumed
(run `fixture-sync-2026-07-09T04-36-44-291Z-8vadecy6`). Total API-Football usage therefore
reached the 5-request envelope of the approved scope (4 probe budget partially unused: 3
probes + 2 write-call fetches).

Successful write after redeploy (run `fixture-sync-2026-07-09T04-41-34-153Z-ddowlgtd`):

```json
{
  "dryRun": false, "writeEnabled": true, "operatorConfirmed": true,
  "dateFrom": "2026-08-21", "dateTo": "2026-08-21", "season": "2026",
  "totals": {
    "fetched": 1, "insertedCanonicalFixtures": 1, "updatedCanonicalFixtures": 0,
    "insertedProviderLinks": 1, "updatedProviderLinks": 0, "failedWrites": 0
  }
}
```

`SPORTS_FIXTURE_SYNC_WRITE_ENABLED` was removed from Vercel and production redeployed
immediately after the write, per runbook Step 2.4.

## Step 3 — Canonical fixture created

| Field | Value |
|-------|-------|
| `canonical_fixtures.id` | `92afd570-399a-48b9-915a-e1ffaf52a71c` |
| Competition | Premier League (england), season 2026, Regular Season - 1 |
| Fixture | Arsenal vs Coventry City |
| Kickoff (UTC) | 2026-08-21 19:00 |
| Status | scheduled |
| Provider link | `api_football:1557367`, mapping_confidence `exact` |

## Step 4 — SportMonks mapping discovery (Decision #043)

**Deviation D2 (recorded):** the first two discovery calls failed with a sanitized
`auth [401]` error — the production `SPORTMONKS_TOKEN` value was invalid (no live SportMonks
call had ever been made from production before this run). Guardrails held: the token never
appeared in any URL or error text, and the 401 aborted before the discovery request budget
was consumed. The operator's replacement token was validated out-of-band from the operator
machine with a single metadata request (`GET /v3/football/leagues/8`, Authorization header,
1 rate-limit unit on the `leagues` entity, not part of the discovery fixtures budget) —
HTTP 200, league name "Premier League", confirming EPL (league 8) is inside the plan.
Production env was then corrected and redeployed.

Discovery run `sportmonks-mapping-discovery-2026-07-09T04-58-46-908Z-8i1oc162`:

```json
{
  "provider": "sportmonks", "sportmonksLeagueId": "8",
  "maxProviderRequests": 2, "providerRequestsUsed": 1,
  "pagination": [{ "requestDate": "2026-08-21", "count": 1, "hasMore": false }],
  "rateLimit": { "remaining": 2499, "resetsInSeconds": 3600, "requestedEntity": "Fixture" },
  "targets": [{
    "canonicalFixtureId": "92afd570-399a-48b9-915a-e1ffaf52a71c",
    "matchInput": {
      "kickoffAtUtc": "2026-08-21T19:00", "homeTeamName": "Arsenal",
      "awayTeamName": "Coventry", "competitionName": "Premier League"
    },
    "status": "matched", "confidence": "high", "eligibleForProviderLink": true,
    "candidatesAtKickoff": 1,
    "candidate": {
      "sportmonksFixtureId": "19722203", "sportmonksName": "Arsenal vs Coventry City",
      "startingAt": "2026-08-21 19:00:00", "leagueId": "8", "seasonId": "28083",
      "stateId": "1", "homeParticipant": "Arsenal", "awayParticipant": "Coventry City"
    },
    "reasons": ["kickoff minute match + both team names fuzzy-matched + home/away orientation confirmed"]
  }],
  "stopReasons": [], "writes": "none"
}
```

**Outcome:** single candidate at the kickoff minute, confidence `high`,
`eligibleForProviderLink: true`, zero writes. Per Decision #037 rubric this target qualifies
for a controlled provider-link write — which remains a later, separately scoped decision.

## Provider request accounting

| Provider | Requests | Detail |
|----------|----------|--------|
| API-Football | 5 | 3 dry-run probes + 1 no-write fetch (D1) + 1 write fetch |
| SportMonks (fixtures) | 1 of 2 | discovery run, page 1, `has_more: false` |
| SportMonks (leagues) | 1 | out-of-band token validation from operator machine (D2) |

Two SportMonks 401 responses (D2) consumed no rate-limit units and no discovery budget.

## Operational hygiene notes

- Secrets touched during execution lived briefly in local operator files (including a
  OneDrive-synced copy of a scratch `api.txt` holding the operator token). All local token
  files are to be deleted post-run; rotating `SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN` afterwards
  is recommended as cheap hygiene.
- The Decision #039/#042 OPEN question (API-Football dashboard plan name) was **not** closed
  in this run — the operator has not yet reported the plan name. It stays OPEN.

## Next step

Controlled provider-link write for `sportmonks:19722203 → 92afd570-399a-48b9-915a-e1ffaf52a71c`
(single row in `fixture_provider_links`) — Decision #045 candidate, requires its own scope
approval and implementation; nothing is written manually.
