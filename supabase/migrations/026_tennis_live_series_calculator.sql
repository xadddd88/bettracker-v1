-- ============================================================
-- Migration 026: Tennis Live Series Calculator storage + RLS
-- Tennis Live Series Calculator PR-3 (additive schema only)
--
-- REVIEW ONLY — DO NOT APPLY AUTOMATICALLY.
-- This migration is intentionally unapplied by the PR-3 Draft PR.
-- Applying it to Supabase requires a separate Founder/CPO
-- authorization, catalog verification, and a smoke plan.
--
-- Scope:
--   * two new additive tables: tennis_series (parent) and
--     tennis_series_steps (child), both in schema public;
--   * exact financial storage: EVERY financial column is bare `numeric`
--     with NO typmod. Precision is enforced by explicit CHECKs —
--     scale(value) <= 2 for money, scale(value) <= 3 for odds — and the
--     explicit value bounds (core money ceiling, closed odds interval)
--     are applied on top, unchanged. No float / real / double precision
--     anywhere. See the typmod note below for why a declared scale is
--     deliberately NOT used;
--   * RLS explicitly ENABLED on both tables, owner-scoped via
--     (SELECT auth.uid()) per the migration 011 init-plan pattern;
--   * explicit privilege boundary per the migration 018 domain-write
--     pattern: PUBLIC/anon lose everything, authenticated is
--     SELECT-only, and NO writable surface exists for any client role;
--   * server-generated timestamps reusing the existing
--     set_updated_at() trigger function (unchanged by this migration).
--
-- Deliberately NOT done here (PR-3 boundary):
--   * no RPC and no SECURITY DEFINER function — there is therefore no
--     authoritative write path yet. State changes arrive only with a
--     later PR whose server commands sit behind the PR-2 access gate
--     (TENNIS_CALC_ENABLED + OWNER_USER_ID), which remains OFF;
--   * no INSERT/UPDATE/DELETE grant or policy for anon or
--     authenticated, so this migration cannot become a bypass of the
--     disabled feature flag;
--   * no existing table, function, policy or grant is modified;
--   * no FORCE ROW LEVEL SECURITY (matches migration 018's rationale);
--   * no DROP and no down-migration. Emergency rollback lives outside
--     supabase/migrations as docs/tennis-pr3-rollback.sql, per the
--     #048/#049/#060 convention, and is not applied automatically.
--
-- Naming rationale:
--   * tennis_series — domain-prefixed like fixture_provider_links and
--     football_enrichment; "series" is invariant in the plural, so the
--     table name is already plural.
--   * tennis_series_steps — <parent>_<child> like bets → bet_legs.
--
-- WHY EVERY FINANCIAL COLUMN IS BARE `numeric` WITH NO TYPMOD
--   A typmod'd numeric(p,s) is NOT a precision guard: PostgreSQL ROUNDS the
--   input to the declared scale FIRST and only THEN evaluates CHECK
--   constraints. Under numeric(6,3) an input of 1.0099 is rounded to 1.010
--   and stored successfully, and 20.0004 becomes 20.000 — yet the PR-1 core
--   rejects both as odds_precision. Likewise numeric(12,2) would silently
--   round a 3-decimal money value into range. That is exactly the "extra
--   precision is REJECTED, never silently rounded" rule inverted.
--   Therefore every financial column below is EXACT `numeric` with no
--   typmod, and precision is enforced by an explicit CHECK that runs
--   against the value AS SUPPLIED:
--     * odds  : scale(value) <= 3   (core oddsScale 1000)
--     * money : scale(value) <= 2   (core moneyScale 100)
--   scale() is used deliberately, NOT min_scale(): the core also rejects a
--   superfluous trailing zero, so odds 1.0100 (scale 4) and money 1.230
--   (scale 3) must fail even though min_scale() would report 2 for both.
--   This is a fail-closed precision contract: nothing that the core would
--   refuse can be persisted, and nothing is quietly reshaped on the way in.
--
-- Financial bounds (kept compatible with the accepted PR-1 core in
-- lib/tennis/*, NOT with any observed match price):
--   * money: ceiling 100000000.00 == core MAX_MONEY_MINOR 10000000000
--     minor units; scale <= 2 == core moneyScale 100;
--   * odds: the CLOSED range [1.010, 20.000] is exactly the core's
--     admissible interval — the inclusive lower bound 1.010 == core
--     MIN_ODDS_SCALED 1010 / 1000 and the inclusive upper bound 20.000 ==
--     core MAX_ODDS_SCALED 20000 / 1000. Both endpoints are accepted;
--     1.001..1.009 is rejected as out of range and 1.0099 / 20.0004 /
--     1.0100 are rejected as excess precision. The observed 2.90 / 3.05 /
--     3.18 / 3.34 prices are ordinary values well inside this range and
--     are NOT bounds anywhere;
--   * step ceiling 15 == core MAX_GAMES.
--
-- No bookmaker account, coupon, login, cookie, session or token column
-- exists in either table, by construction.
-- ============================================================

BEGIN;

-- ── Parent: one calculator series per tracked match run ──────────────
CREATE TABLE public.tennis_series (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','active','completed_win','stopped','limit_reached','cancelled')),
  -- Money columns are EXACT numeric with NO typmod (see the header note on
  -- silent typmod rounding). scale(...) <= 2 rejects extra precision BEFORE
  -- storage, including a superfluous trailing zero such as 1.230.
  target_profit     numeric NOT NULL
                    CHECK (scale(target_profit) <= 2
                           AND target_profit > 0 AND target_profit <= 100000000),
  initial_stake     numeric
                    CHECK (initial_stake IS NULL
                           OR (scale(initial_stake) <= 2
                               AND initial_stake > 0 AND initial_stake <= 100000000)),
  stake_increment   numeric NOT NULL DEFAULT 0.01
                    CHECK (scale(stake_increment) <= 2
                           AND stake_increment > 0 AND stake_increment <= 100000000),
  currency_or_unit  text NOT NULL DEFAULT 'USD'
                    CHECK (char_length(btrim(currency_or_unit)) BETWEEN 1 AND 16),
  bankroll_limit    numeric NOT NULL
                    CHECK (scale(bankroll_limit) <= 2
                           AND bankroll_limit > 0 AND bankroll_limit <= 100000000),
  maximum_stake     numeric
                    CHECK (maximum_stake IS NULL
                           OR (scale(maximum_stake) <= 2
                               AND maximum_stake > 0 AND maximum_stake <= 100000000)),
  maximum_steps     integer NOT NULL
                    CHECK (maximum_steps > 0 AND maximum_steps <= 15),
  exposure_limit    numeric NOT NULL
                    CHECK (scale(exposure_limit) <= 2
                           AND exposure_limit > 0 AND exposure_limit <= 100000000),
  formula_version   text NOT NULL
                    CHECK (char_length(btrim(formula_version)) BETWEEN 1 AND 32),
  version           integer NOT NULL DEFAULT 0
                    CHECK (version >= 0),
  match_label       text
                    CHECK (match_label IS NULL OR char_length(match_label) <= 200),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  closed_at         timestamptz
);

COMMENT ON TABLE  public.tennis_series IS
  'Tennis Live Series Calculator run header. Owner-scoped, SELECT-only for authenticated; no client write surface exists in PR-3.';
COMMENT ON COLUMN public.tennis_series.version IS
  'Optimistic-concurrency counter, incremented by a future server command; never client-writable.';
COMMENT ON COLUMN public.tennis_series.match_label IS
  'Optional private user-supplied match reference. Never a bookmaker account, coupon or credential.';
COMMENT ON COLUMN public.tennis_series.formula_version IS
  'Mandatory pinned calculator formula version for reproducibility of stored recommendations.';

-- ── Child: one row per confirmed calculator step ─────────────────────
CREATE TABLE public.tennis_series_steps (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id                uuid NOT NULL REFERENCES public.tennis_series(id) ON DELETE CASCADE,
  step_number              integer NOT NULL
                           CHECK (step_number > 0 AND step_number <= 15),
  operation_id             uuid NOT NULL,
  set_number               integer
                           CHECK (set_number IS NULL OR set_number > 0),
  game_number              integer
                           CHECK (game_number IS NULL OR game_number > 0),
  -- Odds: EXACT numeric with NO typmod. scale(...) <= 3 rejects extra precision
  -- BEFORE storage (1.0099, 20.0004) and also rejects a superfluous trailing
  -- zero (1.0100), matching the core's odds_precision rejection.
  quoted_odds              numeric NOT NULL
                           CHECK (scale(quoted_odds) <= 3
                                  AND quoted_odds >= 1.010 AND quoted_odds <= 20.000),
  recommended_stake        numeric NOT NULL
                           CHECK (scale(recommended_stake) <= 2
                                  AND recommended_stake > 0 AND recommended_stake <= 100000000),
  accepted_odds            numeric NOT NULL
                           CHECK (scale(accepted_odds) <= 3
                                  AND accepted_odds >= 1.010 AND accepted_odds <= 20.000),
  accepted_stake           numeric NOT NULL
                           CHECK (scale(accepted_stake) <= 2
                                  AND accepted_stake > 0 AND accepted_stake <= 100000000),
  actual_return            numeric
                           CHECK (actual_return IS NULL
                                  OR (scale(actual_return) <= 2
                                      AND actual_return >= 0 AND actual_return <= 100000000)),
  status                   text NOT NULL
                           CHECK (status IN ('confirmed','lost','won','void')),
  loss_before              numeric NOT NULL
                           CHECK (scale(loss_before) <= 2
                                  AND loss_before >= 0 AND loss_before <= 100000000),
  target_profit_snapshot   numeric NOT NULL
                           CHECK (scale(target_profit_snapshot) <= 2
                                  AND target_profit_snapshot > 0 AND target_profit_snapshot <= 100000000),
  projected_series_result  numeric NOT NULL
                           CHECK (scale(projected_series_result) <= 2
                                  AND projected_series_result >= -100000000
                                  AND projected_series_result <= 100000000),
  confirmed_at             timestamptz NOT NULL DEFAULT now(),
  settled_at               timestamptz,
  -- one step number and one idempotent operation per series
  CONSTRAINT tennis_series_steps_series_step_number_key UNIQUE (series_id, step_number),
  CONSTRAINT tennis_series_steps_series_operation_id_key UNIQUE (series_id, operation_id),
  -- 'confirmed' IS the unsettled state: it must carry no settlement stamp,
  -- and every settled outcome must carry one.
  CONSTRAINT tennis_series_steps_settlement_stamp_chk CHECK (
    (status = 'confirmed' AND settled_at IS NULL)
    OR (status <> 'confirmed' AND settled_at IS NOT NULL)
  ),
  -- a return is only meaningful once settled
  CONSTRAINT tennis_series_steps_return_settled_chk CHECK (
    status <> 'confirmed' OR actual_return IS NULL
  )
);

COMMENT ON TABLE  public.tennis_series_steps IS
  'One confirmed Tennis Live Series Calculator step. Ownership derives from the parent series; SELECT-only for authenticated, no client write surface in PR-3.';
COMMENT ON COLUMN public.tennis_series_steps.operation_id IS
  'Caller-supplied idempotency key, unique per series; used by a future server command to make step confirmation retry-safe.';
COMMENT ON COLUMN public.tennis_series_steps.loss_before IS
  'Snapshot of accumulated realised loss BEFORE this step, so a stored recommendation stays auditable.';
COMMENT ON COLUMN public.tennis_series_steps.projected_series_result IS
  'Snapshot of the projected series result at confirmation time; may be negative, hence the signed bound.';

-- ── At most one unsettled ('confirmed') step per series ──────────────
CREATE UNIQUE INDEX tennis_series_steps_one_unsettled_uidx
  ON public.tennis_series_steps (series_id)
  WHERE status = 'confirmed';

-- ── Indexes: ownership, foreign keys, statuses, timestamps ───────────
CREATE INDEX idx_tennis_series_user_id      ON public.tennis_series (user_id);
CREATE INDEX idx_tennis_series_status       ON public.tennis_series (status);
CREATE INDEX idx_tennis_series_created_at   ON public.tennis_series (created_at);
CREATE INDEX idx_tennis_series_closed_at    ON public.tennis_series (closed_at);
CREATE INDEX idx_tennis_series_user_status  ON public.tennis_series (user_id, status);

CREATE INDEX idx_tennis_series_steps_series_id    ON public.tennis_series_steps (series_id);
CREATE INDEX idx_tennis_series_steps_status       ON public.tennis_series_steps (status);
CREATE INDEX idx_tennis_series_steps_confirmed_at ON public.tennis_series_steps (confirmed_at);
CREATE INDEX idx_tennis_series_steps_settled_at   ON public.tennis_series_steps (settled_at);

-- ── Server-generated updated_at (reuses the existing 001 function) ───
-- set_updated_at() is NOT SECURITY DEFINER and is not modified here;
-- only a new trigger on a new table is added.
CREATE TRIGGER trg_tennis_series_updated_at
  BEFORE UPDATE ON public.tennis_series
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS: explicitly enabled on both new tables ───────────────────────
ALTER TABLE public.tennis_series       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tennis_series_steps ENABLE ROW LEVEL SECURITY;

-- ── Privilege boundary (migration 018 domain-write pattern) ──────────
-- REVOKE ALL (not an enumerated list): PostgreSQL 17 adds MAINTAIN to
-- the ACL, which an enumerated revoke would silently leave behind.
-- authenticated becomes SELECT-only; PUBLIC and anon get nothing.
-- No INSERT / UPDATE / DELETE is granted to any client role, so there
-- is no writable runtime surface and no way to bypass the disabled
-- feature flag.
--
-- service_role: PR-3 deliberately does NOT manage service_role ACLs —
-- it neither grants nor revokes anything for that role, and the
-- statements below touch only PUBLIC, anon and authenticated. What
-- service_role can actually do on these two new tables therefore
-- depends on the project's CURRENT DEFAULT PRIVILEGES, which is
-- environment-dependent: Supabase's 2026 Data API change allows default
-- table grants for service_role to be disabled, in which case new
-- tables require explicit GRANTs. This migration makes no claim that
-- service_role holds any privilege here, and the disposable verifier
-- does NOT test service_role write access.
--   Consequences, deliberately left to later steps:
--     * PR-3 adds no application route, RPC or server command, so
--       nothing needs service_role access yet;
--     * the future gated write-path PR must explicitly normalize and
--       verify the minimum required service_role grants instead of
--       relying on defaults;
--     * the applying operator must inspect the EFFECTIVE ACL on both
--       tables before activating any write path.
REVOKE ALL ON public.tennis_series FROM PUBLIC;
REVOKE ALL ON public.tennis_series FROM anon;
REVOKE ALL ON public.tennis_series FROM authenticated;
GRANT SELECT ON public.tennis_series TO authenticated;

REVOKE ALL ON public.tennis_series_steps FROM PUBLIC;
REVOKE ALL ON public.tennis_series_steps FROM anon;
REVOKE ALL ON public.tennis_series_steps FROM authenticated;
GRANT SELECT ON public.tennis_series_steps TO authenticated;

-- ── Owner-scoped SELECT policies (defense in depth) ──────────────────
-- (SELECT auth.uid()) is the migration 011 init-plan form: evaluated
-- once per statement instead of once per row. TO authenticated is used
-- rather than an auth.role() predicate.
CREATE POLICY "tennis_series select own" ON public.tennis_series
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- A step is reachable only through a series the caller owns. An unknown
-- or foreign series UUID yields zero rows, so probing ids cannot reveal
-- whether another user's record exists.
CREATE POLICY "tennis_series_steps select own" ON public.tennis_series_steps
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tennis_series
    WHERE tennis_series.id = tennis_series_steps.series_id
      AND tennis_series.user_id = (SELECT auth.uid())
  ));

-- ── Post-apply assertions (fail-closed, same transaction) ────────────
-- If any invariant below is violated the whole migration rolls back.
DO $$
DECLARE
  v_tbl text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['tennis_series','tennis_series_steps'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_tbl AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled on public.%', v_tbl;
    END IF;

    IF has_table_privilege('anon', format('public.%I', v_tbl), 'SELECT')
       OR has_table_privilege('anon', format('public.%I', v_tbl), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', v_tbl), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', v_tbl), 'DELETE') THEN
      RAISE EXCEPTION 'anon must hold no privilege on public.%', v_tbl;
    END IF;

    IF NOT has_table_privilege('authenticated', format('public.%I', v_tbl), 'SELECT') THEN
      RAISE EXCEPTION 'authenticated must hold SELECT on public.%', v_tbl;
    END IF;

    IF has_table_privilege('authenticated', format('public.%I', v_tbl), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', v_tbl), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', v_tbl), 'DELETE')
       OR has_table_privilege('authenticated', format('public.%I', v_tbl), 'TRUNCATE') THEN
      RAISE EXCEPTION 'authenticated must have NO write privilege on public.% in PR-3', v_tbl;
    END IF;
  END LOOP;

  -- No float/real/double precision may hold a financial value.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('tennis_series','tennis_series_steps')
      AND data_type IN ('real','double precision','float')
  ) THEN
    RAISE EXCEPTION 'approximate float type found in tennis calculator storage';
  END IF;

  -- No financial column may carry a rounding typmod: a declared scale would
  -- round the input before these CHECKs could reject it.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('tennis_series','tennis_series_steps')
      AND data_type = 'numeric'
      AND (numeric_precision IS NOT NULL OR numeric_scale IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'financial numeric column declares a typmod — it would silently round input before CHECK';
  END IF;

  -- Every financial column must carry an explicit scale() precision guard.
  FOREACH v_tbl IN ARRAY ARRAY['tennis_series','tennis_series_steps'] LOOP
    IF EXISTS (
      SELECT 1
        FROM information_schema.columns c
       WHERE c.table_schema = 'public' AND c.table_name = v_tbl
         AND c.data_type = 'numeric'
         AND NOT EXISTS (
           SELECT 1 FROM pg_constraint con
            WHERE con.conrelid = format('public.%I', v_tbl)::regclass
              AND con.contype = 'c'
              AND pg_get_constraintdef(con.oid) LIKE '%scale(' || c.column_name || ')%'
         )
    ) THEN
      RAISE EXCEPTION 'a financial numeric column on public.% lacks a scale() precision guard', v_tbl;
    END IF;
  END LOOP;
END
$$;

COMMIT;
