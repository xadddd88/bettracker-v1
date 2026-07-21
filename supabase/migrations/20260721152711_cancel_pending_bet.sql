-- ============================================================
-- Cancel a pending tracker bet without destroying its audit trail.
--
-- REVIEW ONLY — apply before deploying the application changes in
-- this branch. A cancellation is a financial operation:
--   pending bet + locked bankroll + verified stake transaction
--   -> void/archive bet + void legs + one refund transaction.
--
-- The bet and its legs are deliberately retained. Normal product
-- reads exclude archived_at rows, while the ledger continues to
-- explain every balance change.
-- Emergency kill switch / operational rollback:
--   docs/decision-062-cancel-pending-bet-rollback.sql
-- It revokes authenticated EXECUTE without deleting schema or audit data.
-- ============================================================

ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.bets.archived_at IS
  'Soft-delete timestamp. Pending tracker cancellation retains the financial audit trail while hiding the bet from normal product reads.';

CREATE INDEX IF NOT EXISTS idx_bets_user_archived_placed
  ON public.bets (user_id, archived_at, placed_at DESC);

-- Backstop the invariant independently of the function lock: a bet
-- can have at most one cancellation refund transaction.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bankroll_tx_one_tracker_cancel
  ON public.bankroll_transactions (bet_id)
  WHERE type = 'payout'
    AND metadata ->> 'action' = 'tracker_cancel';

CREATE OR REPLACE FUNCTION public.cancel_pending_bet(
  p_bet_id          uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_key            text;
  v_bet            public.bets%ROWTYPE;
  v_balance        numeric;
  v_new_balance    numeric;
  v_stake_tx_count integer;
  v_refund_tx      public.bankroll_transactions%ROWTYPE;
  v_key_tx         public.bankroll_transactions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_bet_id IS NULL THEN
    RAISE EXCEPTION 'invalid_bet_id';
  END IF;

  IF p_idempotency_key IS NULL
     OR p_idempotency_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;
  v_key := lower(p_idempotency_key);

  -- Ownership and concurrency boundary. Different cancellation keys
  -- for the same bet serialize on this row.
  SELECT * INTO v_bet
  FROM public.bets
  WHERE id = p_bet_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bet_not_found';
  END IF;

  -- A key already used by any other operation or bet is a conflict.
  SELECT * INTO v_key_tx
  FROM public.bankroll_transactions
  WHERE user_id = v_user_id
    AND lower(idempotency_key) = v_key;

  IF FOUND THEN
    IF v_key_tx.type IS DISTINCT FROM 'payout'
       OR v_key_tx.bet_id IS DISTINCT FROM p_bet_id
       OR v_key_tx.metadata ->> 'action' IS DISTINCT FROM 'tracker_cancel' THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;

    RETURN jsonb_build_object(
      'bet_id',        p_bet_id,
      'refund_amount', v_key_tx.amount,
      'balance',       v_key_tx.balance_after,
      'replayed',      true
    );
  END IF;

  -- A retry after an ambiguous response may carry a fresh key. Return
  -- the already committed cancellation instead of refunding twice.
  IF v_bet.archived_at IS NOT NULL THEN
    SELECT * INTO v_refund_tx
    FROM public.bankroll_transactions
    WHERE user_id = v_user_id
      AND bet_id = p_bet_id
      AND type = 'payout'
      AND metadata ->> 'action' = 'tracker_cancel';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'already_archived';
    END IF;

    RETURN jsonb_build_object(
      'bet_id',        p_bet_id,
      'refund_amount', v_refund_tx.amount,
      'balance',       v_refund_tx.balance_after,
      'replayed',      true
    );
  END IF;

  IF v_bet.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'bet_not_cancellable';
  END IF;

  IF v_bet.bankroll_id IS NULL THEN
    RAISE EXCEPTION 'refund_bankroll_missing';
  END IF;

  -- Lock the exact bankroll owned by the caller. The row lock makes
  -- the balance update and balance_after ledger value atomic with
  -- concurrent deposits, stakes, settlements, and cancellations.
  SELECT balance INTO v_balance
  FROM public.bankrolls
  WHERE id = v_bet.bankroll_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_bankroll_missing';
  END IF;

  -- Fail closed unless the original stake debit exists exactly once.
  SELECT count(*) INTO v_stake_tx_count
  FROM public.bankroll_transactions
  WHERE user_id = v_user_id
    AND bankroll_id = v_bet.bankroll_id
    AND bet_id = p_bet_id
    AND type = 'stake'
    AND amount = -v_bet.stake;

  IF v_stake_tx_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'stake_ledger_mismatch';
  END IF;

  v_new_balance := v_balance + v_bet.stake;

  UPDATE public.bets
  SET status = 'void',
      settlement_outcome = 'void',
      pnl = 0,
      settled_at = now(),
      archived_at = now(),
      updated_at = now()
  WHERE id = p_bet_id
    AND user_id = v_user_id;

  UPDATE public.bet_legs
  SET leg_status = 'void',
      updated_at = now()
  WHERE bet_id = p_bet_id;

  UPDATE public.bankrolls
  SET balance = v_new_balance
  WHERE id = v_bet.bankroll_id
    AND user_id = v_user_id;

  INSERT INTO public.bankroll_transactions (
    user_id,
    bankroll_id,
    bet_id,
    type,
    amount,
    balance_after,
    metadata,
    idempotency_key
  ) VALUES (
    v_user_id,
    v_bet.bankroll_id,
    p_bet_id,
    'payout',
    v_bet.stake,
    v_new_balance,
    jsonb_build_object(
      'action',           'tracker_cancel',
      'previous_balance', v_balance,
      'audit_retained',   true
    ),
    v_key
  )
  RETURNING * INTO v_refund_tx;

  RETURN jsonb_build_object(
    'bet_id',        p_bet_id,
    'refund_amount', v_bet.stake,
    'balance',       v_new_balance,
    'replayed',      false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_pending_bet(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_pending_bet(uuid, text)
  TO authenticated;

-- Verification after explicit migration approval:
-- 1. Run in a transaction against a disposable pending bet and ROLLBACK.
-- 2. Assert balance increased by stake, one tracker_cancel payout exists,
--    bet/legs are void, archived_at is set, and a replay makes zero writes.
-- 3. Call as another authenticated user and expect bet_not_found.
