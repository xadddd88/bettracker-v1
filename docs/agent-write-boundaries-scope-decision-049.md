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
| `update_opportunity_status(p_opportunity_id, p_status, p_linked_decision_id)` | authenticated | user action (watchlist / dismiss / convert) as a **locked state machine** — see below |

Routes move in the same PR: `/api/scout` → admin client + `persist_market_opportunities`;
`/api/scout/[id]` → `update_opportunity_status`; `/api/coach` → admin client +
`persist_coaching_session`. Old DB paths stay alive until Phase B → zero downtime.

**`update_opportunity_status` state machine (CPO review of PR #131):** the row is locked
`FOR UPDATE`, then:
- allowed statuses (route schema + RPC) are narrowed to `watchlisted` / `dismissed` /
  `converted_to_decision` — system states (`discovered`, `research_needed`, `expired`) are
  not client-reachable;
- from `discovered`/`research_needed`/`watchlisted`: `watchlisted` and `dismissed` require
  the link to be NULL; `converted_to_decision` requires a link to a decision that belongs to
  the caller AND has `source = 'ai_analyst'`;
- `converted_to_decision`, `dismissed`, `expired` are terminal — an exact repeat of the same
  conversion link is idempotent, anything else raises `invalid_transition`;
- the conversion link is set once and never carried over via `COALESCE` (the old bug).

Scout persist hardening: `p_rows` NULL/array-checked, batch bounded `1..25`, and status set
structurally to `discovered` (never read from input, so a caller cannot seed a converted
opportunity). A partial unique index `uq_market_opp_linked_decision` (on `linked_decision_id`
where not null) prevents two opportunities claiming the same decision — production verified
duplicate-free before adding it.

Route hardening: `/api/scout/[id]` validates the path id as a UUID (→ 400), maps the RPC
error tokens (`opportunity_not_found` → 404, `invalid_transition` → 409,
`invalid_status`/`link_required`/`invalid_link`/`link_not_allowed` → 400), and its generic
catch (plus the Coach route's) now logs `err.name` only — no raw error message reaches the
client (closes the `SUPABASE_SERVICE_ROLE_KEY`-name-leak path).

### Phase B — `020_enforce_agent_write_boundaries.sql` (enforcement)

Fail-closed Phase-A preflight (`DO` block, raises before any REVOKE if the RPCs are absent or
mis-granted), then for each table: `REVOKE ALL` from PUBLIC/anon/authenticated (covers PG17
`MAINTAIN`), `GRANT SELECT` to authenticated, drop the legacy policy (`Users see own
opportunities` FOR ALL/public; `coaching_sessions_insert`), create a `FOR SELECT` own-rows
policy. No `FORCE ROW LEVEL SECURITY`. `service_role` untouched.

Emergency rollback: `docs/decision-049-rollback.sql` (single `BEGIN`/`COMMIT`, outside
migrations, manual-only).

**Schema-drift note (found in review):** tracked migration 005 created a `FOR ALL` policy
`"Users see own sessions"` on `coaching_sessions`, but production was later switched
(untracked, via SQL Editor) to the split `coaching_sessions_select` / `coaching_sessions_insert`
policies. Migration 020 drops all three names so it is correct whether applied to production
or to an environment rebuilt from tracked migrations — otherwise the `FOR ALL` policy would
survive on a fresh rebuild and the table would never become SELECT-only. This is another
instance of the standing manual-migration drift risk; a later reconciliation pass should make
the tracked migrations match production.

## Tests

New CI suite `npm run test:agent-write-boundaries` (12 static/source cases): 019 guards
(EXECUTE surfaces, forced-NULL pricing + structural status + bounded batch, the locked state
machine, the partial unique index), 020 guards (REVOKE ALL / MAINTAIN, full Phase-B grant
matrix incl. anon + both RLS-enabled checks, drop of every legacy policy name, no FORCE RLS),
transactional rollback, route assertions (admin-client persistence, session-derived user id,
narrowed schema, UUID validation, error-token → status-code mapping, sanitized catches),
recursive no-direct-write sweep over `app/**`.

**Live behavioral verification (run against the DB during execution, recorded in the
execution record — same approach as the #048 bypass tests):** converted without a link →
denied; link to another user's decision → denied; link to a non-`ai_analyst` decision →
denied; link supplied for `watchlisted`/`dismissed` → denied; terminal-state transition →
denied; exact conversion repeat → idempotent no-op; concurrent conversion/dismiss →
serialized by the row lock; `NULL`/empty `p_rows` → denied; full Phase-B EXECUTE matrix;
RLS-disabled preflight → raises before any REVOKE; Coach admin-config error does not reach
the client; malformed opportunity UUID → 400.

## Deployment order (same as #048)

1. green CI + CPO review → 2. apply **019** → 3. verify functions/grants → 4. merge →
5. prod READY → 6. verify Scout persist / status change / Coach persist paths → 7. apply
**020** → 8. bypass verification (authenticated role) → 9. app smoke → 10. execution record.

## Non-goals

No enrichment, no odds, no provider-call changes, no FP-001 gate changes, no changes to the
seven #048 core tables, no Scout/Coach model or prompt changes.
