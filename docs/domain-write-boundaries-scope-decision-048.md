# Core Domain Write Boundaries (Decision #048)

## Status

SCOPE + IMPLEMENTATION (two-phase). Awaiting CPO review; migrations NOT applied yet.

Last updated: 2026-07-10

## Context

Production inventory (2026-07-10, read-only): all seven core tables carry a single
`FOR ALL TO authenticated` own-rows policy, and **both `anon` and `authenticated` hold the
full privilege set** (`DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`) on
every one of them. RLS protects multi-tenancy, not domain invariants: a user can rewrite
their own balance, transactions, bet outcomes, decision pricing and AI history directly.

Two CPO scope corrections incorporated before coding:

1. **`profiles` is table #7.** Direct profile writes let a user set `profiles.currency`
   directly and desync it from the default bankroll, re-breaking the Decision #047
   invariant. The settings and onboarding routes wrote `profiles` directly.
2. **The Analyst RPC was an FP-001 bypass.** `create_decision_with_analysis()` is
   user-callable and accepts `model_probability` / `implied_probability` / `edge_percent` /
   `recommendation` — any authenticated user could persist fabricated pricing as
   `source = 'ai_analyst'` while skipping the `/api/ai/analyst` quality gate.

## Scope — seven core tables

`profiles`, `bankrolls`, `bankroll_transactions`, `bets`, `bet_legs`, `decisions`,
`ai_analysis_runs`.

## Phase A — `017_prepare_domain_write_boundaries.sql` (additive, zero downtime)

| Object | EXECUTE | Purpose |
|--------|---------|---------|
| `persist_analysis_decision(p_user_id, …)` | **service_role ONLY** | server-only Analyst persistence; body mirrors the legacy RPC; `p_user_id` comes exclusively from the authenticated server session in `/api/ai/analyst` — never the request body |
| `save_user_settings(…)` | authenticated | atomic profile settings + default-bankroll currency sync (keeps the Decision #047 exactly-one-row invariant); NULL = leave unchanged; returns the updated profile row |
| `complete_onboarding()` | authenticated | replaces the direct onboarding profile UPDATE |

Application callers move in the same PR: `/api/ai/analyst` → admin client +
`persist_analysis_decision`; `/api/settings` → single `save_user_settings` call (zero direct
table access); `/api/onboarding/complete` → `complete_onboarding`. Old DB paths stay
functional until Phase B, so there is no downtime window between migration and deploy.

## Phase B — `018_enforce_domain_write_boundaries.sql` (enforcement)

For each core table:

```
REVOKE ALL FROM PUBLIC;
REVOKE ALL FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER FROM authenticated;
GRANT SELECT TO authenticated;
DROP the FOR ALL policy → CREATE a FOR SELECT own-rows policy
  (same (SELECT auth.uid()) ownership quals as production, incl. bet_legs via parent bet)
```

Plus: `REVOKE EXECUTE` on `create_decision_with_analysis` from PUBLIC/anon/authenticated
(function kept until stable verification; dropped by a later migration).
**No `FORCE ROW LEVEL SECURITY`** — it would break the SECURITY DEFINER RPC layer.
`service_role` retains full access.

Emergency rollback: `docs/decision-048-rollback.sql` — restores the inventoried grants and
FOR ALL policies. Lives outside `supabase/migrations/` on purpose; applied only as a
deliberate forward step after recording observed breakage, never automatically.

## RPC classification after #048

- **Authenticated:** `adjust_bankroll`, `save_user_settings`, `complete_onboarding`,
  `set_user_currency` (kept for compatibility), `create_quick_bet`,
  `place_bet_from_decision`, `settle_bet`, `update_decision_action` — all SECURITY DEFINER,
  `SET search_path = public`, identity via `auth.uid()`, no client-supplied user ids.
- **Server-only:** `persist_analysis_decision` (service_role; explicit `p_user_id` derived
  from the authenticated session by the route).

## Bypass verification plan (after Phase B)

Executed with the retained `smoke-047` test account under a simulated authenticated claim,
each expected failure inside its own `SAVEPOINT`:

- Direct DML denied on all seven tables (UPDATE currency/balance/status/pnl/leg_status/
  pricing/final_action; INSERT/UPDATE/DELETE transactions, bets, legs, decisions, AI runs);
  TRUNCATE/REFERENCES/TRIGGER privileges absent.
- After every attempt: row counts, balance, and the latest transaction unchanged.
- Reads keep working (own rows), cross-user reads return zero rows.
- Approved RPCs keep working (deposit replay/conflict, insufficient withdrawal,
  save settings, complete onboarding, quick bet incl. insufficient-stake rollback,
  update_decision_action, settle_bet).
- Trust boundary: authenticated cannot execute `create_decision_with_analysis` OR
  `persist_analysis_decision`; service-role persistence with a server-derived user id works;
  pricing stays NULL after a blocked Analyst run.

`smoke-047` is deleted (auth.users cascade) after verification completes.

## CI

New suite `npm run test:domain-write-boundaries` (10 cases) added to the safety job:
migration 017/018 static guards (EXECUTE surfaces, per-table revokes + SELECT-only policies,
no FORCE RLS, no premature DROP FUNCTION, rollback script completeness), analyst route
server-only persistence (admin client, session-derived `p_user_id`, no legacy RPC call),
settings/onboarding behavioral tests (single RPC, zero direct table access), and a
no-direct-core-writes sweep over the touched routes.

## Deployment order (CPO-approved)

1. PR + green CI + CPO review → 2. apply **017** → 3. verify new functions/grants →
4. merge PR → 5. production READY → 6. verify new Analyst/settings/onboarding paths →
7. apply **018** → 8. bypass tests immediately → 9. application smoke →
10. execution record under #048 → 11. delete `smoke-047`.

## Recorded as still OPEN (separate trust-domain decision before external beta)

- `market_opportunities` — carries a `FOR ALL` policy granted to role **`{public}`** (worse
  than the core tables); Scout inserts and a status route update it directly.
- `coaching_sessions` — user-callable INSERT policy; Coach persistence boundary unreviewed.

## Non-goals

No enrichment, no odds, no provider calls, no FP-001 gate changes, no FORCE RLS, no
market_opportunities/coaching_sessions changes, no dropping of the legacy Analyst RPC yet.
