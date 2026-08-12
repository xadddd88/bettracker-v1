-- Security S2.3 fail-closed emergency stop.
-- REVIEW ONLY. Applying this causes a temporary outage for the eight
-- authenticated RPC features. It intentionally keeps restrictive Data API
-- policies, the S2.1 helper, service-role boundaries, data and audit history.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE s23_emergency_expected_base_relation (
  relation_name text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO s23_emergency_expected_base_relation (relation_name) VALUES
  ('public.ai_analysis_runs'),
  ('public.bankroll_transactions'),
  ('public.bankrolls'),
  ('public.bet_legs'),
  ('public.beta_feedback'),
  ('public.bets'),
  ('public.canonical_fixtures'),
  ('public.coaching_sessions'),
  ('public.decisions'),
  ('public.global_config'),
  ('public.market_catalog'),
  ('public.market_opportunities'),
  ('public.odds_snapshots'),
  ('public.profiles'),
  ('public.tennis_series'),
  ('public.tennis_series_steps');

CREATE TEMP TABLE s23_emergency_expected_non_table_relation (
  relation_name text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO s23_emergency_expected_non_table_relation (relation_name) VALUES
  ('public.odds_snapshots_public');

CREATE TEMP VIEW s23_emergency_effective_base_relation AS
SELECT format('%I.%I', n.nspname, c.relname) AS relation_name
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND (
    has_table_privilege('authenticated', c.oid, 'SELECT')
    OR has_table_privilege('authenticated', c.oid, 'INSERT')
    OR has_table_privilege('authenticated', c.oid, 'UPDATE')
    OR has_table_privilege('authenticated', c.oid, 'DELETE')
    OR has_table_privilege('authenticated', c.oid, 'TRUNCATE')
    OR has_table_privilege('authenticated', c.oid, 'REFERENCES')
    OR has_table_privilege('authenticated', c.oid, 'TRIGGER')
    OR has_any_column_privilege('authenticated', c.oid, 'SELECT')
    OR has_any_column_privilege('authenticated', c.oid, 'INSERT')
    OR has_any_column_privilege('authenticated', c.oid, 'UPDATE')
    OR has_any_column_privilege('authenticated', c.oid, 'REFERENCES')
  );

CREATE TEMP VIEW s23_emergency_effective_non_table_relation AS
SELECT format('%I.%I', n.nspname, c.relname) AS relation_name
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('v', 'm', 'f')
  AND (
    has_table_privilege('authenticated', c.oid, 'SELECT')
    OR has_table_privilege('authenticated', c.oid, 'INSERT')
    OR has_table_privilege('authenticated', c.oid, 'UPDATE')
    OR has_table_privilege('authenticated', c.oid, 'DELETE')
    OR has_table_privilege('authenticated', c.oid, 'TRUNCATE')
    OR has_table_privilege('authenticated', c.oid, 'REFERENCES')
    OR has_table_privilege('authenticated', c.oid, 'TRIGGER')
    OR has_any_column_privilege('authenticated', c.oid, 'SELECT')
    OR has_any_column_privilege('authenticated', c.oid, 'INSERT')
    OR has_any_column_privilege('authenticated', c.oid, 'UPDATE')
    OR has_any_column_privilege('authenticated', c.oid, 'REFERENCES')
  );

DO $preflight$
DECLARE
  v_signature text;
  v_function regprocedure;
  v_relation text;
  v_authenticated oid := (SELECT oid FROM pg_roles WHERE rolname = 'authenticated');
  v_service_role oid := (SELECT oid FROM pg_roles WHERE rolname = 'service_role');
BEGIN
  IF v_authenticated IS NULL OR v_service_role IS NULL THEN
    RAISE EXCEPTION 'required Supabase database roles are missing';
  END IF;

  IF EXISTS (
    SELECT relation_name
    FROM pg_temp.s23_emergency_effective_base_relation
    EXCEPT
    SELECT relation_name
    FROM pg_temp.s23_emergency_expected_base_relation
  ) OR EXISTS (
    SELECT relation_name
    FROM pg_temp.s23_emergency_expected_base_relation
    EXCEPT
    SELECT relation_name
    FROM pg_temp.s23_emergency_effective_base_relation
  ) THEN
    RAISE EXCEPTION 'refusing emergency stop on base relation inventory drift';
  END IF;

  IF EXISTS (
    SELECT relation_name
    FROM pg_temp.s23_emergency_effective_non_table_relation
    EXCEPT
    SELECT relation_name
    FROM pg_temp.s23_emergency_expected_non_table_relation
  ) OR EXISTS (
    SELECT relation_name
    FROM pg_temp.s23_emergency_expected_non_table_relation
    EXCEPT
    SELECT relation_name
    FROM pg_temp.s23_emergency_effective_non_table_relation
  ) THEN
    RAISE EXCEPTION 'refusing emergency stop on non-table relation inventory drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'odds_snapshots_public'
      AND c.relkind = 'v'
      AND c.reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'refusing emergency stop on view execution-mode drift';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) IS DISTINCT FROM 8 THEN
    RAISE EXCEPTION 'refusing emergency stop on widened RPC inventory';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.adjust_bankroll(text,numeric,text,text)',
    'public.cancel_pending_bet(uuid,text)',
    'public.complete_onboarding()',
    'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)',
    'public.save_user_settings(text,text,numeric,numeric,boolean,text)',
    'public.settle_bet(uuid,text)',
    'public.update_decision_action(uuid,text)',
    'public.update_opportunity_status(uuid,text,uuid)'
  ] LOOP
    v_function := to_regprocedure(v_signature);
    IF v_function IS NULL
       OR NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_function, 'EXECUTE')
       OR (
         SELECT count(*)
         FROM pg_proc AS p
         CROSS JOIN LATERAL aclexplode(
           COALESCE(p.proacl, acldefault('f', p.proowner))
         ) AS acl
         WHERE p.oid = v_function
           AND acl.privilege_type = 'EXECUTE'
           AND acl.grantee IN (v_authenticated, v_service_role)
           AND NOT acl.is_grantable
       ) IS DISTINCT FROM 2
       OR EXISTS (
         SELECT 1
         FROM pg_proc AS p
         CROSS JOIN LATERAL aclexplode(
           COALESCE(p.proacl, acldefault('f', p.proowner))
         ) AS acl
         WHERE p.oid = v_function
           AND acl.privilege_type = 'EXECUTE'
           AND acl.grantee <> p.proowner
           AND (
             acl.grantee NOT IN (v_authenticated, v_service_role)
             OR acl.is_grantable
           )
       )
       OR NOT EXISTS (
         SELECT 1
         FROM pg_proc
         WHERE oid = v_function
           AND prosecdef
           AND position('private.is_active_member()' in prosrc) > 0
       ) THEN
      RAISE EXCEPTION 'refusing emergency stop on unexpected RPC state: %',
        v_signature;
    END IF;
  END LOOP;

  FOR v_relation IN
    SELECT relation_name
    FROM pg_temp.s23_emergency_expected_base_relation
    ORDER BY relation_name
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policy AS p
      JOIN pg_class AS c ON c.oid = p.polrelid
      WHERE p.polrelid = to_regclass(v_relation)
        AND p.polname = 'active_membership_required'
        AND c.relrowsecurity
        AND NOT p.polpermissive
        AND p.polcmd = '*'
        AND p.polroles = ARRAY[v_authenticated]
        AND pg_get_expr(p.polqual, p.polrelid)
              = '( SELECT private.is_active_member() AS is_active_member)'
        AND pg_get_expr(p.polwithcheck, p.polrelid)
              = '( SELECT private.is_active_member() AS is_active_member)'
    ) THEN
      RAISE EXCEPTION 'refusing emergency stop on policy drift: %', v_relation;
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM pg_policy
    WHERE polname = 'active_membership_required'
  ) IS DISTINCT FROM 16 THEN
    RAISE EXCEPTION 'refusing emergency stop on policy inventory drift';
  END IF;
