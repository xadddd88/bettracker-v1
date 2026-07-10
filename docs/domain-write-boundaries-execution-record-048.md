# Execution Record — Core Domain Write Boundaries (Decision #048)

## Status

EXECUTED 2026-07-10 · CPO final accept on PR #129 head `5d3bfb4` (approval comment on the
PR) · sanitized record, rides under Decision #048 (no new ledger number).

## Sequence executed (CPO-approved order)

1. **Migration 017 applied** via Supabase migration tooling
   (`prepare_domain_write_boundaries_017`).
2. **017 verification** — all green: three new functions exist;
   `persist_analysis_decision` EXECUTE = service_role only (authenticated & anon false);
   `save_user_settings` / `complete_onboarding` EXECUTE = authenticated;
   `place_bet_from_decision` contains pending-only + `pricingAllowed` + `showPlaceBet` +
   funds guard; `update_decision_action` contains `FOR UPDATE`.
3. **PR #129 merged** (squash → `66aa980`; PR body corrected to 13/13 and "Phase A
   preparation plus backward-compatible RPC hardening" first).
4. **Production READY** — deployment `dpl_EsesHJJ5bpzMwMiqZdwK9ud57hyb`, commit `66aa980`.
   Route sanity: unauthenticated PATCH `/api/settings`, PATCH `/api/onboarding/complete`,
   POST `/api/ai/analyst` all → 401.
5. **New application paths verified** (test account under simulated authenticated claim):
   `save_user_settings` set display name + synced currency to EUR on BOTH profile and
   default bankroll, then reverted to USD; `complete_onboarding` set the flag;
   `persist_analysis_decision` (server-only) persisted a blocked-mode Analyst decision with
   all pricing fields NULL.
6. **Migration 018 applied** (`enforce_domain_write_boundaries_018`) — the fail-closed
   Phase-A preflight passed and enforcement ran.
7. **Post-018 privilege verification** (service-role read):
   - `authenticated`: 0 non-SELECT privileges across all seven tables (MAINTAIN included),
     SELECT present on all seven.
   - `anon`: 0 privileges on all seven tables.
   - Policies: exactly one `FOR SELECT` own-rows policy per table (no `FOR ALL` remaining).
   - `create_decision_with_analysis` and `persist_analysis_decision`: EXECUTE = false for
     authenticated.

## Bypass verification (authenticated role, smoke-047)

Run under `SET LOCAL ROLE authenticated` + the account's JWT claim, each forbidden write in
its own exception block:

| Check | Result |
|-------|--------|
| Direct DML denied (UPDATE profiles.currency; UPDATE bankrolls.balance; INSERT/DELETE bankroll_transactions; INSERT bets; UPDATE decisions pricing/final_action; INSERT ai_analysis_runs; TRUNCATE) — 8 attempts | all denied |
| `create_decision_with_analysis` (legacy) executed by authenticated | denied |
| `persist_analysis_decision` (server-only) executed by authenticated | denied |
| **Total denied** | **10 / 10** |
| Own reads (own decisions) | work (1 row) |
| Cross-user reads (other users' decisions) | 0 rows |
| Approved RPC under authenticated (`adjust_bankroll` deposit, `save_user_settings`) | work (balance 10 → 15) |

**Invariance after every forbidden attempt:** balance 10, transaction count 1, latest
`balance_after` 10, bets 0, ai_runs 1, profile currency USD (the `XXX` update was denied),
decision pricing NULL, decision action `pending` — nothing changed.

Blocked-Analyst placement (the P1 CPO concern): a trust-blocked `ai_analyst` decision
(`quality_gate.pricingAllowed = false`) rejected `place_bet_from_decision` with
`decision_not_placeable` and zero writes (bets 0, legs 0, transactions unchanged, decision
still pending).

## Cleanup

`smoke-047` (`00000000-0000-4000-8000-000000000047`) deleted from `auth.users`; cascade
verified — 0 rows remain in profiles, bankrolls, bankroll_transactions, decisions,
ai_analysis_runs.

## Still OPEN (recorded, separate trust-domain decision before external beta)

- `market_opportunities` — `FOR ALL` policy granted to role `{public}`; Scout inserts and a
  status route update it directly.
- `coaching_sessions` — user-callable INSERT policy.

`create_decision_with_analysis` retains its definition (EXECUTE revoked only); a later
migration drops it after stable verification.

## Holds unchanged

Football enrichment, odds work, new provider calls, Scout/Analyst provider-data usage and
new betting-signal surfaces remain on HOLD.
