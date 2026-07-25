#!/usr/bin/env bash
# ============================================================
# Disposable verifier for migration 026 (Tennis Live Series
# Calculator storage + RLS), following scripts/verify-migration-024.sh.
#
# Runs schema/catalog assertions plus a two-user RLS behaviour matrix
# against a DISPOSABLE PostgreSQL database. It refuses production-looking
# URLs and never reads production data or secrets.
#
# usage: scripts/verify-migration-026.sh postgresql://...
# ============================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$ROOT_DIR/supabase/migrations/026_tennis_live_series_calculator.sql"
ROLLBACK="$ROOT_DIR/docs/tennis-pr3-rollback.sql"
DATABASE_URL="${1:-${DATABASE_URL:-}}"

if [[ -z "$DATABASE_URL" ]]; then
  echo "usage: $0 postgresql://...  (DISPOSABLE database only)" >&2
  exit 2
fi

if [[ "$DATABASE_URL" =~ (supabase\.co|pooler\.supabase\.com|btdk\.app) ]]; then
  echo "refusing a production-looking database URL" >&2
  exit 2
fi

PSQL=(psql "$DATABASE_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 -q)
step=0
step() {
  step=$((step + 1))
  printf '[%02d/14] %s\n' "$step" "$1"
}

# ── 1. static scan of the migration text ─────────────────────
# Scans EXECUTABLE, NON-LITERAL SQL only. Both `--` comments and '...' string
# literals are stripped first, so neither the header prose (which legitimately
# names what the migration must NOT do, e.g. "set_updated_at() is NOT SECURITY
# DEFINER") nor the migration's own anti-float assertion (which lists
# 'real','double precision','float' as literals) can trip a check.
step 'static scan: no RPC / SECURITY DEFINER / float / DROP / down-migration'
SQL_CODE="$(mktemp)"
trap 'rm -f "$SQL_CODE"' EXIT
sed -e "s/--.*\$//" -e "s/'[^']*'//g" "$MIGRATION" > "$SQL_CODE"

if grep -qiE 'SECURITY[[:space:]]+DEFINER' "$SQL_CODE"; then
  echo 'FAIL: migration contains SECURITY DEFINER' >&2; exit 1
fi
if grep -qiE '^[[:space:]]*CREATE( OR REPLACE)? FUNCTION' "$SQL_CODE"; then
  echo 'FAIL: migration creates a function (no RPC allowed in PR-3)' >&2; exit 1
fi
if grep -qiE '\b(real|double precision|float[48]?)\b' "$SQL_CODE"; then
  echo 'FAIL: approximate float type present' >&2; exit 1
fi
if grep -qiE '^[[:space:]]*DROP[[:space:]]+(TABLE|COLUMN|POLICY|INDEX|TRIGGER)' "$SQL_CODE"; then
  echo 'FAIL: destructive DROP present' >&2; exit 1
fi
for forbidden in bookmaker coupon cookie login token session; do
  if grep -qiE "[a-z_]*${forbidden}[a-z_]*[[:space:]]+(text|uuid|numeric|jsonb|boolean|integer)" "$SQL_CODE"; then
    echo "FAIL: forbidden column family '${forbidden}' present" >&2; exit 1
  fi
done

# ── 2. bootstrap the disposable Supabase-like fixture ────────
step 'bootstrap disposable fixture (roles, auth.users, auth.uid, set_updated_at)'
"${PSQL[@]}" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
SQL

# ── 3. clean apply ───────────────────────────────────────────
step 'clean apply of migration 026'
"${PSQL[@]}" -f "$MIGRATION"

# ── 4. catalog assertions ────────────────────────────────────
step 'catalog: tables, RLS enabled, policies, indexes, constraints, exact numerics'
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE v_tbl text; v_col text; v_n int;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['tennis_series','tennis_series_steps'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND c.relname=v_tbl) THEN
      RAISE EXCEPTION 'missing table public.%', v_tbl;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND c.relname=v_tbl AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'RLS not enabled on public.%', v_tbl;
    END IF;
    -- exactly one SELECT policy, TO authenticated, no write policy
    SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename=v_tbl;
    IF v_n <> 1 THEN RAISE EXCEPTION 'public.% must have exactly 1 policy, found %', v_tbl, v_n; END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_tbl AND cmd <> 'SELECT') THEN
      RAISE EXCEPTION 'public.% must expose no write policy in PR-3', v_tbl;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_tbl
                   AND roles = ARRAY['authenticated']::name[]) THEN
      RAISE EXCEPTION 'public.% policy must target TO authenticated', v_tbl;
    END IF;
    -- init-plan form, not a bare auth.uid() / auth.role() predicate
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_tbl
               AND (qual LIKE '%auth.role()%')) THEN
      RAISE EXCEPTION 'public.% must not use auth.role()', v_tbl;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_tbl
                   AND qual LIKE '%( SELECT auth.uid()%') THEN
      RAISE EXCEPTION 'public.% policy must use the (SELECT auth.uid()) init-plan form', v_tbl;
    END IF;
  END LOOP;

  -- financial columns are exact numeric with the intended scale
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name IN ('tennis_series','tennis_series_steps')
               AND data_type IN ('real','double precision','float')) THEN
    RAISE EXCEPTION 'approximate float column present';
  END IF;
  -- NO financial column may declare a typmod. numeric(p,s) ROUNDS the input to
  -- s BEFORE any CHECK runs, so a declared scale silently reshapes excess
  -- precision (1.0099 -> 1.010) instead of rejecting it.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name IN ('tennis_series','tennis_series_steps')
               AND data_type='numeric'
               AND (numeric_precision IS NOT NULL OR numeric_scale IS NOT NULL)) THEN
    RAISE EXCEPTION
      'a financial numeric column declares a rounding typmod; use bare numeric + an explicit scale() CHECK';
  END IF;

  -- Catalog guard against re-divergence from the PR-1 core: BOTH odds columns
  -- must carry a CHECK naming the inclusive core endpoints 1.010 and 20.000.
  -- A predicate such as "> 1" would admit 1.001..1.009, which the core rejects,
  -- so its absence is asserted explicitly rather than assumed.
  FOREACH v_col IN ARRAY ARRAY['quoted_odds','accepted_odds'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint con
       WHERE con.conrelid = 'public.tennis_series_steps'::regclass
         AND con.contype = 'c'
         AND pg_get_constraintdef(con.oid) LIKE '%' || v_col || '%'
         AND pg_get_constraintdef(con.oid) LIKE '%1.010%'
         AND pg_get_constraintdef(con.oid) LIKE '%20.000%'
    ) THEN
      RAISE EXCEPTION
        'CHECK on % must bound it to the core interval [1.010, 20.000]', v_col;
    END IF;
    -- an exclusive-of-1 lower bound must NOT be what guards the column
    IF EXISTS (
      SELECT 1 FROM pg_constraint con
       WHERE con.conrelid = 'public.tennis_series_steps'::regclass
         AND con.contype = 'c'
         AND pg_get_constraintdef(con.oid) LIKE '%' || v_col || '%'
         AND pg_get_constraintdef(con.oid) ~ ('\(' || v_col || ' > \(?1\)?::numeric')
    ) THEN
      RAISE EXCEPTION
        '% is guarded by a "> 1" predicate, which admits 1.001..1.009 rejected by the core', v_col;
    END IF;
  END LOOP;

  -- Precision guards: every financial column must carry an explicit scale()
  -- CHECK with the limit for its kind -- 3 for odds (core oddsScale 1000),
  -- 2 for money (core moneyScale 100). scale() and NOT min_scale(), because
  -- the core also rejects a superfluous trailing zero (odds 1.0100, money 1.230).
  FOREACH v_col IN ARRAY ARRAY['quoted_odds','accepted_odds'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint con
       WHERE con.conrelid = 'public.tennis_series_steps'::regclass AND con.contype='c'
         AND pg_get_constraintdef(con.oid) LIKE '%scale(' || v_col || ') <= 3%'
    ) THEN
      RAISE EXCEPTION 'odds column % lacks a scale() <= 3 precision guard', v_col;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_constraint con
       WHERE con.conrelid = 'public.tennis_series_steps'::regclass AND con.contype='c'
         AND pg_get_constraintdef(con.oid) LIKE '%min_scale(' || v_col || ')%'
    ) THEN
      RAISE EXCEPTION 'odds column % uses min_scale(), which permits trailing-zero precision', v_col;
    END IF;
  END LOOP;

  FOREACH v_col IN ARRAY ARRAY[
    'target_profit','initial_stake','stake_increment','bankroll_limit','maximum_stake','exposure_limit'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint con
       WHERE con.conrelid = 'public.tennis_series'::regclass AND con.contype='c'
         AND pg_get_constraintdef(con.oid) LIKE '%scale(' || v_col || ') <= 2%'
    ) THEN
      RAISE EXCEPTION 'money column tennis_series.% lacks a scale() <= 2 precision guard', v_col;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_constraint con
       WHERE con.conrelid = 'public.tennis_series'::regclass AND con.contype='c'
         AND pg_get_constraintdef(con.oid) LIKE '%min_scale(' || v_col || ')%'
    ) THEN
      RAISE EXCEPTION 'money column tennis_series.% uses min_scale()', v_col;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint con
       WHERE con.conrelid = 'public.tennis_series'::regclass AND con.contype='c'
         AND pg_get_constraintdef(con.oid) LIKE '%' || v_col || '%'
         AND pg_get_constraintdef(con.oid) LIKE '%100000000%'
    ) THEN
      RAISE EXCEPTION 'money column tennis_series.% lost its value ceiling', v_col;
    END IF;
  END LOOP;

  FOREACH v_col IN ARRAY ARRAY[
    'recommended_stake','accepted_stake','actual_return','loss_before',
    'target_profit_snapshot','projected_series_result'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint con
       WHERE con.conrelid = 'public.tennis_series_steps'::regclass AND con.contype='c'
         AND pg_get_constraintdef(con.oid) LIKE '%scale(' || v_col || ') <= 2%'
    ) THEN
      RAISE EXCEPTION 'money column tennis_series_steps.% lacks a scale() <= 2 precision guard', v_col;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_constraint con
       WHERE con.conrelid = 'public.tennis_series_steps'::regclass AND con.contype='c'
         AND pg_get_constraintdef(con.oid) LIKE '%min_scale(' || v_col || ')%'
    ) THEN
      RAISE EXCEPTION 'money column tennis_series_steps.% uses min_scale()', v_col;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint con
       WHERE con.conrelid = 'public.tennis_series_steps'::regclass AND con.contype='c'
         AND pg_get_constraintdef(con.oid) LIKE '%' || v_col || '%'
         AND pg_get_constraintdef(con.oid) LIKE '%100000000%'
    ) THEN
      RAISE EXCEPTION 'money column tennis_series_steps.% lost its value ceiling', v_col;
    END IF;
  END LOOP;

  -- NOT NULL + FK on ownership and parentage
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
             AND table_name='tennis_series' AND column_name='user_id' AND is_nullable='YES') THEN
    RAISE EXCEPTION 'tennis_series.user_id must be NOT NULL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname LIKE '%tennis_series%user_id%'
                 AND contype='f') THEN
    RAISE EXCEPTION 'tennis_series.user_id must have a FK to auth.users';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.tennis_series_steps'::regclass
                 AND contype='f' AND confrelid='public.tennis_series'::regclass) THEN
    RAISE EXCEPTION 'tennis_series_steps.series_id must have a FK to tennis_series';
  END IF;

  -- required unique constraints + the partial unsettled invariant
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tennis_series_steps_series_step_number_key') THEN
    RAISE EXCEPTION 'missing UNIQUE(series_id, step_number)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tennis_series_steps_series_operation_id_key') THEN
    RAISE EXCEPTION 'missing UNIQUE(series_id, operation_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                 AND indexname='tennis_series_steps_one_unsettled_uidx'
                 AND indexdef LIKE '%WHERE (status = ''confirmed''::text)%') THEN
    RAISE EXCEPTION 'missing partial unique index for the single unsettled step';
  END IF;

  -- ownership / FK / status / timestamp indexes
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
      AND tablename IN ('tennis_series','tennis_series_steps')) < 10 THEN
    RAISE EXCEPTION 'expected ownership/FK/status/timestamp indexes to be present';
  END IF;

  -- server-generated timestamps
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_tennis_series_updated_at') THEN
    RAISE EXCEPTION 'missing updated_at trigger';
  END IF;

  -- no SECURITY DEFINER function was introduced by this migration
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.prosecdef AND p.proname LIKE '%tennis%') THEN
    RAISE EXCEPTION 'tennis SECURITY DEFINER function present';
  END IF;
