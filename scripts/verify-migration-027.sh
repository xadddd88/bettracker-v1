#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_026="$ROOT_DIR/026_tennis_live_series_calculator.sql"
MIGRATION_027="$ROOT_DIR/027_tennis_live_series_write_path.sql"
ROLLBACK_027="$ROOT_DIR/tennis-pr4-rollback.sql"
DATABASE_URL="${1:-}"

if [[ -z "$DATABASE_URL" ]]; then
  echo "usage: $0 postgresql://.../disposable_database" >&2
  exit 2
fi

case "$DATABASE_URL" in
  postgresql://*@127.0.0.1:*/*|postgresql://*@localhost:*/*) ;;
  *)
    echo "REFUSED: verifier accepts only a disposable localhost PostgreSQL URL" >&2
    exit 2
    ;;
esac

for required in "$MIGRATION_026" "$MIGRATION_027" "$ROLLBACK_027"; do
  [[ -f "$required" ]] || { echo "missing required file: $required" >&2; exit 2; }
done

pass() {
  printf '[%02d/15] %s — PASS\n' "$1" "$2"
}

# 01 — static safety boundary
if grep -Eiq 'SECURITY[[:space:]]+DEFINER' "$MIGRATION_027"; then
  echo "migration 027 must not contain SECURITY DEFINER" >&2
  exit 1
fi
if grep -Eiq '(INSERT[[:space:]]+INTO|UPDATE|DELETE[[:space:]]+FROM)[[:space:]]+public\.(bets|bet_legs|bankrolls|bankroll_transactions|decisions)\b' "$MIGRATION_027"; then
  echo "migration 027 touches an existing financial/domain table" >&2
  exit 1
fi
pass 1 "static safety scan"

# 02 — disposable fixture
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
SQL
pass 2 "bootstrap disposable roles and auth fixture"

# 03 — apply PR-3 schema
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION_026" >/dev/null
pass 3 "apply migration 026 prerequisite"

# 04 — clean apply PR-4
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION_027" >/dev/null
pass 4 "apply migration 027"

# 05 — catalog: four RPCs, invoker, empty search_path
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('tennis_create_series','tennis_confirm_step','tennis_settle_step','tennis_stop_series')
     AND NOT p.prosecdef
     AND array_to_string(p.proconfig, ',') IN ('search_path=','search_path=""');
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'expected four SECURITY INVOKER RPCs with empty search_path, found %', v_count;
  END IF;
END
$$;
SQL
pass 5 "four SECURITY INVOKER RPCs and search_path hygiene"

# 06 — EXECUTE boundary and normalized minimum table ACL
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE
  v_fn regprocedure;
  v_tbl text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.tennis_create_series(uuid,uuid,numeric,numeric,numeric,text,numeric,numeric,integer,numeric,text,text)'::regprocedure,
    'public.tennis_confirm_step(uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric)'::regprocedure,
    'public.tennis_settle_step(uuid,uuid,uuid,uuid,integer,text,numeric)'::regprocedure,
    'public.tennis_stop_series(uuid,uuid,uuid,integer)'::regprocedure
  ] LOOP
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE')
       OR has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'invalid function ACL for %', v_fn;
    END IF;
  END LOOP;

  FOREACH v_tbl IN ARRAY ARRAY['tennis_series','tennis_series_steps','tennis_series_commands'] LOOP
    IF NOT has_table_privilege('service_role', format('public.%I',v_tbl), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I',v_tbl), 'INSERT')
       OR NOT has_table_privilege('service_role', format('public.%I',v_tbl), 'UPDATE')
       OR has_table_privilege('service_role', format('public.%I',v_tbl), 'DELETE')
       OR has_table_privilege('service_role', format('public.%I',v_tbl), 'TRUNCATE') THEN
      RAISE EXCEPTION 'invalid service_role ACL for %', v_tbl;
    END IF;
  END LOOP;

  IF has_table_privilege('anon','public.tennis_series_commands','SELECT')
     OR has_table_privilege('authenticated','public.tennis_series_commands','SELECT')
     OR has_table_privilege('authenticated','public.tennis_series','INSERT')
     OR has_table_privilege('authenticated','public.tennis_series_steps','UPDATE') THEN
    RAISE EXCEPTION 'client boundary widened';
  END IF;
END
$$;
SQL
pass 6 "service-role-only RPC and minimum table ACL"

# Seed two users once. The fixed UUIDs keep every assertion deterministic.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO auth.users(id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002');
SQL

# 07 — create command
SERIES_ID="$(
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At <<'SQL'
SET ROLE service_role;
SELECT public.tennis_create_series(
  '10000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  46.80, 20.00, 0.01, 'USD', 5000.00, 500.00, 15, 5000.00,
  'v1', 'disposable gate'
)->>'series_id';
RESET ROLE;
SQL
)"
[[ "$SERIES_ID" =~ ^[0-9a-f-]{36}$ ]] || { echo "invalid series id returned" >&2; exit 1; }
pass 7 "create series atomically"

