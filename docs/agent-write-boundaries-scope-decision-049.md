# Agent Write Boundaries — Scout & Coach (Decision #049)

## Status

SCOPE + IMPLEMENTATION (two-phase). Awaiting CPO review; migrations NOT applied yet.

Last updated: 2026-07-10

## Context

Decision #048 recorded two agent-owned tables as OPEN. Production inventory (2026-07-10):

- **`market_opportunities` (Scout)** — RLS on, but the single policy is `FOR ALL` **granted
  to role `public`** (worse than the core tables, which were at least `authenticated`), and
  both `anon` and `authenticated` hold the full table privilege set. The Scout route inserts
  rows directly; the `/api/scout/[id]` route updates status directly.
- **`coaching_sessions` (Coach)** — separate `SELECT` + user-callable `INSERT` policies;
  full table privileges for `anon` and `authenticated`. The Coach route inserts directly.

Both are agent-generated content — the same server-only-persistence shape as the Analyst
closed in #048.

## Scope — two tables, same two-phase pattern

### Phase A — `019_prepare_agent_write_boundaries.sql` (additive)

| RPC | EXECUTE | Purpose |
|-----|---------|---------|
| `persist_market_opportunities(p_user_id, p_rows jsonb)` | **service_role ONLY** | server-only Scout persistence; `p_user_id` from the authenticated session; **FP-001 defense-in-depth: `model_probability` / `implied_probability` / `edge_percent` forced to NULL regardless of input** (Scout pricing is gate-blocked, PR #122); batch cap 25; returns inserted rows as jsonb (route keeps its response contract) |
| `persist_coaching_session(p_user_id, …)` | **service_role ONLY** | server-only Coach persistence |
| `update_opportunity_status(p_opportunity_id, p_status, p_linked_decision_id)` | authenticated | user action (dismiss / watchlist / convert); `auth.uid()`-scoped; status enum validated; linked decision must belong to the caller |

Routes move in the same PR: `/api/scout` → admin client + `persist_market_opportunities`;
`/api/scout/[id]` → `update_opportunity_status`; `/api/coach` → admin client +
`persist_coaching_session`. Old DB paths stay alive until Phase B → zero downtime.

### Phase B — `020_enforce_agent_write_boundaries.sql` (enforcement)

Fail-closed Phase-A preflight (`DO` block, raises before any REVOKE if the RPCs are absent or
mis-granted), then for each table: `REVOKE ALL` from PUBLIC/anon/authenticated (covers PG17
`MAINTAIN`), `GRANT SELECT` to authenticated, drop the legacy policy (`Users see own
opportunities` FOR ALL/public; `coaching_sessions_insert`), create a `FOR SELECT` own-rows
policy. No `FORCE ROW LEVEL SECURITY`. `service_role` untouched.

Emergency rollback: `docs/decision-049-rollback.sql` (single `BEGIN`/`COMMIT`, outside
migrations, manual-only).

## Tests

New CI suite `npm run test:agent-write-boundaries` (10 cases): 019 static guards (EXECUTE
surfaces, forced-NULL pricing, ownership-scoped status RPC), 020 static guards (REVOKE ALL /
MAINTAIN, fail-closed preflight ordering, drop of the public FOR ALL + INSERT policies, no
FORCE RLS), transactional rollback, route source assertions (admin-client persistence,
session-derived user id, status via RPC), recursive no-direct-write sweep over `app/**`.

## Deployment order (same as #048)

1. green CI + CPO review → 2. apply **019** → 3. verify functions/grants → 4. merge →
5. prod READY → 6. verify Scout persist / status change / Coach persist paths → 7. apply
**020** → 8. bypass verification (authenticated role) → 9. app smoke → 10. execution record.

## Non-goals

No enrichment, no odds, no provider-call changes, no FP-001 gate changes, no changes to the
seven #048 core tables, no Scout/Coach model or prompt changes.
