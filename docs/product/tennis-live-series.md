# Tennis Live Series calculator

## Product boundary

The calculator is a manual training tool for one isolated tennis series. It
recalculates stake size from recorded outcomes and current operator-entered odds.
It does not place a bet, connect to a bookmaker, scrape odds, predict a winner,
or claim that stake sizing changes event probability.

Access is private and default OFF. Both navigation and the route are hidden
unless the authenticated user passes the server-side access check. The founder
keeps the dedicated `OWNER_USER_ID`; a short founder-controlled smoke test may
add specific Supabase auth user ids to `TENNIS_CALC_ALLOWED_USER_IDS`.

## State and authority

- PostgreSQL stores the series, steps, and payload-bound command ledger.
- The browser sends only operator inputs and optimistic version.
- The database derives loss, recommendation, target snapshot, and projected net
  result while holding the series row lock.
- All writes use server-only, service-role RPC calls.
- Client refresh restores the latest open series through authenticated RLS reads.
- Money and odds cross the application boundary as exact decimal strings.

## Product analytics

The approved event vocabulary is:

| Event | Emission point | Allowed properties |
| --- | --- | --- |
| `tennis_calculator_viewed` | gated page mounted | none |
| `tennis_series_created` | validated RPC success | `replayed`, `resulting_status` |
| `tennis_step_confirmed` | validated RPC success | `replayed`, `resulting_status` |
| `tennis_step_settled` | validated RPC success | `replayed`, `resulting_status`, `outcome` |
| `tennis_series_stopped` | validated RPC success | `replayed`, `resulting_status` |

No raw money, odds, match labels, IDs, or free text may enter telemetry. Rejected
commands are deliberately not instrumented in this phase because database error
details are not an analytics contract.

## Rollout runbook

1. Merge and deploy the database-authority corrective change.
2. Confirm production command tables are empty.
3. Apply migration 028 under separate approval.
4. Verify the replacement RPC signature, ACL, RLS, and rollback guard.
5. Rebase and publish the mobile UI and analytics changes.
6. Keep `TENNIS_CALC_ENABLED` default OFF during deployment.
7. Set the owner identifier, optionally set a comma-separated
   `TENNIS_CALC_ALLOWED_USER_IDS` tester allowlist, and then enable
   `TENNIS_CALC_ENABLED=true` only under separate approval.
8. For two already approved testers, run the founder-controlled private smoke in
   `docs/tennis/private-smoke-test.md`.
9. Run one founder-only canary series with a small isolated limit.
10. Verify server state, idempotent retries, analytics events, and no raw-value
   telemetry before considering any broader rollout.

Turning the feature OFF is the immediate application kill switch. Removing a
tester id from `TENNIS_CALC_ALLOWED_USER_IDS` immediately removes calculator
access for that user after the next deployment. If the
authority migration must be rolled back, use the guarded rollback that removes
confirmation entirely; it must never restore the insecure client-derived RPC
signature.
