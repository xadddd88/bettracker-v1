# Decision #066 — `odds_snapshots_public` Security-Invoker Hardening

**Date:** 2026-07-27  
**Proposed by:** CPO  
**Authorized by:** Founder  
**Status:** ACTIVE / IMPLEMENTATION DRAFT — migration 030 is review-only and
unapplied. No Supabase write, production migration, provider call, odds
ingestion, application caller, environment change, or deployment is authorized.

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

## Boundaries

- Migration 030 is not applied by this implementation PR.
- `main`, production Supabase, production migration ledger, env, Vercel, and
  production aliases are unchanged.
- No odds rows are created, read, synchronized, or modified in production.
- No frontend, mobile, language, skin, typography, or design work is included.
- Merge and production apply require separate founder approvals.

## Roll-forward / recovery

Before any future apply, repeat a production catalog/ACL/RLS preflight and verify
that migration 030 still matches the live view definition. On apply failure,
stop without retry. Any reversal of `security_invoker`, base-column grants, or
the RLS policy requires a separately reviewed recovery action.
