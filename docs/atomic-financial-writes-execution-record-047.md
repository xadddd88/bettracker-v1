# Execution Record — Atomic Financial Writes & No-Overdraft Policy (Decision #047)

## Status

EXECUTED 2026-07-10 · CPO final accept on PR #127 head `fc1bcd9` (approval comment on the PR)
· sanitized record, rides under Decision #047 per CPO instruction (no new ledger number).

## Sequence executed (CPO-approved order)

1. **Migration applied** via Supabase migration tooling as `atomic_financial_writes_016`
   (tracked annotated copy: `supabase/migrations/016_atomic_financial_writes.sql`).
2. **Read-only verification** — all checks passed in one query:
   `idempotency_key` column ✓ · partial unique index ✓ · `adjust_bankroll` definition
   contains conflict check + UUID validation + deposit/withdrawal-only + `FOR UPDATE` ✓ ·
   `set_user_currency` contains `GET DIAGNOSTICS` + multiple-bankroll guard ✓ · both bet
   RPCs contain conditional funds guards ✓ · `anon` has NO EXECUTE on the new RPCs ✓ ·
   `authenticated` has EXECUTE ✓.
3. **PR #127 merged** (squash → `1e197f6`), description refreshed per CPO cleanup first.
4. **Production READY**: deployment `dpl_GJ8UGxGzDdyCZvAjkuDdvUeGRsdj`, commit `1e197f6`,
   aliased to btdk.app. Route sanity: unauthenticated POST `/api/bankroll/deposit` → 401.

## Controlled smoke (dedicated test account)

Test account `smoke-047@test.invalid` (`00000000-0000-4000-8000-000000000047`) — created
directly in `auth.users` with an EMPTY password hash (cannot log in); `handle_new_user`
provisioned its profile + default bankroll (balance 0). No real user bankroll was touched.
Domain calls executed against production functions under a simulated authenticated JWT
claim (`request.jwt.claims.sub`), which is exactly what `auth.uid()` reads.

| # | Case | Result |
|---|------|--------|
| 1 | deposit 10 (key `…aa01`) | balance 10, `replayed: false` ✓ |
| 2 | exact replay of the same request | `replayed: true`, same transaction id, still exactly 1 transaction row ✓ |
| 3 | same key, different amount | `Idempotency conflict` exception, zero writes ✓ |
| 4 | withdrawal 50 > balance 10 | `Insufficient balance` exception, zero writes ✓ |
| 5 | type `adjustment` | `Unsupported transaction type` exception (user-callable adjustment removed) ✓ |
| 6 | `set_user_currency('EUR')` then back to `'USD'` | profile AND default bankroll synced both ways ✓ |
| 7 | integrity | `bankrolls.balance` (10) == latest `bankroll_transactions.balance_after` (10); total tx rows = 1 ✓ |

Negative P&L sign and currency-symbol rendering are covered by the `lib/money` unit cases
in the financial-safety suite (15/15 in CI); the route layer is covered by the same suite's
stubbed end-to-end cases.

The test account is intentionally KEPT for the Decision #048 authenticated bypass tests
(it will attempt direct DML on financial tables after the revoke). It must be deleted when
#048 verification completes.

## Historical negative bankroll

Untouched, status `reconciliation_required`. Its stakes/withdrawals are now blocked by the
live guards; deposits remain open. Repair remains a future audited operator flow.

## Holds unchanged

Enrichment, odds, provider calls and new betting-signal surfaces stay on HOLD until
Decision #048 is merged, applied, deployed and production-smoked.
