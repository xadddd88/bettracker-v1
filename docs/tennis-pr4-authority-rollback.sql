-- Emergency rollback for migration 028 only.
--
-- This rollback deliberately does NOT restore migration 027's client-derived
-- confirm signature. It removes confirmation entirely so the feature fails
-- closed until a corrected replacement is applied.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tennis_series_commands) THEN
    RAISE EXCEPTION 'rollback_refused: tennis_series_commands is not empty';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.tennis_confirm_step(
  uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric
) FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.tennis_confirm_step(
  uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric
);

COMMIT;
