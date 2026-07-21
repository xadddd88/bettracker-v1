-- Decision #062 — pending-bet cancellation emergency kill switch.
--
-- Use only after migration 20260721152711_cancel_pending_bet has been
-- applied and an operational rollback has been explicitly approved.
-- This disables new cancellation/refund calls immediately while retaining:
--   * bets.archived_at and every archived bet/leg;
--   * the one-refund-per-bet unique backstop;
--   * all bankroll transactions and audit metadata.
--
-- Application rollback is a separate deployment action. Do not drop the
-- additive column or indexes: doing so could expose archived records or
-- destroy the invariant protecting already-issued refunds.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.cancel_pending_bet(uuid, text)
  FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF has_function_privilege(
       'authenticated',
       'public.cancel_pending_bet(uuid,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'rollback failed: authenticated still has EXECUTE';
  END IF;

  IF to_regclass('public.uq_bankroll_tx_one_tracker_cancel') IS NULL THEN
    RAISE EXCEPTION 'rollback unsafe: cancellation refund backstop is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bets'
      AND column_name = 'archived_at'
  ) THEN
    RAISE EXCEPTION 'rollback unsafe: archived_at audit marker is missing';
  END IF;
END
$$;

COMMIT;

-- Forward recovery after a separately approved fix:
-- GRANT EXECUTE ON FUNCTION public.cancel_pending_bet(uuid, text)
--   TO authenticated;
