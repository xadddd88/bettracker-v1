# Controlled SportMonks Provider-Link Write Scope (M1.2.e.2.b.3)

## Status

SCOPE + IMPLEMENTATION (Decision #045). Execution operator-gated; write flag default OFF.

Last updated: 2026-07-09

## Context

Decision #044 recorded the discovery result: canonical fixture
`92afd570-399a-48b9-915a-e1ffaf52a71c` (Arsenal vs Coventry City, Premier League 2026-27 R1,
kickoff 2026-08-21 19:00 UTC) matched SportMonks fixture `19722203` with a single candidate at
the kickoff minute, confidence `high`, `eligibleForProviderLink: true` (discovery run
`sportmonks-mapping-discovery-2026-07-09T04-58-46-908Z-8i1oc162`). Per Decision #043 the
provider-link write is a separately scoped step — this document is that scope.

## Approved scope — exactly one row

`POST /api/admin/sports/mapping/provider-link` writes at most ONE `fixture_provider_links` row:

| Column | Pinned value |
|--------|--------------|
| `canonical_fixture_id` | `92afd570-399a-48b9-915a-e1ffaf52a71c` |
| `provider` | `sportmonks` |
| `provider_fixture_id` | `19722203` |
| `mapping_confidence` | `high` (from the Decision #044 discovery rubric) |
| `mapping_method` | `name_time_match` |
| `raw_provider_payload` | provenance only: discovery run id + the Decision #044 sanitized candidate |
| `provider_updated_at` | `null` |
| `sync_run_id` | fresh `sportmonks-provider-link-write-…` run id |

Both link sides are zod literals in the route schema and constants in
`lib/providers/sportmonks-provider-link-write.ts` — the route cannot write anything else.
Widening any value requires a new PR + CPO approval.

## Guardrails

- **ZERO provider calls.** The write uses ledger-recorded discovery evidence; nothing is
  re-fetched. The safety tests assert the network is never touched.
- **Triple write gate:** `dryRun: false` AND `SPORTS_PROVIDER_LINK_WRITE_ENABLED=true` (env,
  default absent) AND operator confirmation `WRITE_SPORTMONKS_PROVIDER_LINK_M1_2_E_2_B_3`.
- **Operator token:** same bearer as fixture sync (`SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN`),
  timing-safe comparison; 503 unconfigured / 401 mismatch.
- **DB preflight re-verifies the discovery preconditions at write time** and blocks on drift:
  1. canonical fixture exists;
  2. still `football` + `scheduled`;
  3. kickoff minute (UTC) still `2026-08-21T19:00`;
  4. the `api_football` provenance link is still present;
  5. no conflicting `sportmonks` link on the fixture (identical link → idempotent
     `alreadyLinked`, nothing written);
  6. `sportmonks:19722203` not claimed by another canonical fixture.
- **Sanitized report only** — no tokens, no raw provider payloads, no odds fields.

## Operator runbook

Set once (values from Vercel env, never echo):

```bash
export OP_TOKEN='<SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN>'
export BASE='https://btdk.app'
```

**Step 1 — preflight dry-run (no env flag needed):**

```bash
curl -sS -X POST "$BASE/api/admin/sports/mapping/provider-link" \
  -H "Authorization: Bearer $OP_TOKEN" -H "content-type: application/json" \
  -d '{
    "dryRun": true,
    "provider": "sportmonks",
    "canonicalFixtureId": "92afd570-399a-48b9-915a-e1ffaf52a71c",
    "sportmonksFixtureId": "19722203",
    "operatorConfirm": "WRITE_SPORTMONKS_PROVIDER_LINK_M1_2_E_2_B_3"
  }'
```

Expect `success: true`, `preflight.passed: true`, `writes: "none"`.

**Step 2 — the write:** in Vercel set `SPORTS_PROVIDER_LINK_WRITE_ENABLED=true` (Production
only) and **Redeploy**; repeat the Step 1 command with `"dryRun": false`. Expect
`writes: "single_provider_link"`, `wrote.insertedProviderLinks: 1`.

**Step 3 — immediately** remove `SPORTS_PROVIDER_LINK_WRITE_ENABLED` in Vercel and Redeploy.

**Step 4 —** paste the sanitized report back; Claude verifies the row via Supabase MCP and
records the execution in the ledger.

## Failure notes

- `503` = operator token not configured; `401` = wrong token; `400` = body outside the pinned
  scope or wrong confirmation phrase.
- `success: false` with `preflight.passed: false` = discovery preconditions drifted — stop,
  report back; nothing was written.
- `alreadyLinked: true` = the link already exists (idempotent re-run); nothing was written.
