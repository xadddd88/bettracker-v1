-- ============================================================
-- Migration 031: public API privilege hardening
-- Decision #067
--
-- REVIEW ONLY — do not apply automatically.
--
-- Keep intentional authenticated SECURITY DEFINER RPC boundaries,
-- retire two unused RPCs, make fail-closed tables explicit, and
-- prevent future public tables/functions from inheriting broad
-- client privileges from the postgres application owner.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Seven internal tables are intentionally unavailable through the
-- client Data API. Remove inherited client ACLs and make the deny
-- boundary explicit in RLS so future grants cannot expose rows.
REVOKE ALL PRIVILEGES ON TABLE
  public.api_rate_limits,
  public.beta_access,
  public.fixture_provider_links,
  public.fixture_results,
  public.football_enrichment,
  public.fp001_pricing_quarantine,
  public.tennis_series_commands
FROM PUBLIC, anon, authenticated;

CREATE POLICY api_rate_limits_client_deny_all
  ON public.api_rate_limits
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY beta_access_client_deny_all
  ON public.beta_access
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY fixture_provider_links_client_deny_all
  ON public.fixture_provider_links
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY fixture_results_client_deny_all
  ON public.fixture_results
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY football_enrichment_client_deny_all
  ON public.football_enrichment
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY fp001_pricing_quarantine_client_deny_all
  ON public.fp001_pricing_quarantine
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY tennis_series_commands_client_deny_all
  ON public.tennis_series_commands
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- PostgreSQL searches pg_temp first when it is omitted from a fixed
-- search_path. Put it last for every authenticated-callable definer
-- function that still uses search_path=public.
ALTER FUNCTION public.adjust_bankroll(text, numeric, text, text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.complete_onboarding()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.create_quick_bet(
  uuid, text, text, text, text, numeric, numeric, text, text
) SET search_path = public, pg_temp;
ALTER FUNCTION public.place_bet_from_decision(
  uuid, uuid, numeric, text, text
) SET search_path = public, pg_temp;
ALTER FUNCTION public.save_user_settings(
  text, text, numeric, numeric, boolean, text
) SET search_path = public, pg_temp;
ALTER FUNCTION public.set_user_currency(text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.settle_bet(uuid, text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.update_decision_action(uuid, text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.update_opportunity_status(uuid, text, uuid)
  SET search_path = public, pg_temp;

-- These legacy RPCs have no remaining runtime caller. Keep them
-- available to service_role only; do not drop them in this migration.
REVOKE EXECUTE ON FUNCTION public.create_quick_bet(
  uuid, text, text, text, text, numeric, numeric, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_quick_bet(
  uuid, text, text, text, text, numeric, numeric, text, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_user_currency(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_currency(text)
  TO service_role;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default.
-- Revoke that global built-in default, then remove Supabase's
-- schema-specific anon/authenticated defaults for public objects.
-- Existing explicit grants on intentional RPCs are unchanged.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

COMMIT;
