-- ============================================================
-- Migration 014: Sports Data Foundation cleanup (Phase 1 M1.1)
--
-- REVIEW ONLY — apply manually in Supabase after CPO accept + merge.
-- NOTE: already applied to prod (ybbdkwjtytokrpbvgbmq) on 2026-07-01;
-- this file records it so fresh environments match. All statements are
-- idempotent (IF NOT EXISTS / CREATE OR REPLACE).
--
-- Follows migration 013. Addresses Supabase advisor findings on the new
-- sports-data objects and tightens the enrichment audit field:
--   1. Pin search_path on validate_football_enrichment_link()
--      (security advisor: function_search_path_mutable).
--   2. Covering indexes for two new FKs
--      (performance advisor: FK without covering index).
--   3. Enforce mapping_confidence_at_write = linked confidence at write
--      time, so the audit snapshot cannot be an inaccurate copy
--      (e.g. 'exact' written against a 'high' link). Writers must set
--      mapping_confidence_at_write to the link's confidence on every
--      insert/update.
--
-- No data change. No new tables. No RLS change.
-- ============================================================

BEGIN;

-- ── (2) Covering indexes for FK advisor warnings ─────────────
CREATE INDEX IF NOT EXISTS idx_football_enrichment_provider_link
  ON public.football_enrichment (fixture_provider_link_id);

CREATE INDEX IF NOT EXISTS idx_odds_snapshots_market_catalog
  ON public.odds_snapshots (market_catalog_id);

-- ── (1 + 3) Pin search_path (linter-clean) AND add the write-time
-- confidence-equality check. CREATE OR REPLACE keeps the existing
-- trg_validate_football_enrichment_link trigger bound; the SET clause
-- is included in the definition so the pinned search_path is retained.
CREATE OR REPLACE FUNCTION public.validate_football_enrichment_link()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE lnk fixture_provider_links%ROWTYPE;
BEGIN
  SELECT * INTO lnk FROM fixture_provider_links
    WHERE id = NEW.fixture_provider_link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'football_enrichment: provider link % not found', NEW.fixture_provider_link_id;
  END IF;
  IF lnk.provider <> 'sportmonks' THEN
    RAISE EXCEPTION 'football_enrichment: link must be sportmonks, got %', lnk.provider;
  END IF;
  IF lnk.canonical_fixture_id <> NEW.canonical_fixture_id THEN
    RAISE EXCEPTION 'football_enrichment: link fixture % does not match row fixture %',
      lnk.canonical_fixture_id, NEW.canonical_fixture_id;
  END IF;
  IF lnk.mapping_confidence NOT IN ('exact','high') THEN
    RAISE EXCEPTION 'football_enrichment: requires exact/high link confidence, got %', lnk.mapping_confidence;
  END IF;
  IF NEW.mapping_confidence_at_write <> lnk.mapping_confidence THEN
    RAISE EXCEPTION 'football_enrichment: mapping_confidence_at_write % does not match linked confidence %',
      NEW.mapping_confidence_at_write, lnk.mapping_confidence;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
