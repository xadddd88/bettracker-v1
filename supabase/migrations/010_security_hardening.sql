-- ============================================================
-- Migration 010: Security Hardening
-- RPC grants, function search_path lock, FK indexes
--
-- REVIEW ONLY — do NOT apply automatically.
-- Apply manually in Supabase SQL Editor after CPO accept + merge.
-- No behavior changes; defense-in-depth hardening only.
--
-- Policies and function signatures derived from real production
-- pg_proc / pg_roles / pg_indexes state as of 2026-06-30.
-- ============================================================

-- ── 1. Revoke anon EXECUTE on user-facing RPC functions ─────
--
-- PostgreSQL grants EXECUTE to PUBLIC by default when a function
-- is created. The existing migrations added explicit GRANT …
-- TO authenticated, but never revoked from PUBLIC (which includes
-- the anon role). An anon caller can therefore invoke these
-- SECURITY DEFINER functions directly via PostgREST RPC
-- (/rest/v1/rpc/…) without a JWT — the auth.uid() IS NULL guard
-- catches the attempt, but the network path should be closed
-- at the grant layer for defence in depth.
--
-- Steps: REVOKE from PUBLIC, then re-assert authenticated grant.

REVOKE EXECUTE ON FUNCTION create_quick_bet(uuid, text, text, text, text, numeric, numeric, text, text)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION create_quick_bet(uuid, text, text, text, text, numeric, numeric, text, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION create_decision_with_analysis(
  text, text, text, text, numeric, numeric, text, text, text, jsonb,
  text, text, numeric, numeric, numeric, numeric, text, text, text, jsonb,
  text, text, jsonb, jsonb, boolean, integer, integer, text
) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION create_decision_with_analysis(
  text, text, text, text, numeric, numeric, text, text, text, jsonb,
  text, text, numeric, numeric, numeric, numeric, text, text, text, jsonb,
  text, text, jsonb, jsonb, boolean, integer, integer, text
) TO authenticated;

REVOKE EXECUTE ON FUNCTION place_bet_from_decision(uuid, uuid, numeric, text, text)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION place_bet_from_decision(uuid, uuid, numeric, text, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION update_decision_action(uuid, text)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION update_decision_action(uuid, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION settle_bet(uuid, text)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION settle_bet(uuid, text)
  TO authenticated;

-- ── 2. Restrict handle_new_user from direct invocation ──────
--
-- handle_new_user() is an auth.users INSERT trigger function.
-- The database engine fires it as the postgres/rds_superuser
-- role — that role is unaffected by REVOKE. Neither anon nor
-- authenticated users should ever call this function directly.

REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM authenticated;

-- ── 3. Lock search_path for update_updated_at_column ────────
--
-- This function drives the market_opportunities updated_at
-- trigger (004_scout.sql). It was defined outside tracked
-- migrations (directly in Supabase SQL Editor) and therefore
-- lacks a locked search_path, leaving it theoretically
-- vulnerable to search_path injection. Adding SET search_path
-- = public closes that vector without changing behaviour.

ALTER FUNCTION update_updated_at_column() SET search_path = public;

-- ── 4. Missing FK indexes (pg_advisor findings) ─────────────
--
-- Supabase Advisor flagged these FK columns as lacking indexes.
-- Without indexes, ON DELETE cascade scans on referenced tables
-- and JOIN lookups on these columns cause sequential scans.

-- market_opportunities.linked_decision_id → decisions(id)
-- Partial index: NULLs are never joined and need no index entry.
CREATE INDEX IF NOT EXISTS idx_market_opp_linked_decision
  ON market_opportunities (linked_decision_id)
  WHERE linked_decision_id IS NOT NULL;

-- beta_access.used_by_user_id → auth.users(id)
CREATE INDEX IF NOT EXISTS idx_beta_access_used_by_user
  ON beta_access (used_by_user_id)
  WHERE used_by_user_id IS NOT NULL;

-- ── Verification (run after applying in Supabase) ────────────
--
-- 1. Confirm anon has no EXECUTE on the hardened functions
--    (expected: 0 rows):
--
--    SELECT grantee, routine_name
--    FROM information_schema.role_routine_grants
--    WHERE grantee IN ('anon', 'public')
--      AND routine_name IN (
--        'create_quick_bet', 'create_decision_with_analysis',
--        'place_bet_from_decision', 'update_decision_action',
--        'settle_bet', 'handle_new_user'
--      );
--
-- 2. Confirm authenticated still has EXECUTE on the five RPCs
--    (expected: 5 rows):
--
--    SELECT routine_name
--    FROM information_schema.role_routine_grants
--    WHERE grantee = 'authenticated'
--      AND routine_name IN (
--        'create_quick_bet', 'create_decision_with_analysis',
--        'place_bet_from_decision', 'update_decision_action',
--        'settle_bet'
--      );
--
-- 3. Confirm search_path locked on update_updated_at_column
--    (expected: proconfig contains 'search_path=public'):
--
--    SELECT proname, proconfig
--    FROM pg_proc
--    WHERE proname = 'update_updated_at_column';
--
-- 4. Confirm both FK indexes exist (expected: 2 rows):
--
--    SELECT indexname, tablename
--    FROM pg_indexes
--    WHERE indexname IN (
--      'idx_market_opp_linked_decision',
--      'idx_beta_access_used_by_user'
--    );
