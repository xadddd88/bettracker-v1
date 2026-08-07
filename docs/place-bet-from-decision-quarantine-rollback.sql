-- ============================================================
-- EMERGENCY ROLLBACK: place_bet_from_decision quarantine.
--
-- Manual-only. Run only after separately approved operational
-- rollback because this restores the previously accepted direct
-- authenticated RPC boundary and reopens policy-bypass risk J.6.
-- PUBLIC and anon remain denied; service_role remains available.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  v_rpc regprocedure := to_regprocedure(
    'public.place_bet_from_decision(uuid,uuid,numeric,text,text)'
  );
BEGIN
  IF v_rpc IS NULL THEN
    RAISE EXCEPTION
      'ROLLBACK REFUSED: place_bet_from_decision signature missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    WHERE p.oid = v_rpc
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ) THEN
    RAISE EXCEPTION
      'ROLLBACK REFUSED: function security configuration drift';
  END IF;

  IF has_function_privilege('authenticated', v_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'ROLLBACK REFUSED: quarantine is not active';
  END IF;

  IF has_function_privilege('anon', v_rpc, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_rpc, 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_proc AS p
       CROSS JOIN LATERAL aclexplode(
         COALESCE(p.proacl, acldefault('f', p.proowner))
       ) AS acl
       WHERE p.oid = v_rpc
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'ROLLBACK REFUSED: quarantine ACL drift';
  END IF;
END
$$;

REVOKE EXECUTE ON FUNCTION public.place_bet_from_decision(
  uuid, uuid, numeric, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.place_bet_from_decision(
  uuid, uuid, numeric, text, text
) TO authenticated, service_role;

DO $$
DECLARE
  v_rpc regprocedure :=
    'public.place_bet_from_decision(uuid,uuid,numeric,text,text)'::regprocedure;
BEGIN
  IF has_function_privilege('anon', v_rpc, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_rpc, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_rpc, 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_proc AS p
       CROSS JOIN LATERAL aclexplode(
         COALESCE(p.proacl, acldefault('f', p.proowner))
       ) AS acl
       WHERE p.oid = v_rpc
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'rollback postcondition failed: prior ACL not restored';
  END IF;
END
$$;

COMMIT;
