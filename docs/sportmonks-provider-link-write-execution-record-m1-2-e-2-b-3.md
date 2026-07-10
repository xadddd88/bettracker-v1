# Execution Record — Controlled SportMonks Provider-Link Write (M1.2.e.2.b.3)

## Status

EXECUTED 2026-07-10 · Operator = Founder (Claude drove the calls and the Vercel dashboard
steps at the founder's live instruction) · Sanitized reports only. Recorded by Decision #046.

Executes Decision #045 per the runbook in
`docs/sportmonks-provider-link-write-scope-m1-2-e-2-b-3.md`.

## Preflight dry-run

Run `sportmonks-provider-link-write-2026-07-10T14-12-43-466Z-vryd3pd4`: all six checks passed
(`canonical_fixture_exists`, `fixture_is_scheduled_football`,
`kickoff_minute_matches_discovery`, `api_football_provenance_link_exists`,
`no_conflicting_sportmonks_link_on_fixture`, `provider_fixture_id_unclaimed`),
`alreadyLinked: false`, `writes: "none"`, `providerRequestsUsed: 0`.

## The write

Run `sportmonks-provider-link-write-2026-07-10T14-13-04-277Z-mkuvx3k4`:

```json
{
  "dryRun": false, "writeEnabled": true, "operatorConfirmed": true,
  "provider": "sportmonks",
  "canonicalFixtureId": "92afd570-399a-48b9-915a-e1ffaf52a71c",
  "providerFixtureId": "19722203",
  "providerRequestsUsed": 0,
  "preflight": { "passed": true },
  "alreadyLinked": false,
  "wrote": { "insertedProviderLinks": 1, "failedWrites": 0, "errors": [] },
  "writes": "single_provider_link"
}
```

Row verified in production via service-role read immediately after: the canonical fixture
(Arsenal vs Coventry City, kickoff 2026-08-21 19:00 UTC) now carries BOTH provider links —
`api_football:1557367` (`exact`, `provider_fixture_id`) and `sportmonks:19722203` (`high`,
`name_time_match`, payload provenance pointing at discovery run
`sportmonks-mapping-discovery-2026-07-09T04-58-46-908Z-8i1oc162`). This is the first canonical
fixture with a complete dual-provider mapping chain — the M1.2 mapping path
(fixture sync → discovery → provider link) is proven end-to-end.

`SPORTS_PROVIDER_LINK_WRITE_ENABLED` was deleted from Vercel and production redeployed
immediately after the write.

## Provider request accounting

**ZERO provider calls** across the entire Decision #045 execution (preflight + write) — the
write is evidence-based per the scope; `providerRequestsUsed: 0` in both reports.

## Deviations & notes

- **D3 — write flag pre-set by founder.** `SPORTS_PROVIDER_LINK_WRITE_ENABLED=true` already
  existed in Vercel (Production and Preview) before execution began: the founder created it
  on 2026-07-09, right after the PR #125 merge summary announced the upcoming operator step —
  ahead of the runbook's "flag on" step. Consequence: the write gate was open at preflight
  time. Impact: none beyond ordering — the write still required the operator token, the
  pinned body, the confirmation phrase, and a passing DB preflight; the route can only write
  the single approved row. The flag was removed immediately after the write.
- **Operator token rotated** (planned hygiene from Decision #044): Claude generated a fresh
  64-char token locally, the founder installed it in Vercel; the old token — which had
  transited OneDrive — is dead. Two 401 preflight attempts occurred before the token
  redeploy propagated (no cost, no leakage).
- **Browser-driven dashboard steps.** At the founder's live instruction («сделай дальше
  сам»), Claude performed the final token redeploy, the flag deletion, and the post-deletion
  redeploy directly in the founder's authenticated Vercel dashboard via the Chrome extension.
  All three actions were confirmations of steps already scoped in the runbook.
- All local token scratch files were deleted after execution.

## Next step

The mapping chain for this fixture is complete. Any further provider-link writes, enrichment
reads (SportMonks lineups/events per the M1.2.e track), or odds work require their own scope
decisions. Next free ledger number after #046: #047.
