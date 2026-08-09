# Security S2 — Active Membership & Revocation Enforcement

## S2.1 status and repository scope

Security S2.1 is a repository-only foundation prepared on
`main@eaf14dac9960b3dcfd60929d25f41286f40019ff`. It adds database primitives
for a later live-membership authorization gate. It does not activate that gate
in Web, mobile, Data API, or existing authenticated RPCs.

The slice is limited to seven files:

1. `supabase/migrations/20260809083122_active_membership_foundation.sql`
2. `scripts/test-active-membership-foundation.mjs`
3. `scripts/verify-active-membership-foundation.sh`
4. `scripts/test-supabase-advisor-baseline.mjs`
5. `.github/workflows/preview-tests.yml`
6. `package.json`
7. `docs/active-membership-revocation-s2.md`

No production data backfill, Auth mutation, session revocation, RLS enforcement,
route change, external configuration, branch, commit, or deployment belongs to
S2.1.

## Finding and invariant

The invite-only product currently treats any valid Supabase session as an
authorized product user. A `revoked` membership or missing `beta_access` row
does not block the next Web, mobile, Data API, or RPC request. Separately,
`POST /api/auth/complete-invite` reads and updates `beta_access` in two calls,
so a concurrent revoke can be overwritten by the later update.

The approved invariant is:

- active membership means exactly `status = 'used'` and
  `used_by_user_id = auth.uid()`;
- `approved`, `invited`, `revoked`, missing, foreign, and unauthenticated states
  are inactive;
- invite consumption is one locked database operation available only to
  `service_role`;
- a later revoke always remains possible and a revoke committed before consume
  cannot be overwritten;
- authorization reads live membership instead of stale JWT metadata.

S2.1 encodes the invariant but does not yet enforce it at runtime entry points.
The full finding therefore remains open until S2.2 and S2.3 are complete.

## Database contract

### `private.is_active_member()`

The helper is `STABLE SECURITY DEFINER` with an empty `search_path`. It reads
`auth.uid()` and returns true only for the matching `used` row. It lives in the
non-exposed `private` schema. `PUBLIC` and `anon` have neither schema usage nor
function execution; `authenticated` and `service_role` receive only the usage
and execution needed for future RLS and server checks.

The helper must not be moved to `public`, added to the PostgREST exposed schema
list, or used as a substitute for ownership predicates. Later RLS policies need
both active membership and the existing per-user row predicate.

### `public.consume_beta_access_invite(uuid,text)`

The service-only RPC:

1. normalizes the supplied email;
2. verifies that the UUID and normalized email identify a real `auth.users`
   row;
3. locks the matching `beta_access` row `FOR UPDATE`;
4. returns `already_used` only for the same user;
5. permits only `approved|invited -> used`;
6. returns `not_eligible` for every missing, revoked, foreign, malformed, or
   duplicate-membership condition.

The only outcomes are `consumed`, `already_used`, and `not_eligible`. The RPC
has an empty `search_path`; `PUBLIC`, `anon`, and `authenticated` are denied;
only `service_role` can execute it.

### Data integrity

`beta_access_used_by_user_unique` is a partial unique index on every non-null
`used_by_user_id`. The existing non-unique indexes
`idx_beta_access_used_by_user` and `idx_beta_access_used_by_user_id` remain in
place; their cleanup is outside this additive slice.

`beta_access_lifecycle_shape_check` requires:

- `used`: both `used_by_user_id` and `used_at` are present;
- `approved|invited`: both fields are absent;
- `revoked`: historical linkage may be retained.

The migration validates existing rows but contains no UPDATE, INSERT, DELETE,
or TRUNCATE backfill outside the new consume function.

## Production preflight evidence

The read-only preflight on 2026-08-07/08 confirmed:

- 5 Auth users and 4 `beta_access` rows;
- 3 `used`, 1 `approved`, and no `invited` or `revoked` rows;
- no duplicate `used_by_user_id`, broken lifecycle shape, deleted active user,
  or email mismatch;
- two existing non-unique `used_by_user_id` indexes;
- two production Auth users require explicit reconciliation before enforcement:
  one maps to `approved`, and one has no `beta_access` row.

Both accounts have real sessions and product data. S2.1 deliberately neither
grants nor revokes their access.

## Verification

Static contract:

```bash
npm run test:active-membership-foundation
npm run test:supabase-advisor-baseline
```

Disposable PostgreSQL 17 contract:

```bash
bash scripts/verify-migration-031.sh \
  postgresql://postgres:postgres@localhost:5432/postgres
bash scripts/verify-supabase-advisor-baseline.sh \
  postgresql://postgres:postgres@localhost:5432/postgres
bash scripts/verify-active-membership-foundation.sh \
  postgresql://postgres:postgres@localhost:5432/postgres
```

All three verifiers refuse non-localhost URLs. The S2.1 verifier proves helper
behavior, raw/effective ACLs, public-surface exclusion, atomic outcomes,
lifecycle and uniqueness guards, both revoke/consume lock orders, retention of
both old indexes, and the unchanged S1 Advisor baseline: eight accepted WARN
findings plus one accepted INFO finding.

## Rollout gates

Every state-changing gate requires separate approval:

1. review the repository-only S2.1 diff and CI;
2. merge S2.1 without applying the migration automatically;
3. reconcile the two production accounts by an explicit owner decision;
4. apply the additive migration under its own runbook;
5. run read-only catalog, Advisor, ACL, lifecycle, and function probes;
6. implement S2.2 server/Web enforcement and replace the route's two-call
   consume flow with the service-only RPC;
7. implement S2.3 restrictive membership policies and membership assertions in
   authenticated `SECURITY DEFINER` RPCs;
8. verify direct Data API/RPC denial before declaring revocation enforced.

S2.2 alone is insufficient because direct Supabase calls remain possible.
S2.3 must preserve existing tenant ownership predicates and service-only
boundaries rather than replacing them with membership-only checks.

## Rollback

Before any S2.2/S2.3 caller depends on these primitives, an authorized rollback
may transactionally:

```sql
BEGIN;
DROP FUNCTION public.consume_beta_access_invite(uuid, text);
DROP FUNCTION private.is_active_member();
DROP INDEX public.beta_access_used_by_user_unique;
ALTER TABLE public.beta_access
  DROP CONSTRAINT beta_access_lifecycle_shape_check;
DROP SCHEMA private;
COMMIT;
```

Rollback must first prove that `private` contains no other object and that no
policy or runtime caller depends on either function. It does not restore or
change user data because S2.1 writes none. After S2.2/S2.3, rollback requires a
separate compatibility plan and must not simply remove the enforcement layer.

## Remaining risk

Until S2.2/S2.3 are implemented and production reconciliation is approved,
revoked, orphan, or externally created Auth users with valid sessions can still
reach current authenticated paths. Session deletion alone is not the security
boundary because an already issued JWT can remain valid until expiry. Live
membership checks at both server and database boundaries are mandatory.
