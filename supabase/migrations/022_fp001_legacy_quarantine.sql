-- ============================================================
-- Migration 022: FP-001 legacy pricing quarantine (Decision #051)
--
-- One-time production data fix. Every non-NULL pricing value in the
-- database was produced BEFORE the FP-001 analysis quality gate
-- (pricing has been blocked on 100% of runs since; PR #122 also
-- stopped Scout from persisting pricing). These are fabricated
-- LLM numbers with no verified data basis. The current UI already
-- hides them (the gate blocks display), but the raw values still
-- sit in three surfaces where a future analytics query, migration,
-- or a new Coach could launder them as real:
--   1. decisions.model_probability / implied_probability / edge_percent
--   2. market_opportunities.(same three)
--   3. ai_analysis_runs.output_json → model/implied/edge keys
--
-- CPO-approved approach: BACK UP the originals to an audit table,
-- then SCRUB the live surfaces to NULL / strip the JSON keys. The
-- values are preserved (reversible) in the quarantine table but are
-- no longer readable as pricing anywhere in the domain.
--
-- Scope guard: only rows created before the quarantine cutoff are
-- touched, so re-running against an updated DB never scrubs a
-- future genuinely-verified row. As of 2026-07-10 every priced row
-- predates the cutoff, so this scrubs exactly the audited
-- 20 decisions + 41 opportunities + 17 analysis runs.
-- ============================================================

DO $$
DECLARE
  v_cutoff timestamptz := '2026-07-07T00:00:00Z';  -- gate / PR #122 ship date
BEGIN

  -- ── Audit backup table (service-role only, like beta_access) ──
  CREATE TABLE IF NOT EXISTS fp001_pricing_quarantine (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_table        text NOT NULL,
    row_id              uuid NOT NULL,
    user_id             uuid,
    model_probability   numeric,
    implied_probability numeric,
    edge_percent        numeric,
    output_json_pricing jsonb,
    quarantined_at      timestamptz NOT NULL DEFAULT now(),
    reason              text NOT NULL DEFAULT 'fp001_legacy'
  );
  ALTER TABLE fp001_pricing_quarantine ENABLE ROW LEVEL SECURITY;
  -- No policies: readable/writable only by the service role. anon and
  -- authenticated get nothing (no grants, no policies).
  REVOKE ALL ON fp001_pricing_quarantine FROM PUBLIC, anon, authenticated;

  -- ── 1. decisions ──────────────────────────────────────────────
  INSERT INTO fp001_pricing_quarantine (source_table, row_id, user_id, model_probability, implied_probability, edge_percent)
  SELECT 'decisions', id, user_id, model_probability, implied_probability, edge_percent
  FROM decisions
  WHERE created_at < v_cutoff
    AND (model_probability IS NOT NULL OR implied_probability IS NOT NULL OR edge_percent IS NOT NULL);

  UPDATE decisions
  SET model_probability = NULL, implied_probability = NULL, edge_percent = NULL, updated_at = now()
  WHERE created_at < v_cutoff
    AND (model_probability IS NOT NULL OR implied_probability IS NOT NULL OR edge_percent IS NOT NULL);

  -- ── 2. market_opportunities ──────────────────────────────────
  INSERT INTO fp001_pricing_quarantine (source_table, row_id, user_id, model_probability, implied_probability, edge_percent)
  SELECT 'market_opportunities', id, user_id, model_probability, implied_probability, edge_percent
  FROM market_opportunities
  WHERE created_at < v_cutoff
    AND (model_probability IS NOT NULL OR implied_probability IS NOT NULL OR edge_percent IS NOT NULL);

  UPDATE market_opportunities
  SET model_probability = NULL, implied_probability = NULL, edge_percent = NULL, updated_at = now()
  WHERE created_at < v_cutoff
    AND (model_probability IS NOT NULL OR implied_probability IS NOT NULL OR edge_percent IS NOT NULL);

  -- ── 3. ai_analysis_runs.output_json ──────────────────────────
  -- Back up just the pricing keys, then strip them from the JSON.
  -- Match by non-null VALUE, not mere key presence: only runs that carry an
  -- actual fabricated number are quarantined, so every audit row is
  -- meaningful. Runs whose keys exist but are already null are left alone
  -- (a null key is not readable false precision).
  INSERT INTO fp001_pricing_quarantine (source_table, row_id, user_id, output_json_pricing)
  SELECT 'ai_analysis_runs', id, user_id,
         jsonb_strip_nulls(jsonb_build_object(
           'model_probability',   output_json->'model_probability',
           'implied_probability', output_json->'implied_probability',
           'edge_percent',        output_json->'edge_percent'
         ))
  FROM ai_analysis_runs
  WHERE created_at < v_cutoff
    AND output_json IS NOT NULL
    AND ((output_json->>'model_probability') IS NOT NULL
      OR (output_json->>'implied_probability') IS NOT NULL
      OR (output_json->>'edge_percent') IS NOT NULL);

  UPDATE ai_analysis_runs
  SET output_json = (output_json - 'model_probability' - 'implied_probability' - 'edge_percent')
  WHERE created_at < v_cutoff
    AND output_json IS NOT NULL
    AND ((output_json->>'model_probability') IS NOT NULL
      OR (output_json->>'implied_probability') IS NOT NULL
      OR (output_json->>'edge_percent') IS NOT NULL);

END $$;

-- ── Post-apply verification (read-only, safe) ────────────────
-- SELECT
--   (SELECT count(*) FROM decisions WHERE model_probability IS NOT NULL OR implied_probability IS NOT NULL OR edge_percent IS NOT NULL) AS decisions_left,
--   (SELECT count(*) FROM market_opportunities WHERE model_probability IS NOT NULL OR implied_probability IS NOT NULL OR edge_percent IS NOT NULL) AS opps_left,
--   (SELECT count(*) FROM ai_analysis_runs WHERE output_json ? 'model_probability' OR output_json ? 'edge_percent') AS runs_left,
--   (SELECT count(*) FROM fp001_pricing_quarantine) AS quarantined;
-- Expect: decisions_left 0, opps_left 0, runs_left 0, quarantined = 20 + 41 + 17 = 78.