END
$preflight$;

REVOKE EXECUTE ON FUNCTION
  public.adjust_bankroll(text, numeric, text, text),
  public.cancel_pending_bet(uuid, text),
  public.complete_onboarding(),
  public.create_tracked_bet(jsonb, numeric, numeric, text, text, text, text),
  public.save_user_settings(text, text, numeric, numeric, boolean, text),
  public.settle_bet(uuid, text),
  public.update_decision_action(uuid, text),
  public.update_opportunity_status(uuid, text, uuid)
FROM authenticated;

DO $postflight$
DECLARE
  v_signature text;
  v_function regprocedure;
  v_relation text;
  v_authenticated oid := (SELECT oid FROM pg_roles WHERE rolname = 'authenticated');
  v_service_role oid := (SELECT oid FROM pg_roles WHERE rolname = 'service_role');
BEGIN
  IF EXISTS (
    SELECT relation_name
    FROM pg_temp.s23_emergency_effective_base_relation
    EXCEPT
    SELECT relation_name
    FROM pg_temp.s23_emergency_expected_base_relation
  ) OR EXISTS (
    SELECT relation_name
    FROM pg_temp.s23_emergency_expected_base_relation
    EXCEPT
    SELECT relation_name
    FROM pg_temp.s23_emergency_effective_base_relation
  ) THEN
    RAISE EXCEPTION 'emergency-stop base relation inventory mismatch';
  END IF;

  IF EXISTS (
    SELECT relation_name
    FROM pg_temp.s23_emergency_effective_non_table_relation
    EXCEPT
    SELECT relation_name
    FROM pg_temp.s23_emergency_expected_non_table_relation
  ) OR EXISTS (
    SELECT relation_name
    FROM pg_temp.s23_emergency_expected_non_table_relation
    EXCEPT
    SELECT relation_name
    FROM pg_temp.s23_emergency_effective_non_table_relation
  ) THEN
    RAISE EXCEPTION 'emergency-stop non-table relation inventory mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'odds_snapshots_public'
      AND c.relkind = 'v'
      AND c.reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'emergency-stop view execution-mode mismatch';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.adjust_bankroll(text,numeric,text,text)',
    'public.cancel_pending_bet(uuid,text)',
    'public.complete_onboarding()',
    'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)',
    'public.save_user_settings(text,text,numeric,numeric,boolean,text)',
    'public.settle_bet(uuid,text)',
    'public.update_decision_action(uuid,text)',
    'public.update_opportunity_status(uuid,text,uuid)'
  ] LOOP
    v_function := to_regprocedure(v_signature);
    IF has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_function, 'EXECUTE')
       OR has_function_privilege('anon', v_function, 'EXECUTE')
       OR (
         SELECT count(*)
         FROM pg_proc AS p
         CROSS JOIN LATERAL aclexplode(
           COALESCE(p.proacl, acldefault('f', p.proowner))
         ) AS acl
         WHERE p.oid = v_function
           AND acl.privilege_type = 'EXECUTE'
           AND acl.grantee = v_service_role
           AND NOT acl.is_grantable
       ) IS DISTINCT FROM 1
       OR EXISTS (
         SELECT 1
         FROM pg_proc AS p
         CROSS JOIN LATERAL aclexplode(
           COALESCE(p.proacl, acldefault('f', p.proowner))
         ) AS acl
         WHERE p.oid = v_function
           AND acl.privilege_type = 'EXECUTE'
           AND acl.grantee <> p.proowner
           AND (
             acl.grantee <> v_service_role
             OR acl.is_grantable
           )
       ) THEN
      RAISE EXCEPTION 'emergency-stop ACL mismatch: %', v_signature;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'emergency-stop authenticated definer inventory not empty';
  END IF;

  FOR v_relation IN
    SELECT relation_name
    FROM pg_temp.s23_emergency_expected_base_relation
    ORDER BY relation_name
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policy AS p
      JOIN pg_class AS c ON c.oid = p.polrelid
      WHERE p.polrelid = to_regclass(v_relation)
        AND p.polname = 'active_membership_required'
        AND c.relrowsecurity
        AND NOT p.polpermissive
        AND p.polcmd = '*'
        AND p.polroles = ARRAY[v_authenticated]
        AND pg_get_expr(p.polqual, p.polrelid)
              = '( SELECT private.is_active_member() AS is_active_member)'
        AND pg_get_expr(p.polwithcheck, p.polrelid)
              = '( SELECT private.is_active_member() AS is_active_member)'
    ) THEN
      RAISE EXCEPTION 'emergency-stop policy mismatch: %', v_relation;
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM pg_policy
    WHERE polname = 'active_membership_required'
  ) IS DISTINCT FROM 16 THEN
    RAISE EXCEPTION 'exact Data API policies must remain active';
  END IF;
END
$postflight$;

COMMIT;
