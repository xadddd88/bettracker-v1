# Decision #067 — Public API Privilege Hardening

**Date:** 2026-07-27  
**Proposed by:** CPO  
**Authorized by:** Founder  
**Status:** EXECUTED / VERIFIED / CLOSED — PR #233 merged as
`9211c7e5450ce1854a7621ab0a5fa3284decef82`; migration 031 applied once as
`20260727123510_public_api_privilege_hardening_031` and was verified read-only.

## Problem

The post-Decision #066 read-only audit found no active cross-user data leak, but
three privilege boundaries rely on fragile defaults:

1. Seven internal `public` tables have RLS enabled without policies. They are
   currently fail-closed, but four still retain inherited `anon` and
   `authenticated` table privileges.
2. Eleven `SECURITY DEFINER` functions are intentionally or historically
   executable by `authenticated`. Nine still use `search_path=public`; because
   client roles can create temporary objects, PostgreSQL searches attacker-owned
   `pg_temp` objects before `public` unless `pg_temp` is placed explicitly last.
3. The `postgres` application owner gives future `public` tables broad client
   privileges and future functions executable client privileges by default.

Two authenticated RPCs no longer have a runtime caller:
`create_quick_bet` and `set_user_currency`.

## Decision

Migration 031 hardens the existing contract without adding a new client
capability.

### Internal tables

Revoke all `PUBLIC`, `anon`, and `authenticated` privileges from:

- `api_rate_limits`
- `beta_access`
- `fixture_provider_links`
- `fixture_results`
- `football_enrichment`
- `fp001_pricing_quarantine`
- `tennis_series_commands`

Each table receives one restrictive `FOR ALL` policy scoped exactly to
`anon, authenticated`, with both `USING (false)` and `WITH CHECK (false)`.
These policies make the deny boundary explicit and continue to block every row
even if a client table grant is accidentally reintroduced later. Any future
client access requires a separate reviewed migration that deliberately removes
the restrictive policy and defines the new authorization model.

### Definer-function search path

Pin `search_path = public, pg_temp` on the nine affected functions:

- `adjust_bankroll`
- `complete_onboarding`
- `create_quick_bet`
- `place_bet_from_decision`
- `save_user_settings`
- `set_user_currency`
- `settle_bet`
- `update_decision_action`
- `update_opportunity_status`

`public` is not writable by `anon`, `authenticated`, or `service_role` in the
audited production catalog. Placing `pg_temp` last preserves current unqualified
`public` object resolution while preventing temporary-object shadowing.

`cancel_pending_bet` and `create_tracked_bet` already use an empty fixed
`search_path` and remain unchanged.

### Retired authenticated RPCs

Revoke `EXECUTE` from `PUBLIC`, `anon`, and `authenticated` on:

- `create_quick_bet(uuid,text,text,text,text,numeric,numeric,text,text)`
- `set_user_currency(text)`

Both functions remain defined and executable by `service_role`; this migration
does not drop them or alter their bodies.

The nine intentional authenticated RPC boundaries remain callable:
`adjust_bankroll`, `cancel_pending_bet`, `complete_onboarding`,
`create_tracked_bet`, `place_bet_from_decision`, `save_user_settings`,
`settle_bet`, `update_decision_action`, and `update_opportunity_status`.
Their Supabase Advisor notices are documented exceptions, not automatically
suppressed.

### Future-object defaults

For objects created by the `postgres` application owner:

- revoke PostgreSQL's global default `PUBLIC EXECUTE` on future functions;
- revoke schema-specific `PUBLIC`, `anon`, and `authenticated` privileges on
  future `public` tables;
- revoke schema-specific `PUBLIC`, `anon`, and `authenticated` execution on
  future `public` functions;
- preserve the existing `service_role` defaults.

This is an ACL boundary, not a substitute for enabling RLS and defining an
intentional policy on every future table in an exposed schema.

## PostgreSQL 17 verification contract

The hermetic verifier must prove:

- the seven-table precondition, including the four inherited client ACLs;
- the two retired RPCs begin authenticated-callable;
- pre-031 default privileges expose newly created public objects;
- a temporary table can shadow an unqualified public table before hardening;
- migration 031 applies inside one disposable localhost PostgreSQL 17 database;
- all seven policies are restrictive, `FOR ALL`, exactly client-scoped, and
  constant-false for reads and writes;
- every client table ACL is removed while `service_role` access remains;
- the deny policies still return zero rows after a synthetic accidental grant;
- all nine affected functions record `public, pg_temp`;
- the behavioral temporary-object shadowing probe resolves the trusted public
  object after migration;
- the two retired RPCs become service-role-only while the nine intentional RPCs
  remain authenticated-callable;
- future public tables and functions are client-deny by default while retaining
  `service_role` access;
- lock and statement timeouts are present.

## Execution record

### Repository and CI

- Draft PR #233 used head
  `f114c96e547cd63ec45048cc065e098ffdb4b5af` on base
  `8ce79df4444c366b07a3585fde3de8554f431b4a`.
- All 10 CI jobs passed, including the 12/12 hermetic PostgreSQL 17 verifier.
- PR #233 merged as
  `9211c7e5450ce1854a7621ab0a5fa3284decef82`; the automatic Vercel production
  deployment reached READY.

### Production preflight and apply

The separately authorized read-only preflight confirmed:

- `main` and the READY production deployment were both on `9211c7e5`;
- Supabase `ybbdkwjtytokrpbvgbmq` was `ACTIVE_HEALTHY` on PostgreSQL 17.6;
- migration 031 was absent from the production ledger;
- all seven tables existed with RLS enabled and no conflicting policies;
- all nine affected function signatures and both retired RPC boundaries matched;
- active transactions and locks on the target objects were both zero.

The founder-approved exact migration from `main` applied successfully on the
first attempt as:

`20260727123510_public_api_privilege_hardening_031`

### Read-only verification

Catalog-only verification confirmed:

- 7/7 target tables remained RLS-enabled;
- 7/7 restrictive deny-policies were exact;
- `PUBLIC`, `anon`, and `authenticated` had zero target-table ACLs while
  `service_role` access was preserved;
- 11/11 function boundaries were present;
- 9/9 affected functions recorded `search_path = public, pg_temp`;
- both retired RPCs became service-role-only;
- all nine intentional authenticated RPCs remained callable;
- future `postgres`-owned public tables and functions became client-deny by
  default while retaining `service_role`.

Security Advisor no longer reported the seven missing-policy INFO findings or
the two retired authenticated RPCs. It retained exactly the nine documented
intentional RPC warnings. Performance Advisor retained only 17 informational
items: 16 unused-index notices and the Auth DB-connections setting.

Public GET smoke loaded `/login`, and `/` redirected to `/login`. No RPC
was invoked, no user data was read, and no retry or rollback ran.

## Initial implementation boundaries

The implementation Draft changed repository artifacts only. Migration apply,
production DB writes, merge, and production deployment required separate founder
approvals, which were later granted and are recorded above. Implementation and
CI read or modified no production table rows.

## Post-execution boundaries

- The apply changed only the reviewed table ACL/RLS policies, function
  `search_path` and EXECUTE grants, and future-object default privileges.
- No financial function body, formula, settlement rule, RLS ownership rule,
  runtime caller, provider integration, frontend, mobile, language, design,
  feature flag, env, or Vercel configuration changed.
- The nine retained authenticated RPCs remain documented intentional exceptions;
  their bodies or client contracts are not broadened by this decision.
- Any future restoration of client privileges or rollback requires a separate
  reviewed and founder-approved action. No rollback was required.
