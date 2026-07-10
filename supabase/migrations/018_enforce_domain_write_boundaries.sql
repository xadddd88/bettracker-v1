-- ============================================================
-- Migration 018: Enforce domain write boundaries (Phase B)
-- Decision #048 — Core Domain Write Boundaries
--
-- Apply ONLY after migration 017 is applied AND the application
-- deploy that moved every writer onto the RPC layer is READY in
-- production (/api/settings, /api/onboarding/complete,
-- /api/ai/analyst). Sequence per the CPO-approved order.
--
-- For the seven core tables, authenticated users become
-- SELECT-only (own rows via RLS); every write goes through the
-- approved SECURITY DEFINER RPCs. anon and PUBLIC lose all
-- table access. service_role keeps full access (it bypasses
-- RLS and holds its own grants).
--
-- Deliberately NOT done here:
--   - FORCE ROW LEVEL SECURITY (would break SECURITY DEFINER
--     RPCs owned by table owners)
--   - market_opportunities / coaching_sessions (recorded OPEN,
--     separate trust-domain decision before external beta)
--   - dropping create_decision_with_analysis (only EXECUTE is
--     revoked; the function is deleted by a later migration
--     after stable verification)
--
-- Emergency rollback: docs/decision-048-rollback.sql (restores
-- prior grants/policies; NOT to be applied automatically).
-- ============================================================

-- ── Phase-A prerequisite preflight (fail-closed) ─────────────
-- 018 must be impossible to apply before 017: if the RPC layer
-- is absent or has the wrong EXECUTE surface, raise BEFORE any
-- REVOKE runs and leave enforcement untouched. (SQL cannot prove
-- the application deploy itself — the operator sequence remains
-- mandatory.)
DO $$
DECLARE
  v_persist regprocedure := to_regprocedure(
    'persist_analysis_decision(uuid,text,text,text,text,numeric,numeric,text,text,text,jsonb,text,text,numeric,numeric,numeric,numeric,text,text,text,jsonb,text,text,jsonb,jsonb,boolean,integer,integer,text)');
  v_settings regprocedure := to_regprocedure('save_user_settings(text,text,numeric,numeric,boolean,text)');
  v_onboarding regprocedure := to_regprocedure('complete_onboarding()');