# 08 — create replay and payload-bound conflict
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v series_id="$SERIES_ID" <<'SQL' >/dev/null
SET ROLE service_role;
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.tennis_create_series(
    '10000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    46.80, 20.00, 0.01, 'USD', 5000.00, 500.00, 15, 5000.00,
    'v1', 'disposable gate'
  );
  IF v_result->>'replayed' <> 'true' THEN RAISE EXCEPTION 'create replay not marked'; END IF;

  BEGIN
    PERFORM public.tennis_create_series(
      '10000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001',
      47.80, 20.00, 0.01, 'USD', 5000.00, 500.00, 15, 5000.00,
      'v1', 'disposable gate'
    );
    RAISE EXCEPTION 'expected idempotency conflict';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'idempotency_conflict' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE;
SQL
pass 8 "create idempotent replay and payload conflict"

# 09 — confirm one step and optimistic version increment
STEP_ID="$(
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v series_id="$SERIES_ID" -At <<'SQL'
SET ROLE service_role;
SELECT public.tennis_confirm_step(
  '10000000-0000-4000-8000-000000000001',
  :'series_id',
  'a0000000-0000-4000-8000-000000000002',
  0, 1, 1, 3.34, 20.00, 3.34, 20.00, 0.00, 46.80, 46.80
)->>'step_id';
RESET ROLE;
SQL
)"
[[ "$STEP_ID" =~ ^[0-9a-f-]{36}$ ]] || { echo "invalid step id returned" >&2; exit 1; }
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v series_id="$SERIES_ID" -v step_id="$STEP_ID" <<'SQL' >/dev/null
SELECT set_config('gate.series_id', :'series_id', false);
SELECT set_config('gate.step_id', :'step_id', false);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tennis_series
     WHERE id=current_setting('gate.series_id')::uuid AND status='active' AND version=1
  ) OR NOT EXISTS (
    SELECT 1 FROM public.tennis_series_steps
     WHERE id=current_setting('gate.step_id')::uuid AND status='confirmed' AND step_number=1
  ) THEN
    RAISE EXCEPTION 'confirm state mismatch';
  END IF;
END
$$;
SQL
pass 9 "confirm step, row state and version"

# 10 — confirm replay, version conflict, one-pending invariant
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v series_id="$SERIES_ID" <<'SQL' >/dev/null
SET ROLE service_role;
SELECT set_config('gate.series_id', :'series_id', false);
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.tennis_confirm_step(
    '10000000-0000-4000-8000-000000000001',
    current_setting('gate.series_id')::uuid,
    'a0000000-0000-4000-8000-000000000002',
    0, 1, 1, 3.34, 20.00, 3.34, 20.00, 0.00, 46.80, 46.80
  );
  IF v_result->>'replayed' <> 'true' THEN RAISE EXCEPTION 'confirm replay not marked'; END IF;

  BEGIN
    PERFORM public.tennis_confirm_step(
      '10000000-0000-4000-8000-000000000001',
      current_setting('gate.series_id')::uuid,
      'a0000000-0000-4000-8000-000000000003',
      0, 1, 2, 3.05, 32.59, 3.05, 32.59, 20.00, 46.80, 46.80
    );
    RAISE EXCEPTION 'expected version conflict';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'version_conflict' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.tennis_confirm_step(
      '10000000-0000-4000-8000-000000000001',
      current_setting('gate.series_id')::uuid,
      'a0000000-0000-4000-8000-000000000009',
      1, 1, 2, 3.05, 32.59, 3.05, 32.59, 20.00, 46.80, 46.80
    );
    RAISE EXCEPTION 'expected one-pending unique refusal';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$$;
RESET ROLE;
SQL
pass 10 "confirm replay, version conflict and one-pending guard"

