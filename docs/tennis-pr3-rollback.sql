-- ============================================================
-- Tennis Live Series Calculator PR-3 — EMERGENCY ROLLBACK for
-- migration 026_tennis_live_series_calculator.sql
--
-- Kept OUTSIDE supabase/migrations so it can never be picked up as a
-- forward migration, per the #048 / #049 / #060 / #064 convention.
-- Run manually ONLY with explicit Founder/CPO authorization.
-- The whole rollback is atomic and fail closed.
--
-- Scope: drops ONLY the two tables migration 026 created. Their
-- policies, indexes, constraints and the updated_at trigger are owned
-- by those tables and disappear with them. Nothing pre-existing is
-- touched: set_updated_at() is shared with tables from migration 001
-- and is deliberately NOT dropped.
-- ============================================================

BEGIN;

-- Preflight is executable, not an operator checklist. A partial schema
-- state, an unexpected dependency, or ANY stored row aborts before the
-- first DROP so this can never silently destroy calculator history.
DO $preflight$
DECLARE
  v_series regclass := to_regclass('public.tennis_series');
  v_steps  regclass := to_regclass('public.tennis_series_steps');
  v_series_rows bigint := 0;
  v_step_rows   bigint := 0;
  v_dependents  int := 0;
BEGIN
  IF v_series IS NULL AND v_steps IS NULL THEN
    RAISE EXCEPTION 'Rollback preflight failed: migration 026 is not applied (nothing to roll back)';
  END IF;
  IF v_series IS NULL OR v_steps IS NULL THEN
    RAISE EXCEPTION 'Rollback preflight failed: partial 026 state — series=%, steps=%', v_series, v_steps;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.tennis_series'       INTO v_series_rows;
  EXECUTE 'SELECT count(*) FROM public.tennis_series_steps' INTO v_step_rows;
  IF v_series_rows <> 0 OR v_step_rows <> 0 THEN
    RAISE EXCEPTION
      'Rollback preflight failed: refusing to destroy stored data (% series rows, % step rows). Export first, then re-run with explicit authorization.',
      v_series_rows, v_step_rows;
  END IF;

  -- Nothing OUTSIDE the two 026 tables may depend on them: a later PR
  -- could have added an inbound foreign key or a view. Their own indexes,
  -- constraints, policies and triggers are internal and are expected.
  -- (The DROPs below deliberately omit CASCADE, so PostgreSQL enforces
  -- this a second time even if a dependency kind is missed here.)
  SELECT count(*) INTO v_dependents
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
   WHERE con.contype = 'f'
     AND con.confrelid IN (v_series, v_steps)
     AND child.relname NOT IN ('tennis_series','tennis_series_steps');
  IF v_dependents <> 0 THEN
    RAISE EXCEPTION 'Rollback preflight failed: % inbound foreign key(s) reference the 026 tables', v_dependents;
  END IF;

  SELECT count(*) INTO v_dependents
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class v ON v.oid = r.ev_class
   WHERE d.refobjid IN (v_series, v_steps)
     AND v.relkind IN ('v','m');
  IF v_dependents <> 0 THEN
    RAISE EXCEPTION 'Rollback preflight failed: % view(s) depend on the 026 tables', v_dependents;
  END IF;

  -- set_updated_at() is shared infrastructure from migration 001.
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'Rollback preflight failed: shared set_updated_at() is unexpectedly absent';
  END IF;
END
$preflight$;

-- Child first, then parent (explicit order; no CASCADE needed).
DROP TABLE public.tennis_series_steps;
DROP TABLE public.tennis_series;

-- Postconditions: both tables gone, shared function retained.
DO $postcheck$
BEGIN
  IF to_regclass('public.tennis_series') IS NOT NULL
     OR to_regclass('public.tennis_series_steps') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback postcondition failed: a 026 table still exists';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'Rollback postcondition failed: shared set_updated_at() was removed';
  END IF;
END
$postcheck$;

COMMIT;