BEGIN
  IF v_persist IS NULL THEN
    RAISE EXCEPTION 'Phase A missing: persist_analysis_decision not found — apply migration 017 first';
  END IF;
  IF v_settings IS NULL THEN
    RAISE EXCEPTION 'Phase A missing: save_user_settings not found — apply migration 017 first';
  END IF;
  IF v_onboarding IS NULL THEN
    RAISE EXCEPTION 'Phase A missing: complete_onboarding not found — apply migration 017 first';
  END IF;

  IF NOT has_function_privilege('service_role', v_persist, 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase A invalid: service_role lacks EXECUTE on persist_analysis_decision';
  END IF;
  IF has_function_privilege('authenticated', v_persist, 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase A invalid: authenticated must NOT have EXECUTE on persist_analysis_decision';
  END IF;
  IF has_function_privilege('anon', v_persist, 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase A invalid: anon must NOT have EXECUTE on persist_analysis_decision';
  END IF;
  IF NOT has_function_privilege('authenticated', v_settings, 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase A invalid: authenticated lacks EXECUTE on save_user_settings';
  END IF;
  IF NOT has_function_privilege('authenticated', v_onboarding, 'EXECUTE') THEN
    RAISE EXCEPTION 'Phase A invalid: authenticated lacks EXECUTE on complete_onboarding';
  END IF;
END
$$;

-- NOTE on the grant pattern below: authenticated gets REVOKE ALL
-- (not an enumerated list) followed by GRANT SELECT — PostgreSQL 17
-- adds MAINTAIN ('m' in the ACL) which an enumerated revoke would
-- silently leave behind.

-- ── profiles ─────────────────────────────────────────────────
REVOKE ALL ON public.profiles FROM PUBLIC;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
DROP POLICY IF EXISTS "own profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles select own" ON public.profiles;
CREATE POLICY "profiles select own" ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

-- ── bankrolls ────────────────────────────────────────────────
REVOKE ALL ON public.bankrolls FROM PUBLIC;
REVOKE ALL ON public.bankrolls FROM anon;
REVOKE ALL ON public.bankrolls FROM authenticated;
GRANT SELECT ON public.bankrolls TO authenticated;
DROP POLICY IF EXISTS "own bankrolls" ON public.bankrolls;
DROP POLICY IF EXISTS "bankrolls select own" ON public.bankrolls;
CREATE POLICY "bankrolls select own" ON public.bankrolls
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ── bankroll_transactions (append-only via RPC) ──────────────
REVOKE ALL ON public.bankroll_transactions FROM PUBLIC;
REVOKE ALL ON public.bankroll_transactions FROM anon;
REVOKE ALL ON public.bankroll_transactions FROM authenticated;
GRANT SELECT ON public.bankroll_transactions TO authenticated;
DROP POLICY IF EXISTS "own txns" ON public.bankroll_transactions;
DROP POLICY IF EXISTS "bankroll_transactions select own" ON public.bankroll_transactions;
CREATE POLICY "bankroll_transactions select own" ON public.bankroll_transactions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ── bets ─────────────────────────────────────────────────────
REVOKE ALL ON public.bets FROM PUBLIC;
REVOKE ALL ON public.bets FROM anon;
REVOKE ALL ON public.bets FROM authenticated;
GRANT SELECT ON public.bets TO authenticated;
DROP POLICY IF EXISTS "own bets" ON public.bets;
DROP POLICY IF EXISTS "bets select own" ON public.bets;
CREATE POLICY "bets select own" ON public.bets
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ── bet_legs (ownership via parent bet) ──────────────────────
REVOKE ALL ON public.bet_legs FROM PUBLIC;
REVOKE ALL ON public.bet_legs FROM anon;
REVOKE ALL ON public.bet_legs FROM authenticated;
GRANT SELECT ON public.bet_legs TO authenticated;
DROP POLICY IF EXISTS "own bet_legs" ON public.bet_legs;
DROP POLICY IF EXISTS "bet_legs select own" ON public.bet_legs;
CREATE POLICY "bet_legs select own" ON public.bet_legs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM bets
    WHERE bets.id = bet_legs.bet_id
      AND bets.user_id = (SELECT auth.uid())
  ));

-- ── decisions ────────────────────────────────────────────────
REVOKE ALL ON public.decisions FROM PUBLIC;
REVOKE ALL ON public.decisions FROM anon;
REVOKE ALL ON public.decisions FROM authenticated;
GRANT SELECT ON public.decisions TO authenticated;
DROP POLICY IF EXISTS "own decisions" ON public.decisions;
DROP POLICY IF EXISTS "decisions select own" ON public.decisions;
CREATE POLICY "decisions select own" ON public.decisions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ── ai_analysis_runs ─────────────────────────────────────────
REVOKE ALL ON public.ai_analysis_runs FROM PUBLIC;
REVOKE ALL ON public.ai_analysis_runs FROM anon;
REVOKE ALL ON public.ai_analysis_runs FROM authenticated;
GRANT SELECT ON public.ai_analysis_runs TO authenticated;
DROP POLICY IF EXISTS "own ai_runs" ON public.ai_analysis_runs;
DROP POLICY IF EXISTS "ai_analysis_runs select own" ON public.ai_analysis_runs;
CREATE POLICY "ai_analysis_runs select own" ON public.ai_analysis_runs
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ── Analyst RPC bypass closure (FP-001) ──────────────────────
-- create_decision_with_analysis() accepted client-supplied
-- pricing while skipping the /api/ai/analyst quality gate.
-- Persistence is now persist_analysis_decision() (service_role
-- only, migration 017). The old function loses user EXECUTE but
-- is kept until stable verification, then dropped by a later
-- migration.
REVOKE EXECUTE ON FUNCTION create_decision_with_analysis(
  text, text, text, text, numeric, numeric, text, text, text, jsonb, text, text,
  numeric, numeric, numeric, numeric, text, text, text, jsonb,
  text, text, jsonb, jsonb, boolean, int, int, text
) FROM PUBLIC, anon, authenticated;
