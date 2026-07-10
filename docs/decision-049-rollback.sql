-- ============================================================
-- Decision #049 EMERGENCY ROLLBACK — restores the pre-020
-- grants and policies on market_opportunities / coaching_sessions.
--
-- ⚠ NOT a migration. Manual-only, deliberate forward step after
-- recording observed breakage. Atomic: one BEGIN/COMMIT.
--
-- Restores the state inventoried 2026-07-10 before 020:
--   - anon + authenticated: full table privileges
--   - market_opportunities: FOR ALL policy granted to role public
--   - coaching_sessions: separate SELECT + INSERT policies
-- ============================================================

BEGIN;

-- market_opportunities
GRANT ALL ON public.market_opportunities TO anon, authenticated;
DROP POLICY IF EXISTS "market_opportunities select own" ON public.market_opportunities;
DROP POLICY IF EXISTS "Users see own opportunities" ON public.market_opportunities;
CREATE POLICY "Users see own opportunities" ON public.market_opportunities
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- coaching_sessions
GRANT ALL ON public.coaching_sessions TO anon, authenticated;
DROP POLICY IF EXISTS "coaching_sessions select own" ON public.coaching_sessions;
DROP POLICY IF EXISTS "coaching_sessions_select" ON public.coaching_sessions;
DROP POLICY IF EXISTS "coaching_sessions_insert" ON public.coaching_sessions;
CREATE POLICY "coaching_sessions_select" ON public.coaching_sessions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "coaching_sessions_insert" ON public.coaching_sessions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

COMMIT;
