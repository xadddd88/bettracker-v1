-- ============================================================
-- BetTracker AI -- Schema v3.0
-- Sprint 3: Manual Bet Settlement
--
-- Incremental migration -- safe to run on top of 002.
-- Run manually in Supabase SQL Editor.
-- ============================================================

-- ── Add settlement columns to bets ──────────────────────────
ALTER TABLE bets
  ADD COLUMN IF NOT EXISTS settled_at         timestamptz,
  ADD COLUMN IF NOT EXISTS settlement_outcome text
    CHECK (settlement_outcome IN ('won','lost','void'));

-- ── RPC: settle_bet() ───────────────────────────────────────
-- Atomically settles a bet: updates status/pnl, adjusts bankroll
-- for won/void. Idempotent: already-settled bets return silently.
CREATE OR REPLACE FUNCTION settle_bet(
  p_bet_id  uuid,
  p_outcome text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_bet         bets%ROWTYPE;
  v_pnl         numeric;
  v_payout      numeric;
  v_new_balance numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_outcome NOT IN ('won','lost','void') THEN
    RAISE EXCEPTION 'Invalid outcome: must be won, lost, or void';
  END IF;

  -- Lock the row; verify ownership
  SELECT * INTO v_bet
  FROM bets
  WHERE id = p_bet_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bet not found or does not belong to user';
  END IF;

  -- Idempotent: already settled → return existing values, no changes
  IF v_bet.status != 'pending' THEN
    RETURN jsonb_build_object(
      'bet_id',      v_bet.id,
      'outcome',     v_bet.status,
      'pnl',         v_bet.pnl,
      'new_balance', NULL
    );
  END IF;

  -- Calculate pnl and bankroll payout
  IF p_outcome = 'won' THEN
    v_pnl    := v_bet.stake * (v_bet.total_odds - 1);
    v_payout := v_bet.stake * v_bet.total_odds;
  ELSIF p_outcome = 'lost' THEN
    v_pnl    := -v_bet.stake;
    v_payout := 0;
  ELSE -- void
    v_pnl    := 0;
    v_payout := v_bet.stake;
  END IF;

  -- Settle the bet
  UPDATE bets
  SET status             = p_outcome,
      settled_at         = now(),
      settlement_outcome = p_outcome,
      pnl                = v_pnl,
      updated_at         = now()
  WHERE id = p_bet_id AND user_id = v_user_id;

  -- Won / Void: return stake (+ winnings if won) to bankroll
  IF p_outcome IN ('won','void') AND v_bet.bankroll_id IS NOT NULL THEN
    UPDATE bankrolls
    SET balance = balance + v_payout
    WHERE id = v_bet.bankroll_id AND user_id = v_user_id
    RETURNING balance INTO v_new_balance;

    INSERT INTO bankroll_transactions (user_id, bankroll_id, bet_id, type, amount, balance_after)
    VALUES (v_user_id, v_bet.bankroll_id, p_bet_id, 'payout', v_payout, v_new_balance);
  END IF;

  RETURN jsonb_build_object(
    'bet_id',      p_bet_id,
    'outcome',     p_outcome,
    'pnl',         v_pnl,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION settle_bet TO authenticated;
