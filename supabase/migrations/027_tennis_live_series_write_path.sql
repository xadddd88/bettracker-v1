-- Tennis Live Series Calculator PR-4
-- Closed server write path for the additive PR-3 schema.
--
-- Security boundary:
--   * all four RPCs are SECURITY INVOKER;
--   * EXECUTE is service_role-only;
--   * user identity is an explicit value supplied by the already-authenticated
--     server route, never accepted from a browser RPC call;
--   * authenticated and anon remain unable to mutate any calculator table;
--   * service_role receives only SELECT/INSERT/UPDATE on the three calculator
--     tables (no DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN);
--   * every command is payload-bound idempotent and every state mutation uses
--     an optimistic version plus a row lock.

BEGIN;

CREATE TABLE public.tennis_series_commands (
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id    uuid NOT NULL,
  command_name    text NOT NULL
                  CHECK (command_name IN ('create_series','confirm_step','settle_step','stop_series')),
  payload_hash    text NOT NULL
                  CHECK (payload_hash ~ '^[0-9a-f]{32}$'),
  series_id       uuid REFERENCES public.tennis_series(id) ON DELETE CASCADE,
  result_json     jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation_id)
);

CREATE INDEX idx_tennis_series_commands_series_id
  ON public.tennis_series_commands(series_id);

ALTER TABLE public.tennis_series_commands ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tennis_series_commands FROM PUBLIC;
REVOKE ALL ON public.tennis_series_commands FROM anon;
REVOKE ALL ON public.tennis_series_commands FROM authenticated;
REVOKE ALL ON public.tennis_series_commands FROM service_role;

-- Normalize the environment-dependent PR-3 service_role defaults.
REVOKE ALL ON public.tennis_series FROM service_role;
REVOKE ALL ON public.tennis_series_steps FROM service_role;

GRANT SELECT, INSERT, UPDATE ON public.tennis_series TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.tennis_series_steps TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.tennis_series_commands TO service_role;

