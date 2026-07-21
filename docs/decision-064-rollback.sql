-- ============================================================
-- Decision #064 emergency rollback / pre-apply kill switch
--
-- KEEP OUTSIDE supabase/migrations.
-- Run manually only under a separate explicit rollback approval.
--
-- This rollback is deliberately fail-closed: it refuses to remove the
-- lineage contract if any version-1 leg exists. The application caller is
-- not changed by Decision #064, so an unapplied/unused foundation can be
-- removed without touching the existing create_tracked_bet() path.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_has_lineage_columns boolean;
  v_has_v1_rows boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bet_legs'
      AND column_name = 'lineage_contract_version'
  ) INTO v_has_lineage_columns;

  IF v_has_lineage_columns THEN
    EXECUTE
      'SELECT EXISTS (
         SELECT 1
         FROM public.bet_legs
         WHERE lineage_contract_version IS DISTINCT FROM 0
            OR lineage_state IS DISTINCT FROM ''unresolved''
            OR lineage_source IS DISTINCT FROM ''legacy''
            OR canonical_fixture_id IS NOT NULL
            OR fixture_provider_link_id IS NOT NULL
            OR fixture_provider IS NOT NULL
            OR provider_fixture_id IS NOT NULL
            OR fixture_kickoff_at_snapshot IS NOT NULL
            OR fixture_timezone IS NOT NULL
            OR mapping_confidence_snapshot IS NOT NULL
            OR mapping_method_snapshot IS NOT NULL
            OR lineage_verified_at IS NOT NULL
       )'
    INTO v_has_v1_rows;
  END IF;

  IF v_has_v1_rows THEN
    RAISE EXCEPTION
      'decision_064_rollback_blocked: non-legacy lineage rows exist';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.create_tracked_bet_v2(
  jsonb,
  numeric,
  numeric,
  text,
  text,
  text,
  text
);

DROP TRIGGER IF EXISTS trg_prevent_tracked_leg_lineage_update
  ON public.bet_legs;
DROP TRIGGER IF EXISTS trg_validate_tracked_leg_lineage_insert
  ON public.bet_legs;

DROP FUNCTION IF EXISTS public.prevent_tracked_leg_lineage_update();
DROP FUNCTION IF EXISTS public.validate_tracked_leg_lineage_insert();

DROP INDEX IF EXISTS public.idx_bet_legs_fixture_provider_link;
DROP INDEX IF EXISTS public.idx_bet_legs_canonical_fixture;

ALTER TABLE public.bet_legs
  DROP CONSTRAINT IF EXISTS chk_bet_legs_lineage_shape,
  DROP CONSTRAINT IF EXISTS fk_bet_legs_fixture_provider_link,
  DROP CONSTRAINT IF EXISTS fk_bet_legs_canonical_fixture;

ALTER TABLE public.bet_legs
  DROP COLUMN IF EXISTS lineage_verified_at,
  DROP COLUMN IF EXISTS mapping_method_snapshot,
  DROP COLUMN IF EXISTS mapping_confidence_snapshot,
  DROP COLUMN IF EXISTS lineage_contract_version,
  DROP COLUMN IF EXISTS lineage_source,
  DROP COLUMN IF EXISTS lineage_state,
  DROP COLUMN IF EXISTS fixture_timezone,
  DROP COLUMN IF EXISTS fixture_kickoff_at_snapshot,
  DROP COLUMN IF EXISTS provider_fixture_id,
  DROP COLUMN IF EXISTS fixture_provider,
  DROP COLUMN IF EXISTS fixture_provider_link_id,
  DROP COLUMN IF EXISTS canonical_fixture_id;

COMMIT;
