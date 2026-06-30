-- ============================================================
-- Migration 012: settle_bet() bug fixes
--
-- REVIEW ONLY — do NOT apply automatically.
-- Apply manually in Supabase SQL Editor after CPO accept + merge.
--
-- Fixes two bugs in the settle_bet() RPC introduced in 003:
--
-- BUG 1 — bet_legs.leg_status never updated after settlement.
--   All legs remained 'pending' forever regardless of bet outcome.
--   Fix: UPDATE bet_legs SET leg_status = p_outcome after settling.
--
-- BUG 2 — v_new_balance is NULL in the return value for 'lost' bets.
--   The bankroll SELECT ... INTO v_new_balance only ran for won/void.
--   Fix: for 'lost', read the current bankroll balance so the caller
--   always receives a non-null new_balance when a bankroll_id exists.
--
-- No schema changes. No data backfill required.
-- Existing settled bets are unaffected (function-only change).
-- ============================================================

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
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_outcome NOT IN ('won','lost','void') THEN
    RAISE EXCEPTION 'invalid_outcome';
  END IF;

  -- Lock the row; verify ownership
  SELECT * INTO v_bet
  FROM bets
  WHERE id = p_bet_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bet_not_found';
  END IF;

  -- Reject duplicate settlement
  IF v_bet.status != 'pending' THEN
    RAISE EXCEPTION 'already_settled';
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

  -- FIX 1: propagate outcome to all legs (was never done in 003)
  UPDATE bet_legs
  SET leg_status = p_outcome,
      updated_at = now()
  WHERE bet_id = p_bet_id;

  -- Won / Void: return stake (+ winnings if won) to bankroll
  IF p_outcome IN ('won','void') AND v_bet.bankroll_id IS NOT NULL THEN
    UPDATE bankrolls
    SET balance = balance + v_payout
    WHERE id = v_bet.bankroll_id AND user_id = v_user_id
    RETURNING balance INTO v_new_balance;

    INSERT INTO bankroll_transactions (user_id, bankroll_id, bet_id, type, amount, balance_after)
    VALUES (v_user_id, v_bet.bankroll_id, p_bet_id, 'payout', v_payout, v_new_balance);
  END IF;

  -- FIX 2: for 'lost', read current balance so return value is non-null
  IF p_outcome = 'lost' AND v_bet.bankroll_id IS NOT NULL THEN
    SELECT balance INTO v_new_balance
    FROM bankrolls
    WHERE id = v_bet.bankroll_id AND user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'bet_id',      p_bet_id,
    'outcome',     p_outcome,
    'pnl',         v_pnl,
    'new_balance', v_new_balance
  );
END;
$$;

-- GRANT is idempotent — already set in 003, repeated here for safety
GRANT EXECUTE ON FUNCTION settle_bet TO authenticated;

-- ── Verification queries (run after applying) ────────────────
-- 1. Confirm function body contains the leg_status UPDATE:
--    SELECT prosrc FROM pg_proc WHERE proname = 'settle_bet';
--
-- 2. Spot-check a recently settled bet's legs:
--    SELECT b.id, b.status, bl.leg_status
--    FROM bets b JOIN bet_legs bl ON bl.bet_id = b.id
--    WHERE b.status != 'pending'
--    LIMIT 10;
--
-- 3. Smoke-test the return value (replace with a real pending bet_id):
--    SELECT settle_bet('<uuid>', 'lost');
--    -- new_balance should be a number, not null.