# 11 — settle the pending step
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v series_id="$SERIES_ID" -v step_id="$STEP_ID" <<'SQL' >/dev/null
SET ROLE service_role;
SELECT set_config('gate.series_id', :'series_id', false);
SELECT set_config('gate.step_id', :'step_id', false);
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.tennis_settle_step(
    '10000000-0000-4000-8000-000000000001',
    current_setting('gate.series_id')::uuid,
    current_setting('gate.step_id')::uuid,
    'a0000000-0000-4000-8000-000000000004',
    1, 'lost', NULL
  );
  IF v_result->>'version' <> '2' OR v_result->>'step_status' <> 'lost' THEN
    RAISE EXCEPTION 'settlement result mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tennis_series_steps
     WHERE id=current_setting('gate.step_id')::uuid
       AND status='lost' AND settled_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'settled row mismatch'; END IF;
END
$$;
RESET ROLE;
SQL
pass 11 "settle step atomically"

# 12 — stop command and its replay
SECOND_SERIES_ID="$(
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At <<'SQL'
SET ROLE service_role;
SELECT public.tennis_create_series(
  '10000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000005',
  10.00, 5.00, 0.01, 'USD', 500.00, 50.00, 15, 500.00,
  'v1', NULL
)->>'series_id';
RESET ROLE;
SQL
)"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v series_id="$SECOND_SERIES_ID" <<'SQL' >/dev/null
SET ROLE service_role;
SELECT set_config('gate.series_id', :'series_id', false);
DO $$
DECLARE
  v_first jsonb;
  v_replay jsonb;
BEGIN
  v_first := public.tennis_stop_series(
    '10000000-0000-4000-8000-000000000001',
    current_setting('gate.series_id')::uuid,
    'a0000000-0000-4000-8000-000000000006',
    0
  );
  v_replay := public.tennis_stop_series(
    '10000000-0000-4000-8000-000000000001',
    current_setting('gate.series_id')::uuid,
    'a0000000-0000-4000-8000-000000000006',
    0
  );
  IF v_first->>'status' <> 'stopped' OR v_first->>'version' <> '1'
     OR v_replay->>'replayed' <> 'true' THEN
    RAISE EXCEPTION 'stop result mismatch';
  END IF;
END
$$;
RESET ROLE;
SQL
pass 12 "manual stop and replay"

# 13 — explicit cross-user isolation at the trusted RPC boundary
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v series_id="$SERIES_ID" <<'SQL' >/dev/null
SET ROLE service_role;
SELECT set_config('gate.series_id', :'series_id', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.tennis_stop_series(
      '20000000-0000-4000-8000-000000000002',
      current_setting('gate.series_id')::uuid,
      'a0000000-0000-4000-8000-000000000007',
      2
    );
    RAISE EXCEPTION 'expected cross-user refusal';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'series_not_found' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE;
SQL
pass 13 "cross-user command refusal"

# 14 — clients still cannot mutate or read the command ledger
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.tennis_series_commands(
      user_id, operation_id, command_name, payload_hash, result_json
    ) VALUES (
      '10000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000008',
      'stop_series',
      '00000000000000000000000000000000',
      '{}'::jsonb
    );
    RAISE EXCEPTION 'expected client write refusal';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;
SQL
pass 14 "authenticated direct-write boundary"

# 15 — rollback must refuse data, then succeed after disposable cleanup
if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROLLBACK_027" >/dev/null 2>&1; then
  echo "rollback unexpectedly accepted a non-empty command ledger" >&2
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DELETE FROM public.tennis_series;
SQL
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROLLBACK_027" >/dev/null
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF to_regclass('public.tennis_series_commands') IS NOT NULL
     OR to_regprocedure('public.tennis_create_series(uuid,uuid,numeric,numeric,numeric,text,numeric,numeric,integer,numeric,text,text)') IS NOT NULL
     OR to_regprocedure('public.tennis_confirm_step(uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric)') IS NOT NULL
     OR to_regprocedure('public.tennis_settle_step(uuid,uuid,uuid,uuid,integer,text,numeric)') IS NOT NULL
     OR to_regprocedure('public.tennis_stop_series(uuid,uuid,uuid,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback left PR-4 objects behind';
  END IF;
  IF has_table_privilege('service_role','public.tennis_series','INSERT')
     OR has_table_privilege('service_role','public.tennis_series_steps','UPDATE') THEN
    RAISE EXCEPTION 'rollback left service_role write ACL behind';
  END IF;
END
$$;
SQL
pass 15 "guarded rollback and ACL restoration"

echo "migration 027 verification: ALL CHECKS PASSED"
