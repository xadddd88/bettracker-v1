-- ============================================================
-- Quarantine place_bet_from_decision behind the server boundary.
-- BetTracker Private policy J.6.
--
-- REVIEW ONLY — do not apply automatically.
--
-- The Decision and Analyst UI no longer call this RPC, but migration
-- 031 intentionally retained authenticated EXECUTE. A signed-in user
-- can therefore call the Data API endpoint directly and bypass the
-- required preview -> explicit-confirmation product boundary.
--
-- This migration changes only the exact function ACL. The function
-- body and every financial guard remain unchanged. Emergency rollback:
-- docs/place-bet-from-decision-quarantine-rollback.sql
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Fail closed if this is not the reviewed SECURITY DEFINER function
-- hardened by migration 031. This prevents an ACL change against an
-- unexpected overload or an unsafe function configuration.
DO $$
DECLARE
  v_rpc regprocedure := to_regprocedure('public.place_bet_from_decision(uuid,uuid,numeric,text,text)');
BEGIN
  IF v_rpc IS NULL THEN
    RAISE EXCEPTION
      'quarantine preflight failed: place_bet_from_decision signature missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    WHERE p.oid = v_rpc
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ) THEN
    RAISE EXCEPTION
      'quarantine preflight failed: function security configuration drift';
  END IF;
END
$$;

REVOKE EXECUTE ON FUNCTION public.place_bet_from_decision(
  uuid, uuid, numeric, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.place_bet_from_decision(
  uuid, uuid, numeric, text, text
) TO service_role;

-- Verify effective privileges, including a possible inherited PUBLIC
-- grant. A failed postcondition aborts the transaction atomically.
DO $$
DECLARE
  v_rpc regprocedure :=
    'public.place_bet_from_decision(uuid,uuid,numeric,text,text)'::regprocedure;
BEGIN
  IF has_function_privilege('anon', v_rpc, 'EXECUTE')
     OR has_function_privilege('authenticated', v_rpc, 'EXECUTE')
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
    RAISE EXCEPTION
      'quarantine postcondition failed: function ACL is not service-only';
  END IF;
END
$$;

COMMIT;
