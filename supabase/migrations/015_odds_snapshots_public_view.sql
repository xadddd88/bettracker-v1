-- ============================================================
-- Migration 015: odds_snapshots_public curated view (Phase 1 M1.1)
--
-- odds_snapshots has no RLS policies (013), so it is currently
-- service-role-only, per design: "Tables carrying raw_provider_payload
-- or provider/mapping internals stay service-role-only in M1.1; future
-- product reads should go through curated views/RPC/API that exclude
-- raw_provider_payload and other debug-only metadata."
--
-- This adds that curated view instead of a direct SELECT policy on
-- odds_snapshots, so authenticated clients can read display-safe odds
-- fields without exposing provider, raw_market_name internals,
-- raw_provider_payload, or sync_run_id.
--
-- The view is owned by the migration role, which owns odds_snapshots
-- and therefore bypasses its RLS (no FORCE ROW LEVEL SECURITY is set);
-- granting SELECT on the view to authenticated does not require any
-- policy change on the base table.
--
-- IMPORTANT: this view is a simple single-table projection, which
-- Postgres treats as auto-updatable. Supabase's default privileges
-- grant INSERT/UPDATE/DELETE on every new relation (including views)
-- to anon/authenticated. Because the view runs as its RLS-bypassing
-- owner, an UPDATE/DELETE through the view would silently bypass the
-- zero-policy lockdown on odds_snapshots — unlike querying the base
-- table directly, where RLS evaluates against the real caller. The
-- REVOKE below is required, not defensive boilerplate.
-- ============================================================

BEGIN;

CREATE VIEW public.odds_snapshots_public AS
SELECT
  id,
  canonical_fixture_id,
  market_catalog_id,
  selection,
  line,
  price,
  bookmaker,
  ingested_at,
  provider_updated_at
FROM public.odds_snapshots;

REVOKE ALL ON public.odds_snapshots_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.odds_snapshots_public TO authenticated;

COMMIT;
