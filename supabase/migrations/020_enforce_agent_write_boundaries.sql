-- ============================================================
-- Migration 020: Enforce agent write boundaries (Phase B)
-- Decision #049 — Scout / Coach domain write boundaries
--
-- Apply ONLY after migration 019 is applied AND the application
-- deploy that moved Scout/Coach onto the RPC layer is READY in
-- production (/api/scout, /api/scout/[id], /api/coach).
--
-- market_opportunities and coaching_sessions become SELECT-only
-- for authenticated (own rows via RLS); every write goes through
-- the approved SECURITY DEFINER RPCs. anon and PUBLIC lose all
-- table access. service_role keeps full access.
--
-- No FORCE ROW LEVEL SECURITY. Emergency rollback:
-- docs/decision-049-rollback.sql (manual-only).
-- ============================================================

-- ── Phase-A prerequisite preflight (fail-closed) ─────────────
DO $$
DECLARE
  v_opps regprocedure := to_regprocedure('persist_market_opportunities(uuid,jsonb)');
  v_coach regprocedure := to_regprocedure('persist_coaching_session(uuid,integer,date,date,integer,integer,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,text)');
  v_status regprocedure := to_regprocedure('update_opportunity_status(uuid,text,uuid)');
BEGIN
  IF v_opps IS NULL THEN
    RAISE EXCEPTION 'Phase A missing: persist_market_opportunities not found — apply migration 019 first';
  END IF;
  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'Phase A missing: persist_coaching_session not found — apply migration 019 first';
  END IF;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Phase A missing: update_opportunity_status not found — apply migration 019 first';
  END IF;

  IF NOT has_function_privilege('service_role', v_opps, 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase A invalid: service_role lacks EXECUTE on persist_market_opportunities';
  END IF;
  IF has_function_privilege('authenticated', v_opps, 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase A invalid: authenticated must NOT have EXECUTE on persist_market_opportunities';
  END IF;
  IF has_function_privilege('authenticated', v_coach, 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase A invalid: authenticated must NOT have EXECUTE on persist_coaching_session';
  END IF;
  IF NOT has_function_privilege('authenticated', v_status, 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase A invalid: authenticated lacks EXECUTE on update_opportunity_status';
  END IF;
END
$$;

-- REVOKE ALL (not enumerated) — covers PostgreSQL 17 MAINTAIN.

-- ── market_opportunities ─────────────────────────────────────
REVOKE ALL ON public.market_opportunities FROM PUBLIC;
REVOKE ALL ON public.market_opportunities FROM anon;
REVOKE ALL ON public.market_opportunities FROM authenticated;
GRANT SELECT ON public.market_opportunities TO authenticated;
-- The old policy was FOR ALL granted to role PUBLIC — worse than the core tables.
DROP POLICY IF EXISTS "Users see own opportunities" ON public.market_opportunities;
DROP POLICY IF EXISTS "market_opportunities select own" ON public.market_opportunities;
CREATE POLICY "market_opportunities select own" ON public.market_opportunities
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ── coaching_sessions ────────────────────────────────────────
REVOKE ALL ON public.coaching_sessions FROM PUBLIC;
REVOKE ALL ON public.coaching_sessions FROM anon;
REVOKE ALL ON public.coaching_sessions FROM authenticated;
GRANT SELECT ON public.coaching_sessions TO authenticated;
DROP POLICY IF EXISTS "coaching_sessions_insert" ON public.coaching_sessions;
DROP POLICY IF EXISTS "coaching_sessions_select" ON public.coaching_sessions;
CREATE POLICY "coaching_sessions select own" ON public.coaching_sessions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
