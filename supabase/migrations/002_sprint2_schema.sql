-- ============================================================
-- BetTracker AI -- Schema v2.0
-- Sprint 2: Decision Intelligence MVP
--
-- Incremental migration -- safe to run on top of 001.
-- Does NOT drop existing data.
-- ============================================================

-- ── Add locale/language fields to decisions ─────────────────
ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS input_language   text,
  ADD COLUMN IF NOT EXISTS output_language  text,
  ADD COLUMN IF NOT EXISTS raw_event_text   text,
  ADD COLUMN IF NOT EXISTS raw_market_text  text,
  ADD COLUMN IF NOT EXISTS participants     jsonb;

-- ── Add locale/language fields to ai_analysis_runs ──────────
ALTER TABLE ai_analysis_runs
  ADD COLUMN IF NOT EXISTS input_language   text,
  ADD COLUMN IF NOT EXISTS output_language  text,
  ADD COLUMN IF NOT EXISTS detected_language text,
  ADD COLUMN IF NOT EXISTS input_chars      int,
  ADD COLUMN IF NOT EXISTS output_chars     int;

-- ── ATOMIC RPC: create_decision_with_analysis() ─────────────
-- Creates decision + ai_analysis_run in one transaction.
-- Returns { decision_id, analysis_run_id }
CREATE OR REPLACE FUNCTION create_decision_with_analysis(
  -- Decision fields
  p_sport           text,
  p_event_name      text,
  p_market_type     text,
  p_selection       text DEFAULT NULL,
  p_line            numeric DEFAULT NULL,
  p_offered_odds    numeric DEFAULT NULL,
  p_bookmaker       text DEFAULT NULL,
  p_raw_event_text  text DEFAULT NULL,
  p_raw_market_text text DEFAULT NULL,
  p_participants    jsonb DEFAULT NULL,
  p_input_language  text DEFAULT NULL,
  p_output_language text DEFAULT NULL,
  -- Analysis fields
  p_model_probability   numeric DEFAULT NULL,
  p_implied_probability numeric DEFAULT NULL,
  p_edge_percent        numeric DEFAULT NULL,
  p_confidence_score    numeric DEFAULT NULL,
  p_risk_level          text DEFAULT NULL,
  p_recommendation      text DEFAULT NULL,
  p_reasoning           text DEFAULT NULL,
  p_factors             jsonb DEFAULT NULL,
  -- AI run meta
  p_model_name          text DEFAULT NULL,
  p_agent_type          text DEFAULT 'analyst',
  p_input_snapshot      jsonb DEFAULT NULL,
  p_output_json         jsonb DEFAULT NULL,
  p_web_search_used     boolean DEFAULT false,
  p_input_chars         int DEFAULT NULL,
  p_output_chars        int DEFAULT NULL,
  p_detected_language   text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_decision_id uuid;
  v_run_id      uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Insert decision
  INSERT INTO decisions (
    user_id, sport, event_name, market_type, selection, line,
    offered_odds, bookmaker, raw_event_text, raw_market_text, participants,
    input_language, output_language,
    model_probability, implied_probability, edge_percent,
    confidence_score, risk_level, recommendation,
    reasoning, factors,
    source, final_action
  ) VALUES (
    v_user_id, p_sport, p_event_name, p_market_type, p_selection, p_line,
    p_offered_odds, p_bookmaker, p_raw_event_text, p_raw_market_text, p_participants,
    p_input_language, p_output_language,
    p_model_probability, p_implied_probability, p_edge_percent,
    p_confidence_score, p_risk_level, p_recommendation,
    p_reasoning, p_factors,
    'ai_analyst', 'pending'
  )
  RETURNING id INTO v_decision_id;

  -- 2. Insert ai_analysis_run linked to decision
  INSERT INTO ai_analysis_runs (
    user_id, decision_id, agent_type, model_name,
    input_snapshot, output_summary, output_json,
    confidence_score, web_search_used,
    input_language, output_language, detected_language,
    input_chars, output_chars
  ) VALUES (
    v_user_id, v_decision_id, p_agent_type, p_model_name,
    p_input_snapshot, p_reasoning, p_output_json,
    p_confidence_score, p_web_search_used,
    p_input_language, p_output_language, p_detected_language,
    p_input_chars, p_output_chars
  )
  RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'decision_id',    v_decision_id,
    'analysis_run_id', v_run_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_decision_with_analysis TO authenticated;

-- ── ATOMIC RPC: place_bet_from_decision() ───────────────────
-- Creates bet + bet_leg + bankroll_transaction, updates bankroll balance,
-- marks decision as placed. All in one transaction.
-- Returns { bet_id }
CREATE OR REPLACE FUNCTION place_bet_from_decision(
  p_decision_id   uuid,
  p_bankroll_id   uuid DEFAULT NULL,
  p_stake         numeric DEFAULT NULL,
  p_bookmaker     text DEFAULT NULL,
  p_notes         text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_decision    decisions%ROWTYPE;
  v_bankroll_id uuid := p_bankroll_id;
  v_bet_id      uuid;
  v_new_balance numeric;
  v_stake       numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Load and validate decision
  SELECT * INTO v_decision FROM decisions
  WHERE id = p_decision_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found or does not belong to user';
  END IF;

  IF v_decision.offered_odds IS NULL OR v_decision.offered_odds <= 1 THEN
    RAISE EXCEPTION 'Decision has no valid odds — cannot place bet';
  END IF;

  -- Resolve stake
  v_stake := COALESCE(p_stake, 0);
  IF v_stake <= 0 THEN
    RAISE EXCEPTION 'Stake must be positive';
  END IF;

  -- Resolve bankroll
  IF v_bankroll_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM bankrolls WHERE id = v_bankroll_id AND user_id = v_user_id) THEN
      RAISE EXCEPTION 'Bankroll not found or does not belong to user';
    END IF;
  ELSE
    SELECT id INTO v_bankroll_id FROM bankrolls
    WHERE user_id = v_user_id AND is_default = true LIMIT 1;
    IF v_bankroll_id IS NULL THEN
      RAISE EXCEPTION 'No default bankroll found';
    END IF;
  END IF;

  -- 1. Create bet
  INSERT INTO bets (
    user_id, bankroll_id, bet_type, stake, total_odds,
    potential_payout, status, bookmaker, source, notes
  ) VALUES (
    v_user_id, v_bankroll_id, 'single', v_stake, v_decision.offered_odds,
    v_stake * v_decision.offered_odds, 'pending',
    COALESCE(p_bookmaker, v_decision.bookmaker),
    'quick_entry', p_notes
  )
  RETURNING id INTO v_bet_id;

  -- 2. Create bet_leg linked to decision
  INSERT INTO bet_legs (
    bet_id, decision_id, sport, event_name, market_type,
    selection, line, odds, leg_status
  ) VALUES (
    v_bet_id, p_decision_id, v_decision.sport, v_decision.event_name,
    v_decision.market_type, v_decision.selection, v_decision.line,
    v_decision.offered_odds, 'pending'
  );

  -- 3. Deduct from bankroll
  UPDATE bankrolls SET balance = balance - v_stake
  WHERE id = v_bankroll_id AND user_id = v_user_id
  RETURNING balance INTO v_new_balance;

  -- 4. Record transaction
  INSERT INTO bankroll_transactions (
    user_id, bankroll_id, bet_id, type, amount, balance_after
  ) VALUES (
    v_user_id, v_bankroll_id, v_bet_id, 'stake', -v_stake, v_new_balance
  );

  -- 5. Mark decision as placed
  UPDATE decisions SET final_action = 'placed', updated_at = now()
  WHERE id = p_decision_id AND user_id = v_user_id;

  RETURN jsonb_build_object('bet_id', v_bet_id);
END;
$$;

GRANT EXECUTE ON FUNCTION place_bet_from_decision TO authenticated;

-- ── RPC: update_decision_action() ───────────────────────────
-- Marks a decision as skipped or watchlisted.
CREATE OR REPLACE FUNCTION update_decision_action(
  p_decision_id  uuid,
  p_final_action text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_final_action NOT IN ('skipped', 'watchlisted', 'pending', 'ignored') THEN
    RAISE EXCEPTION 'Invalid final_action value: %', p_final_action;
  END IF;

  UPDATE decisions
  SET final_action = p_final_action, updated_at = now()
  WHERE id = p_decision_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found or does not belong to user';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_decision_action TO authenticated;