END $$;
SQL

# ── 5. privilege matrix ──────────────────────────────────────
step 'privileges: anon nothing, authenticated SELECT-only, no write surface'
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE v_tbl text; v_priv text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['tennis_series','tennis_series_steps'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('anon', format('public.%I', v_tbl), v_priv) THEN
        RAISE EXCEPTION 'anon must not hold % on %', v_priv, v_tbl;
      END IF;
    END LOOP;
    -- PUBLIC is not addressable via has_table_privilege(); grantee OID 0 in the
    -- ACL is the PUBLIC pseudo-role, so assert no such ACL entry exists.
    IF EXISTS (
      SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(c.relacl) a
       WHERE n.nspname = 'public' AND c.relname = v_tbl AND a.grantee = 0
    ) THEN
      RAISE EXCEPTION 'PUBLIC must hold no privilege on %', v_tbl;
    END IF;
    IF NOT has_table_privilege('authenticated', format('public.%I', v_tbl), 'SELECT') THEN
      RAISE EXCEPTION 'authenticated needs SELECT on %', v_tbl;
    END IF;
    FOREACH v_priv IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
      IF has_table_privilege('authenticated', format('public.%I', v_tbl), v_priv) THEN
        RAISE EXCEPTION 'authenticated must not hold % on % in PR-3', v_priv, v_tbl;
      END IF;
    END LOOP;
  END LOOP;
END $$;
SQL

# ── 6. two-user seed (as owner/service-role equivalent) ──────
step 'seed two synthetic users and one series + step each'
"${PSQL[@]}" <<'SQL'
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-4111-8111-111111111111','user-a@example.test'),
  ('22222222-2222-4222-8222-222222222222','user-b@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tennis_series
  (id, user_id, status, target_profit, initial_stake, stake_increment, currency_or_unit,
   bankroll_limit, maximum_stake, maximum_steps, exposure_limit, formula_version, match_label)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','active',
   46.80, 20.00, 0.01, 'USD', 1000.00, 200.00, 15, 500.00, 'v1', 'A private label'),
  ('bbbbbbbb-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','active',
   46.80, 20.00, 0.01, 'USD', 1000.00, 200.00, 15, 500.00, 'v1', 'B private label');

INSERT INTO public.tennis_series_steps
  (series_id, step_number, operation_id, set_number, game_number, quoted_odds, recommended_stake,
   accepted_odds, accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 1, gen_random_uuid(), 1, 3, 3.340, 20.00, 3.340, 20.00,
   'confirmed', 0.00, 46.80, 46.80),
  ('bbbbbbbb-0000-4000-8000-000000000002', 1, gen_random_uuid(), 1, 3, 2.900, 20.00, 2.900, 20.00,
   'confirmed', 0.00, 46.80, 38.00);
SQL

# ── 7. RLS behaviour: owner isolation ────────────────────────
step 'RLS: each owner sees exactly their own series and steps'
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE v_n int;
BEGIN
  -- user A
  PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.tennis_series;
  IF v_n <> 1 THEN RAISE EXCEPTION 'user A must see exactly 1 series, saw %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.tennis_series
    WHERE id = 'bbbbbbbb-0000-4000-8000-000000000002';
  IF v_n <> 0 THEN RAISE EXCEPTION 'user A must NOT see user B series by known UUID'; END IF;
  SELECT count(*) INTO v_n FROM public.tennis_series_steps;
  IF v_n <> 1 THEN RAISE EXCEPTION 'user A must see exactly 1 step, saw %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.tennis_series_steps
    WHERE series_id = 'bbbbbbbb-0000-4000-8000-000000000002';
  IF v_n <> 0 THEN RAISE EXCEPTION 'user A must NOT read steps of a foreign parent series'; END IF;
  RESET ROLE;

  -- user B, symmetric
  PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.tennis_series;
  IF v_n <> 1 THEN RAISE EXCEPTION 'user B must see exactly 1 series, saw %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.tennis_series
    WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001';
  IF v_n <> 0 THEN RAISE EXCEPTION 'user B must NOT see user A series by known UUID'; END IF;
  RESET ROLE;

  -- unauthenticated authenticated-role session (no JWT claim) sees nothing
  PERFORM set_config('request.jwt.claim.sub','', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.tennis_series;
  IF v_n <> 0 THEN RAISE EXCEPTION 'a session with no subject must see 0 series, saw %', v_n; END IF;
  RESET ROLE;
END $$;
SQL

# ── 8. no writable surface for authenticated / anon ──────────
step 'mutation surface: authenticated and anon writes are refused'
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE v_sqlstate text; v_ok boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111', true);

  -- INSERT of own row: refused at privilege level (no INSERT grant)
  SET LOCAL ROLE authenticated;
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series
      (user_id, status, target_profit, stake_increment, currency_or_unit, bankroll_limit,
       maximum_steps, exposure_limit, formula_version)
    VALUES ('11111111-1111-4111-8111-111111111111','draft',10.00,0.01,'USD',100.00,15,100.00,'v1');
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'authenticated INSERT must be refused'; END IF;

  -- INSERT impersonating another user: also refused
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series
      (user_id, status, target_profit, stake_increment, currency_or_unit, bankroll_limit,
       maximum_steps, exposure_limit, formula_version)
    VALUES ('22222222-2222-4222-8222-222222222222','draft',10.00,0.01,'USD',100.00,15,100.00,'v1');
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'authenticated INSERT of a foreign user_id must be refused'; END IF;

  -- UPDATE of own row, and of a foreign row: refused
  v_ok := false;
  BEGIN
    UPDATE public.tennis_series SET status='cancelled'
     WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'authenticated UPDATE must be refused'; END IF;

  v_ok := false;
  BEGIN
    UPDATE public.tennis_series SET user_id='11111111-1111-4111-8111-111111111111'
     WHERE id='bbbbbbbb-0000-4000-8000-000000000002';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'authenticated UPDATE reassigning user_id must be refused'; END IF;

  -- DELETE: refused
  v_ok := false;
  BEGIN
    DELETE FROM public.tennis_series WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'authenticated DELETE must be refused'; END IF;

  -- steps table, same story
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 9, gen_random_uuid(), 3.0, 1.0, 3.0, 1.0,
            'confirmed', 0.00, 1.00, 1.00);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'authenticated step INSERT must be refused'; END IF;
  RESET ROLE;

  -- anon: no read, no write
  SET LOCAL ROLE anon;
  v_ok := false;
  BEGIN
    PERFORM count(*) FROM public.tennis_series;
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'anon SELECT must be refused'; END IF;

  v_ok := false;
  BEGIN
    PERFORM count(*) FROM public.tennis_series_steps;
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'anon step SELECT must be refused'; END IF;
  RESET ROLE;
END $$;
SQL

# ── 9. constraint and invariant enforcement ──────────────────
step 'constraints: odds core interval [1.010, 20.000], positivity, uniqueness, single unsettled step, settlement stamps'
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE v_ok boolean;
  c_series uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
BEGIN
  -- odds must sit inside the closed core interval [1.010, 20.000].
  -- 1.000 is below it.
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result)
    VALUES (c_series, 10, gen_random_uuid(), 1.000, 1.00, 3.00, 1.00, 'confirmed', 0, 1, 1);
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'quoted_odds = 1.000 must be refused'; END IF;

  -- 1.009: representable at scale 3, ABOVE 1, but REJECTED by the core
  -- (MIN_ODDS_SCALED 1010). This is the case a "> 1" predicate wrongly admitted.
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result)
    VALUES (c_series, 10, gen_random_uuid(), 1.009, 1.00, 3.00, 1.00, 'confirmed', 0, 1, 1);
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'quoted_odds = 1.009 must be refused (below core MIN_ODDS_SCALED 1010)';
  END IF;

  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result)
    VALUES (c_series, 10, gen_random_uuid(), 3.00, 1.00, 1.009, 1.00, 'confirmed', 0, 1, 1);
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'accepted_odds = 1.009 must be refused (below core MIN_ODDS_SCALED 1010)';
  END IF;

  -- above the core maximum
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result)
    VALUES (c_series, 10, gen_random_uuid(), 20.001, 1.00, 3.00, 1.00, 'confirmed', 0, 1, 1);
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'quoted_odds = 20.001 must be refused (above core MAX_ODDS_SCALED 20000)';
  END IF;

  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result)
    VALUES (c_series, 10, gen_random_uuid(), 3.00, 1.00, 20.001, 1.00, 'confirmed', 0, 1, 1);
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'accepted_odds = 20.001 must be refused (above core MAX_ODDS_SCALED 20000)';
  END IF;

  -- BOTH inclusive endpoints must be ACCEPTED on BOTH columns. These insert
  -- real rows (settled, so they do not collide with the single-unsettled rule).
  INSERT INTO public.tennis_series_steps
    (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
     accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
  VALUES (c_series, 7, gen_random_uuid(), 1.010, 1.00, 1.010, 1.00, 'void', 0, 1, 1, now());

  INSERT INTO public.tennis_series_steps
    (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
     accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
  VALUES (c_series, 8, gen_random_uuid(), 20.000, 1.00, 20.000, 1.00, 'void', 0, 1, 1, now());

  -- and the two endpoints must round-trip exactly at scale 3
  IF NOT EXISTS (SELECT 1 FROM public.tennis_series_steps
                  WHERE series_id = c_series AND step_number = 7
                    AND quoted_odds = 1.010 AND accepted_odds = 1.010) THEN
    RAISE EXCEPTION 'odds 1.010 must round-trip exactly';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tennis_series_steps
                  WHERE series_id = c_series AND step_number = 8
                    AND quoted_odds = 20.000 AND accepted_odds = 20.000) THEN
    RAISE EXCEPTION 'odds 20.000 must round-trip exactly';
  END IF;

  -- non-positive stake
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result)
    VALUES (c_series, 11, gen_random_uuid(), 3.00, 0.00, 3.00, 1.00, 'confirmed', 0, 1, 1);
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'zero recommended_stake must be refused'; END IF;

  -- non-positive set/game number when provided
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, set_number, quoted_odds, recommended_stake,
       accepted_odds, accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result)
    VALUES (c_series, 12, gen_random_uuid(), 0, 3.00, 1.00, 3.00, 1.00, 'confirmed', 0, 1, 1);
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'set_number = 0 must be refused'; END IF;

  -- duplicate step_number in the same series. The row is otherwise fully valid
  -- (settled status carries settled_at) so the UNIQUE constraint is what fires:
  -- PostgreSQL evaluates CHECK constraints before unique indexes.
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
    VALUES (c_series, 1, gen_random_uuid(), 3.00, 1.00, 3.00, 1.00, 'lost', 0, 1, 1, now());
  EXCEPTION WHEN unique_violation THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'duplicate (series_id, step_number) must be refused'; END IF;

  -- duplicate operation_id in the same series
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
    SELECT c_series, 13, operation_id, 3.00, 1.00, 3.00, 1.00, 'lost', 0, 1, 1, now()
      FROM public.tennis_series_steps WHERE series_id = c_series AND step_number = 1;
  EXCEPTION WHEN unique_violation THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'duplicate (series_id, operation_id) must be refused'; END IF;

  -- a second unsettled ('confirmed') step in the same series
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result)
    VALUES (c_series, 2, gen_random_uuid(), 3.00, 1.00, 3.00, 1.00, 'confirmed', 0, 1, 1);
  EXCEPTION WHEN unique_violation THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'a second unsettled step must be refused'; END IF;

  -- settled status without settled_at
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result)
    VALUES (c_series, 3, gen_random_uuid(), 3.00, 1.00, 3.00, 1.00, 'won', 0, 1, 1);
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'settled status without settled_at must be refused'; END IF;

  -- 'confirmed' carrying a settlement stamp
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
    VALUES (c_series, 4, gen_random_uuid(), 3.00, 1.00, 3.00, 1.00, 'confirmed', 0, 1, 1, now());
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'confirmed step with settled_at must be refused'; END IF;

  -- a settled step alongside the existing unsettled one is allowed
  INSERT INTO public.tennis_series_steps
    (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
     accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result,
     actual_return, settled_at)
  VALUES (c_series, 5, gen_random_uuid(), 3.180, 30.65, 3.180, 30.65, 'lost', 20.00, 46.80, 46.80,
          0.00, now());

  -- observed prices are ordinary values, not bounds
  INSERT INTO public.tennis_series_steps
    (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
     accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
  VALUES (c_series, 6, gen_random_uuid(), 1.010, 1.00, 19.999, 1.00, 'void', 0, 1, 1, now());

  -- series-level guards
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series
      (user_id, status, target_profit, stake_increment, currency_or_unit, bankroll_limit,
       maximum_steps, exposure_limit, formula_version)
    VALUES ('11111111-1111-4111-8111-111111111111','draft',-1.00,0.01,'USD',100.00,15,100.00,'v1');
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'negative target_profit must be refused'; END IF;

  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series
      (user_id, status, target_profit, stake_increment, currency_or_unit, bankroll_limit,
       maximum_steps, exposure_limit, formula_version, version)
    VALUES ('11111111-1111-4111-8111-111111111111','draft',10.00,0.01,'USD',100.00,15,100.00,'v1',-1);
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'negative version must be refused'; END IF;

  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series
      (user_id, status, target_profit, stake_increment, currency_or_unit, bankroll_limit,
       maximum_steps, exposure_limit, formula_version)
    VALUES ('11111111-1111-4111-8111-111111111111','bogus_status',10.00,0.01,'USD',100.00,15,100.00,'v1');
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'unknown series status must be refused'; END IF;

  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series
      (user_id, status, target_profit, stake_increment, currency_or_unit, bankroll_limit,
       maximum_steps, exposure_limit, formula_version)
    VALUES ('11111111-1111-4111-8111-111111111111','draft',10.00,0.01,'USD',100.00,15,100.00,'   ');
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'blank formula_version must be refused'; END IF;

  -- FK integrity: unknown owner and unknown parent
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series
      (user_id, status, target_profit, stake_increment, currency_or_unit, bankroll_limit,
       maximum_steps, exposure_limit, formula_version)
    VALUES ('99999999-9999-4999-8999-999999999999','draft',10.00,0.01,'USD',100.00,15,100.00,'v1');
  EXCEPTION WHEN foreign_key_violation THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'unknown user_id must violate the FK'; END IF;

  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result)
    VALUES ('99999999-9999-4999-8999-999999999999', 1, gen_random_uuid(), 3.00, 1.00, 3.00, 1.00,
            'confirmed', 0, 1, 1);
  EXCEPTION WHEN foreign_key_violation THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'unknown series_id must violate the FK'; END IF;