CREATE OR REPLACE FUNCTION public.tennis_create_series(
  p_user_id uuid,
  p_operation_id uuid,
  p_target_profit numeric,
  p_initial_stake numeric,
  p_stake_increment numeric,
  p_currency_or_unit text,
  p_bankroll_limit numeric,
  p_maximum_stake numeric,
  p_maximum_steps integer,
  p_exposure_limit numeric,
  p_formula_version text,
  p_match_label text DEFAULT NULL
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
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_identity_or_operation';
  END IF;

  v_payload := jsonb_build_object(
    'target_profit', p_target_profit,
    'initial_stake', p_initial_stake,
    'stake_increment', p_stake_increment,
    'currency_or_unit', p_currency_or_unit,
    'bankroll_limit', p_bankroll_limit,
    'maximum_stake', p_maximum_stake,
    'maximum_steps', p_maximum_steps,
    'exposure_limit', p_exposure_limit,
    'formula_version', p_formula_version,
    'match_label', p_match_label
  );
  v_hash := md5(v_payload::text);

  SELECT * INTO v_existing
    FROM public.tennis_series_commands
   WHERE user_id = p_user_id AND operation_id = p_operation_id
   FOR UPDATE;

  IF FOUND THEN
    IF v_existing.command_name <> 'create_series' OR v_existing.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_existing.result_json || jsonb_build_object('replayed', true);
  END IF;

  INSERT INTO public.tennis_series (
    user_id, status, target_profit, initial_stake, stake_increment,
    currency_or_unit, bankroll_limit, maximum_stake, maximum_steps,
    exposure_limit, formula_version, version, match_label
  ) VALUES (
    p_user_id, 'draft', p_target_profit, p_initial_stake, p_stake_increment,
    p_currency_or_unit, p_bankroll_limit, p_maximum_stake, p_maximum_steps,
    p_exposure_limit, p_formula_version, 0, p_match_label
  )
  RETURNING * INTO v_series;

  v_result := jsonb_build_object(
    'series_id', v_series.id,
    'status', v_series.status,
    'version', v_series.version,
    'replayed', false
  );

  INSERT INTO public.tennis_series_commands (
    user_id, operation_id, command_name, payload_hash, series_id, result_json
  ) VALUES (
    p_user_id, p_operation_id, 'create_series', v_hash, v_series.id, v_result
  );

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION public.tennis_confirm_step(
  p_user_id uuid,
  p_series_id uuid,
  p_operation_id uuid,
  p_expected_version integer,
  p_set_number integer,
  p_game_number integer,
  p_quoted_odds numeric,
  p_recommended_stake numeric,
  p_accepted_odds numeric,
  p_accepted_stake numeric,
  p_loss_before numeric,
  p_target_profit_snapshot numeric,
  p_projected_series_result numeric
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
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_series_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_identity_or_operation';
  END IF;

  v_payload := jsonb_build_object(
    'series_id', p_series_id,
    'expected_version', p_expected_version,
    'set_number', p_set_number,
    'game_number', p_game_number,
    'quoted_odds', p_quoted_odds,
    'recommended_stake', p_recommended_stake,
    'accepted_odds', p_accepted_odds,
    'accepted_stake', p_accepted_stake,
    'loss_before', p_loss_before,
    'target_profit_snapshot', p_target_profit_snapshot,
    'projected_series_result', p_projected_series_result
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

  SELECT count(*)::integer + 1 INTO v_next_step
    FROM public.tennis_series_steps
   WHERE series_id = p_series_id;

  IF v_next_step > v_series.maximum_steps OR v_next_step > 15 THEN
    RAISE EXCEPTION 'max_games';
  END IF;
  IF p_recommended_stake > v_series.bankroll_limit
     OR p_accepted_stake > v_series.bankroll_limit THEN
    RAISE EXCEPTION 'bankroll_limit';
  END IF;
  IF v_series.maximum_stake IS NOT NULL
     AND (p_recommended_stake > v_series.maximum_stake
          OR p_accepted_stake > v_series.maximum_stake) THEN
    RAISE EXCEPTION 'maximum_stake';
  END IF;
  IF p_loss_before + p_accepted_stake > v_series.exposure_limit THEN
    RAISE EXCEPTION 'exposure_limit';
  END IF;

  INSERT INTO public.tennis_series_steps (
    series_id, step_number, operation_id, set_number, game_number,
    quoted_odds, recommended_stake, accepted_odds, accepted_stake,
    status, loss_before, target_profit_snapshot, projected_series_result
  ) VALUES (
    p_series_id, v_next_step, p_operation_id, p_set_number, p_game_number,
    p_quoted_odds, p_recommended_stake, p_accepted_odds, p_accepted_stake,
    'confirmed', p_loss_before, p_target_profit_snapshot, p_projected_series_result
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

CREATE OR REPLACE FUNCTION public.tennis_settle_step(
  p_user_id uuid,
  p_series_id uuid,
  p_step_id uuid,
  p_operation_id uuid,
  p_expected_version integer,
  p_result text,
  p_actual_return numeric DEFAULT NULL
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
  v_series_status text;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_series_id IS NULL OR p_step_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_identity_or_operation';
  END IF;
  IF p_result NOT IN ('won','lost','void') THEN RAISE EXCEPTION 'invalid_result'; END IF;
  IF p_result = 'won' AND p_actual_return IS NULL THEN RAISE EXCEPTION 'return_required'; END IF;
  IF p_result <> 'won' AND p_actual_return IS NOT NULL THEN RAISE EXCEPTION 'unexpected_return'; END IF;

  v_payload := jsonb_build_object(
    'series_id', p_series_id,
    'step_id', p_step_id,
    'expected_version', p_expected_version,
    'result', p_result,
    'actual_return', p_actual_return
  );
  v_hash := md5(v_payload::text);

  SELECT * INTO v_existing
    FROM public.tennis_series_commands
   WHERE user_id = p_user_id AND operation_id = p_operation_id
   FOR UPDATE;

  IF FOUND THEN
    IF v_existing.command_name <> 'settle_step' OR v_existing.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_existing.result_json || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_series
    FROM public.tennis_series
   WHERE id = p_series_id AND user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'series_not_found'; END IF;
  IF v_series.status <> 'active' THEN RAISE EXCEPTION 'series_not_active'; END IF;
  IF v_series.version <> p_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;

  SELECT * INTO v_step
    FROM public.tennis_series_steps
   WHERE id = p_step_id AND series_id = p_series_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'step_not_found'; END IF;
  IF v_step.status <> 'confirmed' THEN RAISE EXCEPTION 'step_not_pending'; END IF;

  UPDATE public.tennis_series_steps
     SET status = p_result, actual_return = p_actual_return, settled_at = now()
   WHERE id = p_step_id
  RETURNING * INTO v_step;

  IF p_result = 'won' THEN
    v_series_status := 'completed_win';
  ELSIF v_step.step_number >= v_series.maximum_steps OR v_step.step_number >= 15 THEN
    v_series_status := 'limit_reached';
  ELSE
    v_series_status := 'active';
  END IF;

  UPDATE public.tennis_series
     SET status = v_series_status,
         version = version + 1,
         closed_at = CASE WHEN v_series_status IN ('completed_win','limit_reached') THEN now() ELSE NULL END
   WHERE id = p_series_id
  RETURNING * INTO v_series;

  v_result := jsonb_build_object(
    'series_id', v_series.id,
    'step_id', v_step.id,
    'step_status', v_step.status,
    'status', v_series.status,
    'version', v_series.version,
    'replayed', false
  );

  INSERT INTO public.tennis_series_commands (
    user_id, operation_id, command_name, payload_hash, series_id, result_json
  ) VALUES (
    p_user_id, p_operation_id, 'settle_step', v_hash, p_series_id, v_result
  );

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION public.tennis_stop_series(
  p_user_id uuid,
  p_series_id uuid,
  p_operation_id uuid,
  p_expected_version integer
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
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_series_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_identity_or_operation';
  END IF;

  v_payload := jsonb_build_object(
    'series_id', p_series_id,
    'expected_version', p_expected_version
  );
  v_hash := md5(v_payload::text);

  SELECT * INTO v_existing
    FROM public.tennis_series_commands
   WHERE user_id = p_user_id AND operation_id = p_operation_id
   FOR UPDATE;

  IF FOUND THEN
    IF v_existing.command_name <> 'stop_series' OR v_existing.payload_hash <> v_hash THEN
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
    SELECT 1 FROM public.tennis_series_steps
     WHERE series_id = p_series_id AND status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'pending_step_exists';
  END IF;

  UPDATE public.tennis_series
     SET status = 'stopped', version = version + 1, closed_at = now()
   WHERE id = p_series_id
  RETURNING * INTO v_series;

  v_result := jsonb_build_object(
    'series_id', v_series.id,
    'status', v_series.status,
    'version', v_series.version,
    'replayed', false
  );

  INSERT INTO public.tennis_series_commands (
    user_id, operation_id, command_name, payload_hash, series_id, result_json
  ) VALUES (
    p_user_id, p_operation_id, 'stop_series', v_hash, p_series_id, v_result
  );

  RETURN v_result;
END
$$;

REVOKE ALL ON FUNCTION public.tennis_create_series(uuid,uuid,numeric,numeric,numeric,text,numeric,numeric,integer,numeric,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tennis_create_series(uuid,uuid,numeric,numeric,numeric,text,numeric,numeric,integer,numeric,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.tennis_create_series(uuid,uuid,numeric,numeric,numeric,text,numeric,numeric,integer,numeric,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tennis_create_series(uuid,uuid,numeric,numeric,numeric,text,numeric,numeric,integer,numeric,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.tennis_confirm_step(uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tennis_confirm_step(uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric) FROM anon;
REVOKE ALL ON FUNCTION public.tennis_confirm_step(uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tennis_confirm_step(uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric) TO service_role;

REVOKE ALL ON FUNCTION public.tennis_settle_step(uuid,uuid,uuid,uuid,integer,text,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tennis_settle_step(uuid,uuid,uuid,uuid,integer,text,numeric) FROM anon;
REVOKE ALL ON FUNCTION public.tennis_settle_step(uuid,uuid,uuid,uuid,integer,text,numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tennis_settle_step(uuid,uuid,uuid,uuid,integer,text,numeric) TO service_role;

REVOKE ALL ON FUNCTION public.tennis_stop_series(uuid,uuid,uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tennis_stop_series(uuid,uuid,uuid,integer) FROM anon;
REVOKE ALL ON FUNCTION public.tennis_stop_series(uuid,uuid,uuid,integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tennis_stop_series(uuid,uuid,uuid,integer) TO service_role;

DO $$
DECLARE
  v_function regprocedure;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.tennis_create_series(uuid,uuid,numeric,numeric,numeric,text,numeric,numeric,integer,numeric,text,text)'::regprocedure,
    'public.tennis_confirm_step(uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric)'::regprocedure,
    'public.tennis_settle_step(uuid,uuid,uuid,uuid,integer,text,numeric)'::regprocedure,
    'public.tennis_stop_series(uuid,uuid,uuid,integer)'::regprocedure
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc
       WHERE oid = v_function
         AND prosecdef
    ) THEN
      RAISE EXCEPTION '% must remain SECURITY INVOKER', v_function;
    END IF;

    IF NOT has_function_privilege('service_role', v_function, 'EXECUTE')
       OR has_function_privilege('anon', v_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'invalid EXECUTE boundary for %', v_function;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.tennis_series', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.tennis_series', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.tennis_series', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.tennis_series_steps', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.tennis_series_steps', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.tennis_series_steps', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.tennis_series_commands', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.tennis_series_commands', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.tennis_series_commands', 'UPDATE') THEN
    RAISE EXCEPTION 'service_role lacks the minimum write-path table privileges';
  END IF;

  IF has_table_privilege('authenticated', 'public.tennis_series', 'INSERT')
     OR has_table_privilege('authenticated', 'public.tennis_series_steps', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.tennis_series_commands', 'SELECT') THEN
    RAISE EXCEPTION 'client write or command-ledger access was introduced';
  END IF;
END
$$;

COMMIT;
