-- ============================================================
-- Migration 011: RLS init-plan performance optimisation
-- Rewrite 10 policies: auth.uid() → (select auth.uid())
--
-- REVIEW ONLY — do NOT apply automatically.
-- Apply manually in Supabase SQL Editor after CPO accept + merge.
--
-- WHY: When an RLS policy uses auth.uid() directly, PostgreSQL
-- re-evaluates the function once per row scanned. Wrapping it in
-- (select auth.uid()) causes the planner to treat it as an
-- init-plan subquery — evaluated exactly once per statement,
-- then reused. For tables with many rows this is a significant
-- scan-time improvement.
--
-- SCOPE: 10 policies across 7 tables.
-- NOT touched: global_config ("read global"), market_opportunities
-- ("Users see own opportunities" — role conversion deferred).
--
-- All DROP/CREATE pairs run inside a transaction so a partial
-- failure rolls the full set back atomically.
--
-- Policies generated from real production pg_policies definitions
-- as of 2026-06-30. Behavior is identical — only the planner
-- execution path changes.
-- ============================================================

BEGIN;

-- ── profiles ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "own profiles" ON profiles;
CREATE POLICY "own profiles" ON profiles
  FOR ALL TO authenticated
  USING     ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- ── bankrolls ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "own bankrolls" ON bankrolls;
CREATE POLICY "own bankrolls" ON bankrolls
  FOR ALL TO authenticated
  USING     ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── bankroll_transactions ─────────────────────────────────────
DROP POLICY IF EXISTS "own txns" ON bankroll_transactions;
CREATE POLICY "own txns" ON bankroll_transactions
  FOR ALL TO authenticated
  USING     ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── decisions ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "own decisions" ON decisions;
CREATE POLICY "own decisions" ON decisions
  FOR ALL TO authenticated
  USING     ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── ai_analysis_runs ──────────────────────────────────────────
DROP POLICY IF EXISTS "own ai_runs" ON ai_analysis_runs;
CREATE POLICY "own ai_runs" ON ai_analysis_runs
  FOR ALL TO authenticated
  USING     ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── bets ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own bets" ON bets;
CREATE POLICY "own bets" ON bets
  FOR ALL TO authenticated
  USING     ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── bet_legs ──────────────────────────────────────────────────
-- auth.uid() appears inside the EXISTS subquery; wrapping it
-- in (select auth.uid()) still triggers the init-plan hoist
-- because it does not reference any column from the outer scan.
DROP POLICY IF EXISTS "own bet_legs" ON bet_legs;
CREATE POLICY "own bet_legs" ON bet_legs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bets
      WHERE bets.id = bet_legs.bet_id
        AND bets.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bets
      WHERE bets.id = bet_legs.bet_id
        AND bets.user_id = (select auth.uid())
    )
  );

-- ── coaching_sessions ─────────────────────────────────────────
-- Original policy has no TO role (applies to all roles).
-- Role is preserved as-is.
DROP POLICY IF EXISTS "Users see own sessions" ON coaching_sessions;
CREATE POLICY "Users see own sessions" ON coaching_sessions
  FOR ALL
  USING     ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── beta_feedback ─────────────────────────────────────────────
DROP POLICY IF EXISTS "beta_feedback_insert" ON beta_feedback;
CREATE POLICY "beta_feedback_insert" ON beta_feedback
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "beta_feedback_select" ON beta_feedback;
CREATE POLICY "beta_feedback_select" ON beta_feedback
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

COMMIT;

-- ── Verification (run after applying in Supabase) ────────────
--
-- 1. Confirm all 10 rewritten policies exist with correct
--    table and cmd (expected: 10 rows):
--
--    SELECT tablename, policyname, cmd, roles
--    FROM pg_policies
--    WHERE policyname IN (
--      'own profiles', 'own bankrolls', 'own txns',
--      'own decisions', 'own ai_runs', 'own bets',
--      'own bet_legs', 'Users see own sessions',
--      'beta_feedback_insert', 'beta_feedback_select'
--    )
--    ORDER BY tablename, policyname;
--
-- 2. Spot-check that init-plan is used in the query plan
--    for a representative table. Run as an authenticated user:
--
--    EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM decisions LIMIT 1;
--
--    Look for "InitPlan" referencing auth.uid() in the output.
--    With the old policy you would see auth.uid() in a Filter
--    node evaluated per-row; after this migration it appears
--    once as an InitPlan.
--
-- 3. Confirm global_config and market_opportunities policies
--    are unchanged (expected: original policy definitions):
--
--    SELECT policyname, cmd, roles, qual
--    FROM pg_policies
--    WHERE tablename IN ('global_config', 'market_opportunities');
