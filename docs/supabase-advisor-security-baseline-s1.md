# Supabase Advisor security baseline — Slice S1

## Status and scope

This repository-only baseline records the security findings accepted after the
read-only production triage on 2026-08-07. It is anchored to
`main@24c80c384df7a5a48f9e91d88db0a2810b67a65b` and contains exactly:

- eight intentional `0029_authenticated_security_definer_function_executable`
  warnings for authenticated, self-scoped RPC boundaries;
- one intentional `0008_rls_enabled_no_policy` information finding for the
  append-only Decision #056 execution ledger.

The machine-readable source of truth is
`docs/security/supabase-advisor-baseline.v1.json`. Decision #067 remains the
historical design decision; this file does not rewrite it.

Slice S1 changes no SQL function, migration, ACL, RLS policy, Auth setting,
data, Supabase project, or deployment. It only makes the accepted backlog and
its database contract reviewable and testable in the repository.

## Enforced contract

For each accepted RPC, CI verifies the exact `regprocedure` signature,
`pg_get_function_identity_arguments`, single-overload rule, owner,
`SECURITY DEFINER`, `proconfig` search path, and raw function ACL. `PUBLIC` and
`anon` must remain denied; `authenticated` and `service_role` must remain the
only non-owner EXECUTE grantees.

`place_bet_from_decision(uuid,uuid,numeric,text,text)` is a negative control.
It must remain absent from the accepted allowlist and callable only by
`service_role` after the quarantine migration.

For `decision_056_execution_ledger`, CI verifies RLS enabled with zero
policies, no client table privilege, and INSERT-only access for
`service_role`.

The static test also scans migration statements. A new historical or future
`GRANT EXECUTE ... TO authenticated` for a function outside the accepted or
explicitly retired set fails CI. Reopening `place_bet_from_decision`,
`create_quick_bet`, `set_user_currency`, or
`create_decision_with_analysis` also fails.

## Verification model

Run the repository test with:

```bash
npm run test:supabase-advisor-baseline
```

The PostgreSQL contract runs only against a disposable localhost PostgreSQL
17 database, after the existing Decision #067 verifier:

```bash
bash scripts/verify-migration-031.sh \
  postgresql://postgres:postgres@localhost:5432/postgres
bash scripts/verify-supabase-advisor-baseline.sh \
  postgresql://postgres:postgres@localhost:5432/postgres
```

The second command applies the existing ledger and quarantine migrations only
to that disposable database. It refuses every non-localhost URL and never
uses Supabase credentials.

## Updating the baseline

Do not edit the manifest merely to make CI green. A baseline update requires:

1. a fresh read-only Advisor and catalog snapshot;
2. security triage of every added, removed, or changed finding;
3. exact signature, overload, owner, ACL, search-path, and function-boundary
   evidence;
4. a separately reviewed repository slice;
5. read-only production verification after any separately authorized
   production migration.

Changes to function bodies, grants, migrations, RLS, Auth, or data are outside
S1 and require their own implementation and production gates.

## Limitation

Repository CI proves the migration-derived contract in disposable PostgreSQL.
It cannot detect manual DDL drift performed directly in production. Production
catalog and Advisor checks therefore remain mandatory after future production
migrations.
