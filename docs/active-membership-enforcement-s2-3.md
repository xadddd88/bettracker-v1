# Security S2.3 — Direct Data API and RPC Membership Enforcement

Date: 2026-08-11
Baseline: `main@47da4e8d9442f75b2987885cb3ab1a04dc9a6d7b`
Mode: repository-only implementation; review, CI, and controlled rollout remain
separate gates

No production migration has been applied. No Auth record, membership row,
session, user data, secret, or external configuration was changed while this
slice was prepared.

## Closed security boundary

S2.2 rejects inactive membership in protected Web navigation and all user API
routes, but a retained valid Supabase JWT can call PostgREST directly. The S2.3
audit confirmed two residual boundaries:

1. all 16 client-readable base tables authorize `authenticated` through
   ownership-only or shared `USING (true)` policies and none consults live
   membership;
2. all eight authenticated public `SECURITY DEFINER` RPCs reject only a null
   `auth.uid()` and none consults live membership before replay, row locks,
   reads, or writes.

The approved invariant remains exact: active membership means a live
`public.beta_access` row with `status = 'used'` and
`used_by_user_id = auth.uid()`. Approved, invited, revoked, missing, foreign,
and unauthenticated states are inactive.

## Data API enforcement map

Migration
`20260811160255_active_membership_data_api_rpc_enforcement.sql` adds one policy
named `active_membership_required` to each client-readable base table:

- `ai_analysis_runs`
- `bankroll_transactions`
- `bankrolls`
- `bet_legs`
- `beta_feedback`
- `bets`
- `canonical_fixtures`
- `coaching_sessions`
- `decisions`
- `global_config`
- `market_catalog`
- `market_opportunities`
- `odds_snapshots`
- `profiles`
- `tennis_series`
- `tennis_series_steps`

Every policy is authenticated-only, `AS RESTRICTIVE FOR ALL`, and contains both
of these expressions:

```sql
USING ((SELECT private.is_active_member()))
WITH CHECK ((SELECT private.is_active_member()))
```

Restrictive policies are ANDed with applicable permissive policies. They cannot
grant a new command or replace tenant ownership: an active user must still pass
the existing ownership or shared-data predicate, and commands without an
existing permissive policy remain denied. `service_role` is unaffected.

`odds_snapshots_public` is a `security_invoker` view and cannot receive an RLS
policy of its own. Its existing SELECT-only ACL and nine-column projection are
unchanged; the restrictive policy on `odds_snapshots` gates both the view and
the direct safe-column base-table path.

The seven migration-031 deny-all tables and the service-only
`decision_056_execution_ledger` are intentionally excluded. They already have
no effective client row path.

## Authenticated RPC enforcement map

The migration replaces the latest reviewed bodies for exactly these signatures:

1. `public.adjust_bankroll(text,numeric,text,text)`
2. `public.cancel_pending_bet(uuid,text)`
3. `public.complete_onboarding()`
4. `public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)`
5. `public.save_user_settings(text,text,numeric,numeric,boolean,text)`
6. `public.settle_bet(uuid,text)`
7. `public.update_decision_action(uuid,text)`
8. `public.update_opportunity_status(uuid,text,uuid)`

Each body retains its original null-identity check. Immediately afterward, and
before input validation, idempotent replay, a read, a row lock, or a write, it
adds exactly one fail-closed assertion:

```sql
IF private.is_active_member() IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'inactive_membership'
    USING ERRCODE = '42501';
END IF;
```

The schema-qualified helper is mandatory because `private` is deliberately
absent from every outer function's `search_path`. SQLSTATE `42501` represents an
authorization failure, while the stable `inactive_membership` token avoids
disclosing membership details.

No service-role bypass is added. A service-role call without a real user subject
continues to fail the existing null-identity check. Existing identity derivation,
ownership, validation, state machines, no-overdraft rules, payout arithmetic,
payload-bound idempotency, replay behavior, concurrency locks, signatures,
defaults, return types, volatility, owners, ACLs, and fixed search paths remain
unchanged.

`place_bet_from_decision` stays quarantined to `service_role`; retired and
service-only functions are not reopened.

## Drift-safe migration contract

Before persistent DDL, the transaction verifies:

- the exact S2.1 helper body, `postgres` owner, stability, definer status, empty
  search path, and complete non-owner, non-grantable ACL set of only
  `authenticated`/`service_role`;
