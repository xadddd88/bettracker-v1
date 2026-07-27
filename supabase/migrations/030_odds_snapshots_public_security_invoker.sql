-- ============================================================
-- Migration 030: odds_snapshots_public security-invoker hardening
-- Decision #066
--
-- REVIEW ONLY — do not apply automatically.
--
-- Keep the authenticated product contract limited to the nine
-- display-safe odds fields while making the view obey the caller's
-- base-table privileges and RLS policies.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER VIEW public.odds_snapshots_public
  SET (security_invoker = true);

REVOKE ALL PRIVILEGES ON TABLE public.odds_snapshots
  FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  canonical_fixture_id,
  market_catalog_id,
  selection,
  line,
  price,
  bookmaker,
  ingested_at,
  provider_updated_at
) ON TABLE public.odds_snapshots TO authenticated;

CREATE POLICY odds_snapshots_authenticated_read
  ON public.odds_snapshots
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL PRIVILEGES ON TABLE public.odds_snapshots_public
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.odds_snapshots_public TO authenticated;

COMMENT ON VIEW public.odds_snapshots_public IS
  'Display-safe odds projection. SECURITY INVOKER; authenticated reads are constrained by base-table column grants and RLS.';

COMMIT;
