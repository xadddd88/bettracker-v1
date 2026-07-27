# Decision #066 — `odds_snapshots_public` Security-Invoker Hardening

**Date:** 2026-07-27  
**Proposed by:** CPO  
**Authorized by:** Founder  
**Status:** EXECUTED / VERIFIED / CLOSED — implementation merged via PR #232 as
`8ce79df4444c366b07a3585fde3de8554f431b4a`; migration 030 applied once as
`20260727093233_odds_snapshots_public_security_invoker_030` and verified.

## Problem

`public.odds_snapshots_public` is an intentional nine-column product projection,
but migration 015 created it with PostgreSQL's default view-security behavior.
Because the view owner is `postgres`, reads execute with owner privileges and
bypass the zero-policy RLS boundary on `public.odds_snapshots`.

There is no active data leak: `anon` has no access, DML is revoked, the view
contains only display-safe fields, and the production audit found zero rows.
The design is nevertheless fragile because future odds rows would be exposed to
every authenticated caller through an owner-privileged view.

## Decision

Migration 030 will:

1. Set `public.odds_snapshots_public` to `security_invoker = true`.
2. Revoke broad `PUBLIC`, `anon`, and `authenticated` privileges on the base
   table.
3. Grant `authenticated` column-level `SELECT` on exactly the nine fields already
   projected by the curated view.
4. Add an authenticated-only RLS `SELECT` policy for global sports odds.
5. Reassert authenticated `SELECT`-only access to the view and keep `anon` and
   all DML paths blocked.
6. Preserve unrestricted internal access for `service_role`.

The safe fields are:

- `id`
- `canonical_fixture_id`
- `market_catalog_id`
- `selection`
- `line`
- `price`
- `bookmaker`
- `ingested_at`
- `provider_updated_at`

The internal fields remain inaccessible to authenticated callers:
`provider`, `raw_market_name`, `raw_provider_payload`, `sync_run_id`, and
`created_at`.

## Verification contract

The hermetic PostgreSQL 17 verifier must prove:

- the legacy view starts without `security_invoker`;
- migration 030 applies inside a disposable localhost database;
- the catalog records `security_invoker=true`;
- the RLS policy is `SELECT`-only and scoped only to `authenticated`;
- authenticated callers can read the curated view and exactly nine base-table
  columns;
- every internal column read fails;
- `anon`, insert, update, and delete paths fail;
- `service_role` retains access to internal fields;
- migration lock and statement timeouts are present.

## Initial Draft Boundaries

- Migration 030 is not applied by this implementation PR.
- `main`, production Supabase, production migration ledger, env, Vercel, and
  production aliases are unchanged.
- No odds rows are created, read, synchronized, or modified in production.
- No frontend, mobile, language, skin, typography, or design work is included.
- Merge and production apply require separate founder approvals.

## Execution receipt — 2026-07-27

- PR #232 merged as `8ce79df4444c366b07a3585fde3de8554f431b4a` after all nine repository jobs, including the PostgreSQL 17 verifier, passed.
- Migration 030 applied successfully on the first and only attempt as `20260727093233_odds_snapshots_public_security_invoker_030`.
- Read-only verification confirmed `security_invoker=true`, one exact authenticated-only RLS policy, 9/9 safe columns accessible, 0/5 internal columns accessible, zero `anon` and DML access, and unchanged `service_role` access.
- The table remained at zero rows; both related Security Advisor findings cleared; the public login health smoke passed without first-party console errors.
- No retry or rollback ran, and application callers, provider/odds ingestion, env, and Vercel were unchanged by the apply action.

## Recovery

Any reversal of `security_invoker`, base-column grants, or the RLS policy requires
a separately reviewed and founder-approved migration. No automatic rollback is
authorized by this closed record.
