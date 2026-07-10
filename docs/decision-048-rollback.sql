-- ============================================================
-- Decision #048 EMERGENCY ROLLBACK — restores the pre-018
-- grants and FOR ALL policies on the seven core tables.
--
-- ⚠ NOT a migration. Do NOT apply automatically. Use only as a
-- deliberate forward step if Phase B (migration 018) breaks
-- something unexpected in production, and only AFTER recording
-- the observed breakage. Lives in docs/ (not supabase/migrations/)
-- precisely so no tooling ever picks it up by accident.
--
-- Restores the state inventoried on 2026-07-10 before 018:
--   - anon + authenticated: full table privileges
--   - one FOR ALL own-rows policy per table
--   - authenticated EXECUTE on create_decision_with_analysis
--
-- Atomic: the whole restoration is one transaction — a failure
-- mid-way leaves NOTHING partially restored.
-- ============================================================

BEGIN;

-- profiles
GRANT ALL ON public.profiles TO anon, authenticated;
DROP POLICY IF EXISTS "profiles select own" ON public.profiles;
DROP POLICY IF EXISTS "own profiles" ON public.profiles;
CREATE POLICY "own profiles" ON public.profiles
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = id);

-- bankrolls
GRANT ALL ON public.bankrolls TO anon, authenticated;
DROP POLICY IF EXISTS "bankrolls select own" ON public.bankrolls;
DROP POLICY IF EXISTS "own bankrolls" ON public.bankrolls;
CREATE POLICY "own bankrolls" ON public.bankrolls
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id);

-- bankroll_transactions
GRANT ALL ON public.bankroll_transactions TO anon, authenticated;
DROP POLICY IF EXISTS "bankroll_transactions select own" ON public.bankroll_transactions;
DROP POLICY IF EXISTS "own txns" ON public.bankroll_transactions;
CREATE POLICY "own txns" ON public.bankroll_transactions
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id);

-- bets
GRANT ALL ON public.bets TO anon, authenticated;
DROP POLICY IF EXISTS "bets select own" ON public.bets;
DROP POLICY IF EXISTS "own bets" ON public.bets;
CREATE POLICY "own bets" ON public.bets
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id);

-- bet_legs
GRANT ALL ON public.bet_legs TO anon, authenticated;
DROP POLICY IF EXISTS "bet_legs select own" ON public.bet_legs;
DROP POLICY IF EXISTS "own bet_legs" ON public.bet_legs;
CREATE POLICY "own bet_legs" ON public.bet_legs
  FOR ALL TO authenticated USING (EXISTS (
    SELECT 1 FROM bets
    WHERE bets.id = bet_legs.bet_id AND bets.user_id = (SELECT auth.uid())
  ));

-- decisions
GRANT ALL ON public.decisions TO anon, authenticated;
DROP POLICY IF EXISTS "decisions select own" ON public.decisions;
DROP POLICY IF EXISTS "own decisions" ON public.decisions;
CREATE POLICY "own decisions" ON public.decisions
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id);

-- ai_analysis_runs
GRANT ALL ON public.ai_analysis_runs TO anon, authenticated;
DROP POLICY IF EXISTS "ai_analysis_runs select own" ON public.ai_analysis_runs;
DROP POLICY IF EXISTS "own ai_runs" ON public.ai_analysis_runs;
CREATE POLICY "own ai_runs" ON public.ai_analysis_runs
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id);

-- Analyst legacy RPC
GRANT EXECUTE ON FUNCTION create_decision_with_analysis(
  text, text, text, text, numeric, numeric, text, text, text, jsonb, text, text,
  numeric, numeric, numeric, numeric, text, text, text, jsonb,
  text, text, jsonb, jsonb, boolean, int, int, text
) TO authenticated;

COMMIT;
