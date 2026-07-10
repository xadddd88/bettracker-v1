-- ============================================================
-- Migration 017: Prepare domain write boundaries (Phase A)
-- Decision #048 — Core Domain Write Boundaries
--
-- ADDITIVE ONLY — nothing is revoked here. This migration adds
-- the RPC layer that lets every active application writer stop
-- touching core tables directly, so that migration 018 can
-- revoke direct DML without downtime:
--
-- 1. persist_analysis_decision() — SERVER-ONLY Analyst
--    persistence (service_role EXECUTE only). Closes the FP-001
--    bypass: create_decision_with_analysis() is user-callable
--    and accepts model_probability / implied_probability /
--    edge_percent, letting any authenticated user write
--    fabricated pricing while skipping the /api/ai/analyst
--    quality gate. The new function takes an explicit p_user_id
--    that the route derives from the authenticated server
--    session — never from the request body.
-- 2. save_user_settings() — atomic profile settings update
--    including the default-bankroll currency sync (replaces the
--    direct profiles UPDATE in /api/settings).
-- 3. complete_onboarding() — replaces the direct profiles
--    UPDATE in /api/onboarding/complete.
--
-- Enforcement (REVOKEs + SELECT-only policies) is migration
-- 018, applied only after these callers are deployed.
-- ============================================================

-- ── 1. persist_analysis_decision() — service_role ONLY ──────
-- Body mirrors create_decision_with_analysis() (migration 002)
-- with identity supplied by the server: p_user_id comes from the
-- authenticated session in /api/ai/analyst, which runs the
-- FP-001 quality gate BEFORE persisting.

CREATE OR REPLACE FUNCTION persist_analysis_decision(
  p_user_id         uuid,
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
  v_decision_id uuid;
  v_run_id      uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Unknown user';
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
    p_user_id, p_sport, p_event_name, p_market_type, p_selection, p_line,
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
    p_user_id, v_decision_id, p_agent_type, p_model_name,
    p_input_snapshot, p_reasoning, p_output_json,
    p_confidence_score, p_web_search_used,
    p_input_language, p_output_language, p_detected_language,
    p_input_chars, p_output_chars
  )
  RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'decision_id',     v_decision_id,
    'analysis_run_id', v_run_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION persist_analysis_decision(uuid, text, text, text, text, numeric, numeric, text, text, text, jsonb, text, text, numeric, numeric, numeric, numeric, text, text, text, jsonb, text, text, jsonb, jsonb, boolean, int, int, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION persist_analysis_decision(uuid, text, text, text, text, numeric, numeric, text, text, text, jsonb, text, text, numeric, numeric, numeric, numeric, text, text, text, jsonb, text, text, jsonb, jsonb, boolean, int, int, text) TO service_role;

-- ── 2. save_user_settings() — authenticated ──────────────────
-- One atomic transaction for every profile setting the app
-- exposes, including the currency sync to the default bankroll
-- (same exactly-one-row invariant as set_user_currency). A NULL
-- parameter means "leave unchanged". Returns the updated profile
-- row so the route needs no separate read-back.

CREATE OR REPLACE FUNCTION save_user_settings(
  p_display_name       text DEFAULT NULL,
  p_currency           text DEFAULT NULL,
  p_default_stake      numeric DEFAULT NULL,
  p_kelly_fraction     numeric DEFAULT NULL,
  p_web_search_enabled boolean DEFAULT NULL,
  p_timezone           text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rows    integer;
  v_profile jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_display_name IS NULL AND p_currency IS NULL AND p_default_stake IS NULL
     AND p_kelly_fraction IS NULL AND p_web_search_enabled IS NULL AND p_timezone IS NULL THEN
    RAISE EXCEPTION 'No fields provided';
  END IF;

  IF p_display_name IS NOT NULL AND length(p_display_name) > 50 THEN
    RAISE EXCEPTION 'Display name too long';
  END IF;
  IF p_currency IS NOT NULL AND p_currency NOT IN ('USD', 'EUR', 'UAH', 'GBP', 'CAD', 'AUD') THEN
    RAISE EXCEPTION 'Unsupported currency';
  END IF;
  IF p_default_stake IS NOT NULL AND (p_default_stake < 0.01 OR p_default_stake > 100000) THEN
    RAISE EXCEPTION 'Default stake out of range';
  END IF;
  IF p_kelly_fraction IS NOT NULL AND (p_kelly_fraction < 0.1 OR p_kelly_fraction > 1.0) THEN
    RAISE EXCEPTION 'Kelly fraction out of range';
  END IF;
  IF p_timezone IS NOT NULL AND length(p_timezone) > 100 THEN
    RAISE EXCEPTION 'Timezone too long';
  END IF;

  UPDATE profiles SET
    display_name       = COALESCE(p_display_name, display_name),
    currency           = COALESCE(p_currency, currency),
    default_stake      = COALESCE(p_default_stake, default_stake),
    kelly_fraction     = COALESCE(p_kelly_fraction, kelly_fraction),
    web_search_enabled = COALESCE(p_web_search_enabled, web_search_enabled),
    timezone           = COALESCE(p_timezone, timezone),
    updated_at         = now()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Currency invariant (Decision #047): EXACTLY one default
  -- bankroll takes the new currency, or everything rolls back.
  IF p_currency IS NOT NULL THEN
    UPDATE bankrolls SET currency = p_currency
    WHERE user_id = v_user_id AND is_default = true;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      RAISE EXCEPTION 'No default bankroll found';
    END IF;
    IF v_rows > 1 THEN
      RAISE EXCEPTION 'Multiple default bankrolls';
    END IF;
  END IF;

  SELECT to_jsonb(p) INTO v_profile FROM profiles p WHERE p.id = v_user_id;
  RETURN v_profile;
END;
$$;

REVOKE EXECUTE ON FUNCTION save_user_settings(text, text, numeric, numeric, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION save_user_settings(text, text, numeric, numeric, boolean, text) TO authenticated, service_role;

-- ── 3. complete_onboarding() — authenticated ─────────────────

CREATE OR REPLACE FUNCTION complete_onboarding()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE profiles SET
    onboarding_completed = true,
    onboarding_stage     = 'completed',
    updated_at           = now()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN jsonb_build_object('onboarding_completed', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_onboarding() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION complete_onboarding() TO authenticated, service_role;
