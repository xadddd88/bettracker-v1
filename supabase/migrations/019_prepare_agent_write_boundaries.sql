-- ============================================================
-- Migration 019: Prepare agent write boundaries (Phase A)
-- Decision #049 — Scout / Coach domain write boundaries
--
-- ADDITIVE ONLY. Extends the Decision #048 pattern to the two
-- remaining agent-owned tables the CPO recorded as OPEN:
--   - market_opportunities (Scout) — its FOR ALL policy is
--     granted to role PUBLIC, and both anon and authenticated
--     hold the full table privilege set
--   - coaching_sessions (Coach) — user-callable INSERT policy
--
-- RPC layer (mirrors #048):
--   1. persist_market_opportunities(p_user_id, p_rows) —
--      server-only Scout persistence (service_role EXECUTE only);
--      p_user_id from the authenticated server session.
--      Defense-in-depth FP-001: model_probability /
--      implied_probability / edge_percent are FORCED to NULL
--      regardless of input (Scout pricing is gate-blocked, PR #122).
--   2. persist_coaching_session(p_user_id, …) — server-only
--      Coach persistence (service_role EXECUTE only).
--   3. update_opportunity_status(p_opportunity_id, p_status,
--      p_linked_decision_id) — authenticated user action
--      (dismiss / watchlist / convert), auth.uid()-scoped.
--
-- Enforcement (REVOKEs + SELECT-only policies) is migration 020.
-- ============================================================

-- ── 1. persist_market_opportunities() — service_role ONLY ────
-- p_rows is a JSON array of opportunity objects shaped exactly
-- like the Scout route's insert rows. Returns the inserted rows
-- as a jsonb array so the route keeps its response contract.

CREATE OR REPLACE FUNCTION persist_market_opportunities(
  p_user_id uuid,
  p_rows    jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row      jsonb;
  v_inserted jsonb := '[]'::jsonb;
  v_new      jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Unknown user';
  END IF;
  -- NULL-safe: jsonb_typeof(NULL) is NULL, so an explicit NULL check is
  -- required or a NULL batch would slip past as a silent empty success.
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a json array';
  END IF;
  IF jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 25 THEN
    RAISE EXCEPTION 'batch size must be between 1 and 25';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO market_opportunities (
      user_id, sport_code, event_name, market_type, selection,
      match_date, offered_odds, opportunity_type, scout_score,
      model_probability, implied_probability, edge_percent,
      confidence_score, risk_level, status, reasoning,
      required_checks, web_search_used, scout_run_input
    ) VALUES (
      p_user_id,
      v_row->>'sport_code',
      v_row->>'event_name',
      v_row->>'market_type',
      v_row->>'selection',
      NULLIF(v_row->>'match_date','')::date,
      NULLIF(v_row->>'offered_odds','')::numeric,
      COALESCE(v_row->>'opportunity_type','general'),
      NULLIF(v_row->>'scout_score','')::int,
      -- FP-001 defense-in-depth: pricing forced NULL regardless of input.
      NULL, NULL, NULL,
      NULLIF(v_row->>'confidence_score','')::int,
      v_row->>'risk_level',
      -- Status is structurally 'discovered' for a fresh Scout batch — never
      -- read from input (a caller cannot seed an opportunity as converted).
      'discovered',
      v_row->>'reasoning',
      v_row->'required_checks',
      COALESCE((v_row->>'web_search_used')::boolean, false),
      v_row->'scout_run_input'
    )
    RETURNING to_jsonb(market_opportunities.*) INTO v_new;

    v_inserted := v_inserted || jsonb_build_array(v_new);
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION persist_market_opportunities(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION persist_market_opportunities(uuid, jsonb) TO service_role;

-- ── 2. persist_coaching_session() — service_role ONLY ────────

CREATE OR REPLACE FUNCTION persist_coaching_session(
  p_user_id            uuid,
  p_period_days        int,
  p_period_start       date,
  p_period_end         date,
  p_bets_analysed      int,
  p_decisions_analysed int,
  p_summary            text,
  p_calibration_grade  text,
  p_strengths          jsonb,
  p_weaknesses         jsonb,
  p_recommendations    jsonb,
  p_patterns           jsonb,
  p_metrics_snapshot   jsonb,
  p_focus_notes        text,
  p_model_name         text,
  p_disclaimer         text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Unknown user';
  END IF;

  INSERT INTO coaching_sessions (
    user_id, period_days, period_start, period_end,
    bets_analysed, decisions_analysed, summary, calibration_grade,
    strengths, weaknesses, recommendations, patterns,
    metrics_snapshot, focus_notes, model_name, disclaimer
  ) VALUES (
    p_user_id, p_period_days, p_period_start, p_period_end,
    p_bets_analysed, p_decisions_analysed, p_summary, p_calibration_grade,
    p_strengths, p_weaknesses, p_recommendations, p_patterns,
    p_metrics_snapshot, p_focus_notes, p_model_name, p_disclaimer
  )
  RETURNING to_jsonb(coaching_sessions.*) INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION persist_coaching_session(uuid, int, date, date, int, int, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION persist_coaching_session(uuid, int, date, date, int, int, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text) TO service_role;

-- ── 3. update_opportunity_status() — authenticated state machine ──
-- Only genuine user actions are accepted: watchlisted / dismissed /
-- converted_to_decision. The row is locked (FOR UPDATE) and a state
-- machine governs transitions:
--   from discovered / research_needed / watchlisted →
--        watchlisted | dismissed (link must be NULL)
--        converted_to_decision (link required, owned, ai_analyst)
--   converted_to_decision / dismissed / expired are terminal
--   (an exact repeat of the same conversion link is idempotent).
-- The conversion link is immutable once set. 'expired' and other
-- system transitions are not reachable through this user path.
-- Error tokens are stable so the route can map them to status codes.

CREATE OR REPLACE FUNCTION update_opportunity_status(
  p_opportunity_id    uuid,
  p_status            text,
  p_linked_decision_id uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_current_status text;
  v_current_link  uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_status NOT IN ('watchlisted','dismissed','converted_to_decision') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  -- Lock the row, read current state.
  SELECT status, linked_decision_id
  INTO v_current_status, v_current_link
  FROM market_opportunities
  WHERE id = p_opportunity_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity_not_found';
  END IF;

  -- Terminal states.
  IF v_current_status = 'converted_to_decision' THEN
    -- Idempotent exact repeat of the same conversion is a no-op.
    IF p_status = 'converted_to_decision'
       AND p_linked_decision_id IS NOT NULL
       AND p_linked_decision_id = v_current_link THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'invalid_transition';
  END IF;
  IF v_current_status IN ('dismissed','expired') THEN
    RAISE EXCEPTION 'invalid_transition';
  END IF;

  -- Current status is now discovered / research_needed / watchlisted.
  IF p_status = 'converted_to_decision' THEN
    IF p_linked_decision_id IS NULL THEN
      RAISE EXCEPTION 'link_required';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM decisions
      WHERE id = p_linked_decision_id
        AND user_id = v_user_id
        AND source = 'ai_analyst'
    ) THEN
      RAISE EXCEPTION 'invalid_link';
    END IF;

    UPDATE market_opportunities SET
      status             = 'converted_to_decision',
      linked_decision_id = p_linked_decision_id,
      updated_at         = now()
    WHERE id = p_opportunity_id AND user_id = v_user_id;
  ELSE
    -- watchlisted / dismissed carry no link.
    IF p_linked_decision_id IS NOT NULL THEN
      RAISE EXCEPTION 'link_not_allowed';
    END IF;

    UPDATE market_opportunities SET
      status     = p_status,
      updated_at = now()
    WHERE id = p_opportunity_id AND user_id = v_user_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_opportunity_status(uuid, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION update_opportunity_status(uuid, text, uuid) TO authenticated, service_role;

-- One canonical opportunity per converted Decision — a Decision cannot be
-- claimed as the conversion target of two opportunities. Partial: only
-- rows that actually carry a link are constrained. Production verified
-- duplicate-free (read-only) before adding this.
CREATE UNIQUE INDEX IF NOT EXISTS uq_market_opp_linked_decision
  ON market_opportunities (linked_decision_id)
  WHERE linked_decision_id IS NOT NULL;
