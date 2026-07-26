-- Tennis Calculator growing-profit plan.
--
-- Same RPC signature as migration 028. The only behavior change is for
-- formula_version = v3-growing-odds:*: target_profit is treated as the base
-- game-1 target, and the authoritative confirm step targets N x base target.

CREATE OR REPLACE FUNCTION public.tennis_confirm_step(
  p_user_id uuid,
  p_series_id uuid,
  p_operation_id uuid,
  p_expected_version integer,
  p_set_number integer,
  p_game_number integer,
  p_quoted_odds numeric,
  p_accepted_odds numeric,
  p_accepted_stake numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb;
  v_hash text;
  v_existing public.tennis_series_commands%ROWTYPE;
  v_series public.tennis_series%ROWTYPE;
  v_step public.tennis_series_steps%ROWTYPE;
  v_next_step integer;
  v_loss_before numeric;
  v_recommended_stake numeric;
  v_target_profit_snapshot numeric;
  v_projected_series_result numeric;
  v_loss_minor bigint;
  v_target_minor bigint;
  v_stake_increment_minor bigint;
  v_quoted_odds_scaled bigint;
  v_accepted_odds_scaled bigint;
  v_accepted_stake_minor bigint;
  v_denominator bigint;
  v_recommended_raw_minor bigint;
  v_recommended_minor bigint;
  v_projected_minor bigint;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_series_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_identity_or_operation';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'invalid_version';
  END IF;
  IF p_set_number IS NOT NULL AND p_set_number <= 0 THEN
    RAISE EXCEPTION 'invalid_set_number';
  END IF;
  IF p_game_number IS NOT NULL AND p_game_number <= 0 THEN
    RAISE EXCEPTION 'invalid_game_number';
  END IF;
  IF p_quoted_odds IS NULL
     OR scale(p_quoted_odds) > 3
     OR p_quoted_odds < 1.010
     OR p_quoted_odds > 20.000
     OR p_accepted_odds IS NULL
     OR scale(p_accepted_odds) > 3
     OR p_accepted_odds < 1.010
     OR p_accepted_odds > 20.000 THEN
    RAISE EXCEPTION 'invalid_odds';
  END IF;
  IF p_accepted_stake IS NULL
     OR scale(p_accepted_stake) > 2
     OR p_accepted_stake <= 0
     OR p_accepted_stake > 100000000 THEN
    RAISE EXCEPTION 'invalid_stake';
  END IF;

  v_payload := jsonb_build_object(
    'series_id', p_series_id,
    'expected_version', p_expected_version,
    'set_number', p_set_number,
    'game_number', p_game_number,
    'quoted_odds', p_quoted_odds,
    'accepted_odds', p_accepted_odds,
    'accepted_stake', p_accepted_stake
  );
  v_hash := md5(v_payload::text);

  SELECT * INTO v_existing
    FROM public.tennis_series_commands
   WHERE user_id = p_user_id AND operation_id = p_operation_id
   FOR UPDATE;

  IF FOUND THEN
    IF v_existing.command_name <> 'confirm_step' OR v_existing.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_existing.result_json || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_series
    FROM public.tennis_series
   WHERE id = p_series_id AND user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'series_not_found'; END IF;
  IF v_series.status NOT IN ('draft','active') THEN RAISE EXCEPTION 'series_not_open'; END IF;
  IF v_series.version <> p_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;

  IF EXISTS (
    SELECT 1
      FROM public.tennis_series_steps
     WHERE series_id = p_series_id AND status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'pending_step_exists';
  END IF;

  SELECT count(*)::integer + 1 INTO v_next_step
    FROM public.tennis_series_steps
   WHERE series_id = p_series_id;

  IF v_next_step > v_series.maximum_steps OR v_next_step > 15 THEN
    RAISE EXCEPTION 'max_games';
  END IF;

  SELECT COALESCE(sum(accepted_stake), 0)
    INTO v_loss_before
    FROM public.tennis_series_steps
   WHERE series_id = p_series_id AND status = 'lost';

  v_loss_minor := (v_loss_before * 100)::bigint;
  v_target_minor := (v_series.target_profit * 100)::bigint;
  IF v_series.formula_version LIKE 'v3-growing-odds:%' THEN
    v_target_minor := v_target_minor * v_next_step;
  END IF;
  IF v_target_minor <= 0 OR v_target_minor > 10000000000 THEN
    RAISE EXCEPTION 'invalid_calculation_input';
  END IF;

  v_stake_increment_minor := (v_series.stake_increment * 100)::bigint;
  v_quoted_odds_scaled := (p_quoted_odds * 1000)::bigint;
  v_accepted_odds_scaled := (p_accepted_odds * 1000)::bigint;
  v_accepted_stake_minor := (p_accepted_stake * 100)::bigint;
  v_denominator := v_quoted_odds_scaled - 1000;

  IF v_stake_increment_minor <= 0 OR v_denominator <= 0 THEN
    RAISE EXCEPTION 'invalid_calculation_input';
  END IF;

  IF v_next_step = 1 AND v_series.initial_stake IS NOT NULL THEN
    v_recommended_minor := (v_series.initial_stake * 100)::bigint;
  ELSE
    v_recommended_raw_minor :=
      ((v_loss_minor + v_target_minor) * 1000 + v_denominator - 1) / v_denominator;
    v_recommended_minor :=
      ((v_recommended_raw_minor + v_stake_increment_minor - 1) / v_stake_increment_minor)
      * v_stake_increment_minor;
  END IF;

  v_projected_minor :=
    (v_accepted_stake_minor * (v_accepted_odds_scaled - 1000) / 1000) - v_loss_minor;

  IF v_recommended_minor <= 0 OR v_recommended_minor > 10000000000 THEN
    RAISE EXCEPTION 'recommended_stake_out_of_range';
  END IF;
  IF v_projected_minor < -10000000000 OR v_projected_minor > 10000000000 THEN
    RAISE EXCEPTION 'projected_result_out_of_range';
  END IF;

  v_recommended_stake := v_recommended_minor::numeric * 0.01;
  v_target_profit_snapshot := v_target_minor::numeric * 0.01;
  v_projected_series_result := v_projected_minor::numeric * 0.01;

  IF v_loss_before + v_recommended_stake > v_series.bankroll_limit
     OR v_loss_before + p_accepted_stake > v_series.bankroll_limit THEN
    RAISE EXCEPTION 'bankroll_limit';
  END IF;
  IF v_series.maximum_stake IS NOT NULL
     AND (v_recommended_stake > v_series.maximum_stake
          OR p_accepted_stake > v_series.maximum_stake) THEN
    RAISE EXCEPTION 'maximum_stake';
  END IF;
  IF v_loss_before + v_recommended_stake > v_series.exposure_limit
     OR v_loss_before + p_accepted_stake > v_series.exposure_limit THEN
    RAISE EXCEPTION 'exposure_limit';
  END IF;

  INSERT INTO public.tennis_series_steps (
    series_id, step_number, operation_id, set_number, game_number,
    quoted_odds, recommended_stake, accepted_odds, accepted_stake,
    status, loss_before, target_profit_snapshot, projected_series_result
  ) VALUES (
    p_series_id, v_next_step, p_operation_id, p_set_number, p_game_number,
    p_quoted_odds, v_recommended_stake, p_accepted_odds, p_accepted_stake,
    'confirmed', v_loss_before, v_target_profit_snapshot, v_projected_series_result
  )
  RETURNING * INTO v_step;

  UPDATE public.tennis_series
     SET status = 'active', version = version + 1
   WHERE id = p_series_id
  RETURNING * INTO v_series;

  v_result := jsonb_build_object(
    'series_id', v_series.id,
    'step_id', v_step.id,
    'step_number', v_step.step_number,
    'status', v_series.status,
    'version', v_series.version,
    'recommended_stake', v_step.recommended_stake::text,
    'loss_before', v_step.loss_before::text,
    'target_profit_snapshot', v_step.target_profit_snapshot::text,
    'projected_series_result', v_step.projected_series_result::text,
    'replayed', false
  );

  INSERT INTO public.tennis_series_commands (
    user_id, operation_id, command_name, payload_hash, series_id, result_json
  ) VALUES (
    p_user_id, p_operation_id, 'confirm_step', v_hash, p_series_id, v_result
  );

  RETURN v_result;
END
$$;

REVOKE ALL ON FUNCTION public.tennis_confirm_step(
  uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tennis_confirm_step(
  uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric
) FROM anon;
REVOKE ALL ON FUNCTION public.tennis_confirm_step(
  uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tennis_confirm_step(
  uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric
) TO service_role;
