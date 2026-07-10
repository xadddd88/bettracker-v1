# Atomic Financial Writes & No-Overdraft Policy (Decision #047)

## Status

EXECUTED 2026-07-10 — migration applied + verified, PR #127 merged (production `1e197f6`),
controlled smoke passed. See `docs/atomic-financial-writes-execution-record-047.md`.

Last updated: 2026-07-10

## Context

CPO full audit 2026-07-10, P0 items: `/api/bankroll/deposit` performed
read → compute-in-Node → update → insert as four separate steps, returned `success: true`
even when the transaction insert failed, and two concurrent requests could overwrite each
other's balance. `create_quick_bet()` / `place_bet_from_decision()` deducted stakes with an
unconditional `balance = balance - stake` — production already holds one negative bankroll.
`/api/settings` synced currency to the default bankroll as an unchecked second write.

**Overdraft policy (CPO 2026-07-10): FORBIDDEN.** A new bet or withdrawal can never take a
bankroll below 0. Negative balance is not a credit limit.

## What ships

### Migration `016_atomic_financial_writes.sql`

| Object | Purpose |
|--------|---------|
| `bankroll_transactions.idempotency_key` + partial unique index `(user_id, idempotency_key)` | replay protection |
| `adjust_bankroll(p_type, p_amount, p_note, p_idempotency_key)` | THE user deposit/withdrawal path (user-callable `adjustment` REMOVED per CPO review — operator reconciliation is a separate future controlled flow): `FOR UPDATE` row lock → validation → funds guard → balance update + transaction insert in one DB transaction. Strict idempotency: UUID key REQUIRED; a replay is bound to the original type + signed amount + normalized note — the same key with a different payload raises `Idempotency conflict` (HTTP 409, zero writes); metadata records `previous_balance` for audit |
| `set_user_currency(p_currency)` | atomic `profiles.currency` + default-bankroll currency sync; requires EXACTLY one default bankroll updated (`GET DIAGNOSTICS ROW_COUNT`) — zero or multiple rows raise and roll the profile update back |
| `create_quick_bet()` (replaced) | stake deduction is now `... AND balance >= p_stake` conditional locked subtraction; `Insufficient balance` exception rolls back decision/bet/leg rows |
| `place_bet_from_decision()` (replaced) | same guard (`balance >= v_stake`) |

Concurrency by construction: concurrent stakes/withdrawals for one bankroll serialize on the
row lock; the second transaction re-evaluates the guard against the decremented balance —
two parallel operations cannot overspend.

### Application changes

- `/api/bankroll/deposit` → single `adjust_bankroll` RPC call; sanitized error mapping
  (422 insufficient / 404 no bankroll / 500 generic); success now means the whole DB
  transaction committed. Client (`BankrollView`) sends one idempotency key per form session.
- `/api/settings` → currency changes go through `set_user_currency` only; a sync failure is
  a 500, not a silently dropped second write; non-currency fields never carry `currency`
  into the direct profile update.
- `lib/money.ts` — shared `fmtPnl` (negative P&L keeps its minus sign), `fmtPct`,
  `currencySymbol`. Analytics page and Decision detail (Linked Bet stake — was hardcoded
  `$`) now use it.

### Negative historical bankroll (reconciliation_required)

Preserved exactly as-is. The guards block new stakes and withdrawals from it automatically
(negative < any positive amount); deposits remain open for repair. Audited operator
reconciliation (`adjustment`) is a separate future controlled flow — it is NOT
user-callable in this decision. **No automatic zeroing.** The hard `CHECK (balance >= 0)`
constraint intentionally does NOT ship in 016 — it would fail validation against the
existing row and reject partial repair deposits; it lands in a later migration after
reconciliation (the financial-safety suite asserts 016 does not contain it).

### Tests — `npm run test:financial-safety` (15 cases, wired into CI)

Route delegation + zero direct financial table access, sanitized error mapping, idempotency
pass-through and replay surfacing, currency-sync RPC enforcement and hard-failure, mixed
update stripping, fmtPnl/fmtPct/currencySymbol, migration static guards (row lock, both
funds guards, idempotency index, SECURITY DEFINER + search_path on all four functions,
grant hygiene, no premature hard constraint).

DB-level concurrency semantics are enforced by construction (row locks + single
transaction). Automated concurrency tests against a real Postgres need a disposable
database and are deferred to the #048 verification pass.

## Deployment order (IMPORTANT)

The new routes call RPCs that do not exist until migration 016 is applied:

1. PR review + CI green.
2. **Apply `016_atomic_financial_writes.sql`** (Supabase SQL Editor or MCP apply_migration)
   — backward-compatible: old code doesn't call the new RPCs, and the bet-RPC funds guards
   take effect immediately (desired).
3. Merge the PR → production deploy.
4. Production smoke: deposit, withdrawal, insufficient withdrawal (422), currency change,
   negative P&L rendering.

## Post-apply verification (safe, rolls back)

```sql
BEGIN;
  SELECT adjust_bankroll('deposit', 1, 'verify-016', '00000000-0000-4000-8000-000000000016');
  SELECT adjust_bankroll('deposit', 1, 'verify-016', '00000000-0000-4000-8000-000000000016'); -- expect replayed=true, same tx id
  -- SELECT adjust_bankroll('deposit', 2, 'verify-016', '00000000-0000-4000-8000-000000000016'); -- expect 'Idempotency conflict'
  -- SELECT adjust_bankroll('adjustment', 1, NULL, '00000000-0000-4000-8000-000000000017');      -- expect 'Unsupported transaction type'
ROLLBACK;
```

(Run as an authenticated user via the SQL Editor impersonation, or verify via the app.)

## Non-goals

No RLS/grant revocation (that is Decision #048, only after this lands and is verified).
No SportMonks/enrichment/odds work (HOLD per CPO). No automatic repair of the historical
negative bankroll. No settlement changes.