- exactly eight authenticated public definer functions;
- every exact RPC signature, `postgres` owner, volatility, definer flag, fixed
  search path, complete non-owner, non-grantable ACL set of only
  `authenticated`/`service_role`, absence of an existing assertion, and the
  reviewed raw `prosrc` MD5 set;
- the exact effective authenticated base-relation inventory equals the reviewed
  16 tables under both relation-level and any-column privileges, with no
  additional table carrying a client Data API path;
- the exact authenticated view/materialized-view/foreign-table inventory equals
  only `odds_snapshots_public`;
- all 16 base relations exist with RLS enabled and do not already carry the new
  policy;
- no predecessor policy already invokes the helper;
- `odds_snapshots_public` is still a security-invoker view.

Any mismatch aborts before the first persistent policy. Postflight proves that
all 16 restrictive policies have the exact role, command, restrictive mode and
membership expressions on only the intended RLS-enabled relations; the effective
base-table and non-table inventories are still exact; the reviewed view remains
`security_invoker`; every RPC keeps the same OID, owner and search path; each
body contains one assertion; the exact authenticated definer inventory remains
eight; and the complete RPC/helper ACLs contain no third role, grant option,
`PUBLIC`, or `anon` execution.

Four functions have two accepted raw predecessors: the current production body
was historically installed without source comments, while a clean tracked
rebuild retains those comments. A read-only comparison proved normalized SQL
tokens identical for all eight functions. The migration accepts only those two
exact raw hashes for the four affected signatures and rejects any third body.

## Verification

Static source contract:

```bash
npm run test:active-membership-enforcement-s2-3
```

The test extracts every predecessor function body from its authoritative
migration, removes the single new assertion from the S2.3 body, strips comments
and formatting, and requires the remaining SQL tokens to be identical. It also
checks the exact eight-RPC inventory, insertion order, predecessor fingerprints,
search paths, ACL reset, SQLSTATE, table-level plus column-level relation
inventory, exact view treatment, workflow wiring, and this evidence record.

Disposable PostgreSQL 17 contract:

```bash
bash scripts/verify-active-membership-enforcement-s2-3.sh \
  --confirm-disposable \
  postgresql://postgres:postgres@localhost:5432/bettracker_s23_disposable
```

Provision `bettracker_s23_disposable` as a new PostgreSQL 17 database before
running the command; CI obtains it from a new disposable `postgres:17`
service. The verifier requires the explicit `--confirm-disposable` flag and
accepts only a query-free canonical `postgresql:` URL for that exact database
on `localhost`, `127.0.0.1`, or `[::1]`, with an explicit port. It refuses
secondary authorities, every URI query parameter, fragments, and any other
database name. Before invoking `psql`, it clears ambient libpq host, address,
port, database, service and service-file defaults and disables psql startup
files, so the validated URI remains the only destination authority.

The verifier does not trust an externally planted marker. In the same database
transaction as the first bootstrap mutation, it requires PostgreSQL 17, the
exact database name, an empty database comment, no non-system user schema, no
relation/routine/type in `public`, and no pre-existing `anon`, `authenticated`,
or `service_role` role. The cluster may contain only the target and PostgreSQL's
`postgres`, `template0`, and `template1` databases. Only after those checks pass
does that connection write a cryptographically random, run-bound marker and
continue with bootstrap DDL.

Every later `psql` process begins a transaction and verifies the exact run-bound
marker, database name, PostgreSQL major version, expected client-role inventory,
and dedicated-cluster database inventory in that same session before accepting
test or migration SQL. A stable wrong endpoint, a connection-switched endpoint,
or a reused database therefore fails closed before the next mutation. The target
and cluster are single-use: recreate the disposable cluster before rerunning the
verifier.
`--check-database-url` remains a non-connecting syntax check and enforces the
same URL identity without accepting the destructive confirmation.

It reconstructs the exact helper and eight predecessor function bodies, creates
all 16 RLS surfaces and the security-invoker view, applies the real migration,
and proves:

- active direct reads remain available;
- approved, invited, revoked, missing, and unauthenticated reads fail closed;
- revoked `beta_feedback` INSERT is denied while an active owner succeeds;
- every RPC returns `inactive_membership` with `42501` for approved, invited,
  revoked, and missing membership before later logic;
