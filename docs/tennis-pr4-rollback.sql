-- Emergency rollback for migration 027 only.
-- Refuses to remove the idempotency ledger while it contains any command.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tennis_series_commands) THEN
    RAISE EXCEPTION 'rollback_refused: tennis_series_commands is not empty';
  END IF;
END
$$;

DROP FUNCTION public.tennis_stop_series(uuid,uuid,uuid,integer);
DROP FUNCTION public.tennis_settle_step(uuid,uuid,uuid,uuid,integer,text,numeric);
DROP FUNCTION public.tennis_confirm_step(uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric);
DROP FUNCTION public.tennis_create_series(uuid,uuid,numeric,numeric,numeric,text,numeric,numeric,integer,numeric,text,text);

DROP TABLE public.tennis_series_commands;

REVOKE ALL ON public.tennis_series_steps FROM service_role;
REVOKE ALL ON public.tennis_series FROM service_role;

COMMIT;