END $$;
SQL

# ── 9b. precision contract: excess precision REJECTED, never rounded ──
step 'precision: excess scale rejected (never silently rounded) on all 14 financial columns'
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE
  c_series uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  c_owner  uuid := '11111111-1111-4111-8111-111111111111';
  v_ok boolean;
  v_n  int;
  v_col text;
  v_sql text;
  v_step int := 100;   -- distinct operation ids; step_number reused via rollback
BEGIN
  -- ============ ODDS: quoted_odds and accepted_odds ============
  -- helper pattern: each attempt runs in its own subtransaction so a rejection
  -- does not abort the block.
  FOREACH v_col IN ARRAY ARRAY['quoted_odds','accepted_odds'] LOOP
    -- 1.009 : inside scale, BELOW the core minimum
    v_ok := false;
    BEGIN
      v_sql := format($f$INSERT INTO public.tennis_series_steps
        (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
         accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
        VALUES (%L, 14, gen_random_uuid(),
                CASE WHEN %L = 'quoted_odds' THEN 1.009 ELSE 3.00 END, 1.00,
                CASE WHEN %L = 'accepted_odds' THEN 1.009 ELSE 3.00 END, 1.00,
                'void', 0, 1, 1, now())$f$, c_series, v_col, v_col);
      EXECUTE v_sql;
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF NOT v_ok THEN RAISE EXCEPTION '% = 1.009 must be rejected (below core minimum)', v_col; END IF;

    -- 1.0099 : 4 decimals. A numeric(6,3) would ROUND this to 1.010 and store it.
    v_ok := false;
    BEGIN
      v_sql := format($f$INSERT INTO public.tennis_series_steps
        (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
         accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
        VALUES (%L, 14, gen_random_uuid(),
                CASE WHEN %L = 'quoted_odds' THEN 1.0099 ELSE 3.00 END, 1.00,
                CASE WHEN %L = 'accepted_odds' THEN 1.0099 ELSE 3.00 END, 1.00,
                'void', 0, 1, 1, now())$f$, c_series, v_col, v_col);
      EXECUTE v_sql;
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF NOT v_ok THEN
      RAISE EXCEPTION '% = 1.0099 must be REJECTED as excess precision, not rounded to 1.010', v_col;
    END IF;

    -- 1.0100 : 4 decimals with a trailing zero. scale() = 4 so it must fail;
    -- min_scale() would have reported 2 and wrongly allowed it.
    v_ok := false;
    BEGIN
      v_sql := format($f$INSERT INTO public.tennis_series_steps
        (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
         accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
        VALUES (%L, 14, gen_random_uuid(),
                CASE WHEN %L = 'quoted_odds' THEN 1.0100 ELSE 3.00 END, 1.00,
                CASE WHEN %L = 'accepted_odds' THEN 1.0100 ELSE 3.00 END, 1.00,
                'void', 0, 1, 1, now())$f$, c_series, v_col, v_col);
      EXECUTE v_sql;
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF NOT v_ok THEN
      RAISE EXCEPTION '% = 1.0100 must be rejected as 4 decimal places (trailing zero)', v_col;
    END IF;

    -- 20.0004 : a numeric(6,3) would ROUND this to 20.000 and store it.
    v_ok := false;
    BEGIN
      v_sql := format($f$INSERT INTO public.tennis_series_steps
        (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
         accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
        VALUES (%L, 14, gen_random_uuid(),
                CASE WHEN %L = 'quoted_odds' THEN 20.0004 ELSE 3.00 END, 1.00,
                CASE WHEN %L = 'accepted_odds' THEN 20.0004 ELSE 3.00 END, 1.00,
                'void', 0, 1, 1, now())$f$, c_series, v_col, v_col);
      EXECUTE v_sql;
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF NOT v_ok THEN
      RAISE EXCEPTION '% = 20.0004 must be REJECTED as excess precision, not rounded to 20.000', v_col;
    END IF;

    -- 20.001 : correct scale, above the core maximum
    v_ok := false;
    BEGIN
      v_sql := format($f$INSERT INTO public.tennis_series_steps
        (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
         accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
        VALUES (%L, 14, gen_random_uuid(),
                CASE WHEN %L = 'quoted_odds' THEN 20.001 ELSE 3.00 END, 1.00,
                CASE WHEN %L = 'accepted_odds' THEN 20.001 ELSE 3.00 END, 1.00,
                'void', 0, 1, 1, now())$f$, c_series, v_col, v_col);
      EXECUTE v_sql;
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF NOT v_ok THEN RAISE EXCEPTION '% = 20.001 must be rejected (above core maximum)', v_col; END IF;
  END LOOP;

  -- both inclusive endpoints ACCEPTED on both columns, stored exactly
  INSERT INTO public.tennis_series_steps
    (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
     accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
  VALUES (c_series, 14, gen_random_uuid(), 1.010, 1.00, 20.000, 1.00, 'void', 0, 1, 1, now());
  IF NOT EXISTS (SELECT 1 FROM public.tennis_series_steps
                  WHERE series_id=c_series AND step_number=14
                    AND quoted_odds = 1.010 AND accepted_odds = 20.000) THEN
    RAISE EXCEPTION 'odds endpoints 1.010 / 20.000 must be accepted and stored exactly';
  END IF;
  -- and stored WITHOUT reshaping
  IF (SELECT scale(quoted_odds) FROM public.tennis_series_steps
       WHERE series_id=c_series AND step_number=14) <> 3 THEN
    RAISE EXCEPTION 'stored odds scale was altered';
  END IF;
  DELETE FROM public.tennis_series_steps WHERE series_id=c_series AND step_number=14;

  -- ============ MONEY on tennis_series (6 columns) ============
  FOREACH v_col IN ARRAY ARRAY[
    'target_profit','initial_stake','stake_increment','bankroll_limit','maximum_stake','exposure_limit'
  ] LOOP
    -- 0-2 decimals ACCEPTED (baseline: the column under test gets 12.34)
    v_sql := format($f$INSERT INTO public.tennis_series
      (user_id, status, target_profit, initial_stake, stake_increment, currency_or_unit,
       bankroll_limit, maximum_stake, maximum_steps, exposure_limit, formula_version)
      VALUES (%L,'draft',
        CASE WHEN %L='target_profit'   THEN 12.34 ELSE 10 END,
        CASE WHEN %L='initial_stake'   THEN 12.34 ELSE 10 END,
        CASE WHEN %L='stake_increment' THEN 12.34 ELSE 0.01 END, 'USD',
        CASE WHEN %L='bankroll_limit'  THEN 12.34 ELSE 100 END,
        CASE WHEN %L='maximum_stake'   THEN 12.34 ELSE 50 END, 15,
        CASE WHEN %L='exposure_limit'  THEN 12.34 ELSE 100 END, 'v1')$f$,
      c_owner, v_col, v_col, v_col, v_col, v_col, v_col);
    EXECUTE v_sql;

    -- 3 decimals REJECTED (a numeric(12,2) would round 12.345 -> 12.35 (or 12.34))
    v_ok := false;
    BEGIN
      v_sql := format($f$INSERT INTO public.tennis_series
        (user_id, status, target_profit, initial_stake, stake_increment, currency_or_unit,
         bankroll_limit, maximum_stake, maximum_steps, exposure_limit, formula_version)
        VALUES (%L,'draft',
          CASE WHEN %L='target_profit'   THEN 12.345 ELSE 10 END,
          CASE WHEN %L='initial_stake'   THEN 12.345 ELSE 10 END,
          CASE WHEN %L='stake_increment' THEN 12.345 ELSE 0.01 END, 'USD',
          CASE WHEN %L='bankroll_limit'  THEN 12.345 ELSE 100 END,
          CASE WHEN %L='maximum_stake'   THEN 12.345 ELSE 50 END, 15,
          CASE WHEN %L='exposure_limit'  THEN 12.345 ELSE 100 END, 'v1')$f$,
        c_owner, v_col, v_col, v_col, v_col, v_col, v_col);
      EXECUTE v_sql;
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'tennis_series.% = 12.345 must be REJECTED, not rounded to 2 decimals', v_col;
    END IF;

    -- superfluous trailing zero (1.230, scale 3) REJECTED
    v_ok := false;
    BEGIN
      v_sql := format($f$INSERT INTO public.tennis_series
        (user_id, status, target_profit, initial_stake, stake_increment, currency_or_unit,
         bankroll_limit, maximum_stake, maximum_steps, exposure_limit, formula_version)
        VALUES (%L,'draft',
          CASE WHEN %L='target_profit'   THEN 1.230 ELSE 10 END,
          CASE WHEN %L='initial_stake'   THEN 1.230 ELSE 10 END,
          CASE WHEN %L='stake_increment' THEN 1.230 ELSE 0.01 END, 'USD',
          CASE WHEN %L='bankroll_limit'  THEN 1.230 ELSE 100 END,
          CASE WHEN %L='maximum_stake'   THEN 1.230 ELSE 50 END, 15,
          CASE WHEN %L='exposure_limit'  THEN 1.230 ELSE 100 END, 'v1')$f$,
        c_owner, v_col, v_col, v_col, v_col, v_col, v_col);
      EXECUTE v_sql;
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'tennis_series.% = 1.230 must be rejected (trailing-zero precision)', v_col;
    END IF;

    -- just OVER the ceiling with extra precision: a typmod would round it back
    -- INTO range (100000000.004 -> 100000000.00) and store it.
    v_ok := false;
    BEGIN
      v_sql := format($f$INSERT INTO public.tennis_series
        (user_id, status, target_profit, initial_stake, stake_increment, currency_or_unit,
         bankroll_limit, maximum_stake, maximum_steps, exposure_limit, formula_version)
        VALUES (%L,'draft',
          CASE WHEN %L='target_profit'   THEN 100000000.004 ELSE 10 END,
          CASE WHEN %L='initial_stake'   THEN 100000000.004 ELSE 10 END,
          CASE WHEN %L='stake_increment' THEN 100000000.004 ELSE 0.01 END, 'USD',
          CASE WHEN %L='bankroll_limit'  THEN 100000000.004 ELSE 100 END,
          CASE WHEN %L='maximum_stake'   THEN 100000000.004 ELSE 50 END, 15,
          CASE WHEN %L='exposure_limit'  THEN 100000000.004 ELSE 100 END, 'v1')$f$,
        c_owner, v_col, v_col, v_col, v_col, v_col, v_col);
      EXECUTE v_sql;
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF NOT v_ok THEN
      RAISE EXCEPTION
        'tennis_series.% = 100000000.004 must be REJECTED, not rounded inside the ceiling', v_col;
    END IF;
  END LOOP;

  -- nullable money columns still accept NULL
  INSERT INTO public.tennis_series
    (user_id, status, target_profit, initial_stake, stake_increment, currency_or_unit,
     bankroll_limit, maximum_stake, maximum_steps, exposure_limit, formula_version)
  VALUES (c_owner,'draft',10,NULL,0.01,'USD',100,NULL,15,100,'v1');
  IF NOT EXISTS (SELECT 1 FROM public.tennis_series
                  WHERE user_id=c_owner AND initial_stake IS NULL AND maximum_stake IS NULL) THEN
    RAISE EXCEPTION 'nullable money columns must still accept NULL';
  END IF;

  -- ============ MONEY on tennis_series_steps (6 columns) ============
  FOREACH v_col IN ARRAY ARRAY[
    'recommended_stake','accepted_stake','actual_return','loss_before',
    'target_profit_snapshot','projected_series_result'
  ] LOOP
    v_step := v_step + 1;
    -- 3 decimals REJECTED
    v_ok := false;
    BEGIN
      v_sql := format($f$INSERT INTO public.tennis_series_steps
        (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
         accepted_stake, actual_return, status, loss_before, target_profit_snapshot,
         projected_series_result, settled_at)
        VALUES (%L, 14, gen_random_uuid(), 3.00,
          CASE WHEN %L='recommended_stake'       THEN 12.345 ELSE 1.00 END, 3.00,
          CASE WHEN %L='accepted_stake'          THEN 12.345 ELSE 1.00 END,
          CASE WHEN %L='actual_return'           THEN 12.345 ELSE 0.00 END, 'void',
          CASE WHEN %L='loss_before'             THEN 12.345 ELSE 0.00 END,
          CASE WHEN %L='target_profit_snapshot'  THEN 12.345 ELSE 1.00 END,
          CASE WHEN %L='projected_series_result' THEN 12.345 ELSE 1.00 END, now())$f$,
        c_series, v_col, v_col, v_col, v_col, v_col, v_col);
      EXECUTE v_sql;
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'tennis_series_steps.% = 12.345 must be REJECTED, not rounded', v_col;
    END IF;

    -- trailing-zero precision REJECTED
    v_ok := false;
    BEGIN
      v_sql := format($f$INSERT INTO public.tennis_series_steps
        (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
         accepted_stake, actual_return, status, loss_before, target_profit_snapshot,
         projected_series_result, settled_at)
        VALUES (%L, 14, gen_random_uuid(), 3.00,
          CASE WHEN %L='recommended_stake'       THEN 1.230 ELSE 1.00 END, 3.00,
          CASE WHEN %L='accepted_stake'          THEN 1.230 ELSE 1.00 END,
          CASE WHEN %L='actual_return'           THEN 1.230 ELSE 0.00 END, 'void',
          CASE WHEN %L='loss_before'             THEN 1.230 ELSE 0.00 END,
          CASE WHEN %L='target_profit_snapshot'  THEN 1.230 ELSE 1.00 END,
          CASE WHEN %L='projected_series_result' THEN 1.230 ELSE 1.00 END, now())$f$,
        c_series, v_col, v_col, v_col, v_col, v_col, v_col);
      EXECUTE v_sql;
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'tennis_series_steps.% = 1.230 must be rejected (trailing-zero precision)', v_col;
    END IF;

    -- over the ceiling with extra precision that a typmod would round back in
    v_ok := false;
    BEGIN
      v_sql := format($f$INSERT INTO public.tennis_series_steps
        (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
         accepted_stake, actual_return, status, loss_before, target_profit_snapshot,
         projected_series_result, settled_at)
        VALUES (%L, 14, gen_random_uuid(), 3.00,
          CASE WHEN %L='recommended_stake'       THEN 100000000.004 ELSE 1.00 END, 3.00,
          CASE WHEN %L='accepted_stake'          THEN 100000000.004 ELSE 1.00 END,
          CASE WHEN %L='actual_return'           THEN 100000000.004 ELSE 0.00 END, 'void',
          CASE WHEN %L='loss_before'             THEN 100000000.004 ELSE 0.00 END,
          CASE WHEN %L='target_profit_snapshot'  THEN 100000000.004 ELSE 1.00 END,
          CASE WHEN %L='projected_series_result' THEN 100000000.004 ELSE 1.00 END, now())$f$,
        c_series, v_col, v_col, v_col, v_col, v_col, v_col);
      EXECUTE v_sql;
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF NOT v_ok THEN
      RAISE EXCEPTION
        'tennis_series_steps.% = 100000000.004 must be REJECTED, not rounded inside the ceiling', v_col;
    END IF;
  END LOOP;

  -- signed projected_series_result: a NEGATIVE value with excess precision is
  -- rejected too, while a valid negative 2-decimal value is accepted.
  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
    VALUES (c_series, 14, gen_random_uuid(), 3.00, 1.00, 3.00, 1.00, 'void', 0, 1, -12.345, now());
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'negative projected_series_result with 3 decimals must be rejected';
  END IF;

  v_ok := false;
  BEGIN
    INSERT INTO public.tennis_series_steps
      (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
       accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
    VALUES (c_series, 14, gen_random_uuid(), 3.00, 1.00, 3.00, 1.00, 'void', 0, 1, -100000000.004, now());
  EXCEPTION WHEN check_violation THEN v_ok := true; END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'projected_series_result = -100000000.004 must be rejected, not rounded into range';
  END IF;

  INSERT INTO public.tennis_series_steps
    (series_id, step_number, operation_id, quoted_odds, recommended_stake, accepted_odds,
     accepted_stake, status, loss_before, target_profit_snapshot, projected_series_result, settled_at)
  VALUES (c_series, 14, gen_random_uuid(), 3.00, 1.00, 3.00, 1.00, 'void', 0, 1, -46.80, now());
  IF NOT EXISTS (SELECT 1 FROM public.tennis_series_steps
                  WHERE series_id=c_series AND step_number=14 AND projected_series_result = -46.80) THEN
    RAISE EXCEPTION 'a valid negative projected_series_result must be accepted and exact';
  END IF;

  -- actual_return NULL semantics preserved (NULL allowed on an unsettled step)
  SELECT count(*) INTO v_n FROM public.tennis_series_steps
   WHERE series_id=c_series AND status='confirmed' AND actual_return IS NULL;
  IF v_n < 1 THEN RAISE EXCEPTION 'actual_return NULL semantics were lost'; END IF;

  -- leave the fixture as the later steps expect it
  DELETE FROM public.tennis_series_steps WHERE series_id=c_series AND step_number=14;
  DELETE FROM public.tennis_series WHERE user_id=c_owner AND status='draft';
END $$;
SQL

# ── 10. server-generated timestamps ──────────────────────────
step 'timestamps: updated_at is server-maintained on UPDATE'
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE v_before timestamptz; v_after timestamptz;
BEGIN
  SELECT updated_at INTO v_before FROM public.tennis_series
   WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
  PERFORM pg_sleep(0.01);
  UPDATE public.tennis_series SET status='stopped', closed_at=now()
   WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
  SELECT updated_at INTO v_after FROM public.tennis_series
   WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
  IF v_after <= v_before THEN
    RAISE EXCEPTION 'updated_at must advance on UPDATE (before %, after %)', v_before, v_after;
  END IF;
END $$;
SQL

# ── 11. rollback refuses to destroy stored data ──────────────
step 'rollback: refuses while calculator rows exist (fail-closed)'
if "${PSQL[@]}" -f "$ROLLBACK" >/dev/null 2>&1; then
  echo 'FAIL: rollback must refuse to run while rows exist' >&2; exit 1
fi
# the refusal must have changed nothing
"${PSQL[@]}" <<'SQL'
DO $$
BEGIN
  IF to_regclass('public.tennis_series') IS NULL
     OR to_regclass('public.tennis_series_steps') IS NULL THEN
    RAISE EXCEPTION 'refused rollback must leave both tables intact';
  END IF;
  IF (SELECT count(*) FROM public.tennis_series) = 0 THEN
    RAISE EXCEPTION 'refused rollback must leave rows intact';
  END IF;
END $$;
SQL

# ── 12. rollback on an empty schema ──────────────────────────
step 'rollback: succeeds on empty tables and retains shared set_updated_at()'
"${PSQL[@]}" -c 'TRUNCATE public.tennis_series_steps, public.tennis_series;'
"${PSQL[@]}" -f "$ROLLBACK"
"${PSQL[@]}" <<'SQL'
DO $$
BEGIN
  IF to_regclass('public.tennis_series') IS NOT NULL
     OR to_regclass('public.tennis_series_steps') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback left a 026 table behind';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'rollback removed shared set_updated_at()';
  END IF;
  -- a pre-existing trigger user of the shared function must survive
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tennis_series_updated_at') THEN
    RAISE EXCEPTION 'rollback left the 026 trigger behind';
  END IF;
END $$;
SQL

# ── 13. re-apply after rollback ──────────────────────────────
step 're-apply of migration 026 after rollback is clean'
"${PSQL[@]}" -f "$MIGRATION"
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE v_tbl text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['tennis_series','tennis_series_steps'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND c.relname=v_tbl AND c.relrowsecurity) THEN
      RAISE EXCEPTION 're-applied public.% missing or RLS off', v_tbl;
    END IF;
    IF has_table_privilege('authenticated', format('public.%I', v_tbl), 'INSERT') THEN
      RAISE EXCEPTION 're-applied public.% must still have no write surface', v_tbl;
    END IF;
  END LOOP;
END $$;
SQL

echo
echo 'migration 026 verification: ALL CHECKS PASSED'