- the original unauthenticated guard and service-role RLS contract remain;
- migration preflight rejects an extra column-granted table, authenticated owner
  view, unexpected helper owner, or third RPC grantee;
- emergency preflight rejects a weakened same-named policy, disabled table RLS,
  owner-executed view, and ninth authenticated definer RPC;
- the postflight catalog contains exactly 16 semantic policies, the one reviewed
  security-invoker view, eight guarded RPCs, and only the intended non-grantable
  EXECUTE grantees;
- the positive emergency action leaves all 16 policies active and exactly the
  eight reviewed RPCs callable only by `service_role`.

The PostgreSQL verifier is also a dedicated CI job in
`.github/workflows/preview-tests.yml`. Existing S2.1, S2.2, financial, domain,
agent, tennis, quarantine, Advisor, typecheck, lint, build, and preview suites
remain required regressions.

## Controlled rollout gates

Repository merge does not authorize production apply. A production rollout
requires a separate current-state approval and must run in this order:

1. confirm S2.1 is applied and S2.2 remains deployed;
2. reconcile every Auth user to the intended live membership state by explicit
   owner decision;
3. repeat read-only relation, policy, function, owner, ACL, search-path, body
   fingerprint, Advisor, and membership-lifecycle preflight;
4. apply the exact reviewed migration as one bounded transaction;
5. run read-only postflight and controlled active/inactive direct Data API and
   RPC probes without exposing user data;
6. observe authorization errors and core product health before declaring the
   full S2 finding closed.

Authorization is evaluated at the assertion's database snapshot. A revocation
committed before the check is denied. A transaction already authorized before a
concurrent revocation may finish; a stronger hard cutoff would require a shared
membership-row locking protocol and is outside this slice.

## Fail-closed rollback

Restoring the old authenticated RPC bodies or dropping the restrictive policies
would deliberately reopen the vulnerability. That is not an acceptable
automatic rollback.

If a guarded RPC body causes a production regression, the fail-closed emergency
action is to revoke `authenticated` EXECUTE on the exact eight signatures while
retaining the Data API policies, S2.1 helper, data, audit history, and all
service-only boundaries. This creates a temporary feature outage without
restoring revoked-user access. A reviewed forward fix can then restore the exact
grants. Never drop/recreate the functions, weaken RLS, restore `PUBLIC`/`anon`,
or mutate membership rows as a rollback shortcut.

The reviewed command is recorded in
`docs/active-membership-enforcement-s2-3-emergency-stop.sql`. Its preflight
requires the exact eight-function authenticated definer inventory, exact RPC
ACLs, exact effective 16-table plus one-view Data API inventory, exact
`security_invoker` view mode, and exact semantic tuple on all 16 RLS-enabled
tables. Its postflight requires no authenticated public definer RPC, only
non-grantable `service_role` execution on the eight signatures, and unchanged
exact relations, activation modes, and policies. The file is not invoked by
deployment or the migration; CI exercises it only against disposable PostgreSQL
17.

## Deferred non-blocking hardening

Historical broad ACL bits remain on `beta_feedback`, `global_config`,
`canonical_fixtures`, and `market_catalog`. Current RLS leaves no additional
effective row path except the intended authenticated feedback INSERT. ACL
minimization and a database message-length constraint are worthwhile but are a
separate least-privilege change, not prerequisites for S2.3.

Mobile currently models a restored Auth session rather than explicit live
membership state. Database denial closes the security boundary; a dedicated
access-denied/service-unavailable mobile experience belongs to a later UX slice
and is the point where Claude Design would receive a brief.

## Research inputs

The implementation follows current primary-source guidance:

- Supabase treats table grants and RLS as separate authorization layers and
  recommends calling a database function from RLS when the control must apply
  beyond the Data API: <https://supabase.com/docs/guides/api/securing-your-api>
- Supabase recommends security-invoker functions by default and a fixed search
  path for unavoidable definer functions:
  <https://supabase.com/docs/guides/database/functions>
- PostgreSQL documents restrictive-policy composition and `CREATE OR REPLACE`
  function behavior in the current SQL reference:
  <https://www.postgresql.org/docs/current/sql-createfunction.html>
- Supabase's 2026 table-default change affects newly created tables; existing
  grants remain a migration concern. Migration 031 already sets fail-closed
  future defaults:
  <https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically>
