-- ============================================================
-- Decision #060 Phase A — EMERGENCY ROLLBACK for migration 024
--
-- Kept OUTSIDE supabase/migrations so it can never be picked up
-- as a forward migration. Run manually ONLY with explicit CPO
-- authorization. The whole rollback is atomic and fail closed.
-- ============================================================

BEGIN;

-- Preflight is executable, not an operator checklist. Any partial
-- schema state or any live ordinal data aborts before the first DROP.
DO $preflight$
DECLARE
  v_function regprocedure := to_regprocedure(
    'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)'
  );
  v_index regclass := to_regclass('public.uq_bet_legs_bet_leg_index');
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'Rollback preflight failed: exact create_tracked_bet signature is missing';
  END IF;

  IF v_index IS NULL THEN
    RAISE EXCEPTION 'Rollback preflight failed: leg-index unique index is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bet_legs'
      AND column_name = 'leg_index'
  ) THEN
    RAISE EXCEPTION 'Rollback preflight failed: bet_legs.leg_index is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bet_legs WHERE leg_index IS NOT NULL LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Rollback blocked: live leg_index data exists';
  END IF;
END
$preflight$;

-- Strict preflight above proved every object exists. No IF EXISTS is
-- used here: unexpected concurrent drift must abort the transaction.
DROP FUNCTION public.create_tracked_bet(jsonb, numeric, numeric, text, text, text, text);
DROP INDEX public.uq_bet_legs_bet_leg_index;
ALTER TABLE public.bet_legs DROP COLUMN leg_index;

-- Executable postconditions. Failure rolls the transaction back and
-- restores every object removed above.
DO $postconditions$
BEGIN
  IF to_regprocedure(
    'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback postcondition failed: create_tracked_bet still exists';
  END IF;

  IF to_regclass('public.uq_bet_legs_bet_leg_index') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback postcondition failed: unique index still exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bet_legs'
      AND column_name = 'leg_index'
  ) THEN
    RAISE EXCEPTION 'Rollback postcondition failed: leg_index still exists';
  END IF;
END
$postconditions$;

COMMIT;
