#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_026="$ROOT_DIR/supabase/migrations/026_tennis_live_series_calculator.sql"
MIGRATION_027="$ROOT_DIR/supabase/migrations/027_tennis_live_series_write_path.sql"
MIGRATION_028="$ROOT_DIR/supabase/migrations/028_tennis_series_authoritative_confirm.sql"
ROLLBACK_028="$ROOT_DIR/docs/tennis-pr4-authority-rollback.sql"
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

for required in "$MIGRATION_026" "$MIGRATION_027" "$MIGRATION_028" "$ROLLBACK_028"; do
  [[ -f "$required" ]] || { echo "missing required file: $required" >&2; exit 2; }
done

pass() {
  printf '[%02d/14] %s — PASS\n' "$1" "$2"
}

if grep -Eiq 'SECURITY[[:space:]]+DEFINER' "$MIGRATION_028"; then
  echo "migration 028 must not contain SECURITY DEFINER" >&2
  exit 1
fi
if grep -Eiq '(INSERT[[:space:]]+INTO|UPDATE|DELETE[[:space:]]+FROM)[[:space:]]+public\.(bets|bet_legs|bankrolls|bankroll_transactions|decisions)\b' "$MIGRATION_028"; then
  echo "migration 028 touches an existing financial/domain table" >&2
  exit 1
fi
pass 1 "static safety boundary"

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

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION_026" >/dev/null
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION_027" >/dev/null
pass 3 "apply migrations 026 and 027 prerequisites"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION_028" >/dev/null
pass 4 "apply migration 028"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE
  v_new regprocedure :=
    'public.tennis_confirm_step(uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric)'::regprocedure;
BEGIN
  IF to_regprocedure(
    'public.tennis_confirm_step(uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'legacy confirm signature remains';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_new AND prosecdef) THEN
    RAISE EXCEPTION 'replacement confirm must be SECURITY INVOKER';
  END IF;
  IF NOT has_function_privilege('service_role',v_new,'EXECUTE')
     OR has_function_privilege('authenticated',v_new,'EXECUTE')
     OR has_function_privilege('anon',v_new,'EXECUTE') THEN
    RAISE EXCEPTION 'replacement confirm ACL mismatch';
  END IF;
END
$$;
SQL
pass 5 "replacement signature and service-only ACL"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO auth.users(id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002');
SQL

SERIES_ID="$(
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At <<'SQL'
SET ROLE service_role;
SELECT public.tennis_create_series(
  '10000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  38.00, 20.00, 0.01, 'USD', 5000.00, 500.00, 15, 5000.00,
  'v1', 'authority gate'
)->>'series_id';
RESET ROLE;
SQL
)"
[[ "$SERIES_ID" =~ ^[0-9a-f-]{36}$ ]] || { echo "invalid series id returned" >&2; exit 1; }
pass 6 "create isolated series"

FIRST_RESULT="$(
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At -v series_id="$SERIES_ID" <<'SQL'
SET ROLE service_role;
SELECT public.tennis_confirm_step(
  '10000000-0000-4000-8000-000000000001',
  :'series_id',
  'a0000000-0000-4000-8000-000000000002',
  0, 1, 1, 2.90, 2.90, 20.00
)::text;
RESET ROLE;
SQL
)"
printf '%s' "$FIRST_RESULT" | grep -q '"recommended_stake": "20.00"'
printf '%s' "$FIRST_RESULT" | grep -q '"loss_before": "0"'
printf '%s' "$FIRST_RESULT" | grep -q '"projected_series_result": "38.00"'
FIRST_STEP_ID="$(printf '%s' "$FIRST_RESULT" | sed -n 's/.*"step_id": "\([^"]*\)".*/\1/p')"
[[ "$FIRST_STEP_ID" =~ ^[0-9a-f-]{36}$ ]] || { echo "invalid first step id" >&2; exit 1; }
pass 7 "derive first recommendation and projection"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v series_id="$SERIES_ID" -v step_id="$FIRST_STEP_ID" <<'SQL' >/dev/null
SET ROLE service_role;
SELECT public.tennis_settle_step(
  '10000000-0000-4000-8000-000000000001',
  :'series_id', :'step_id',
  'a0000000-0000-4000-8000-000000000003',
  1, 'lost', NULL
);
RESET ROLE;
SQL
pass 8 "settle first step as authoritative loss"

SECOND_RESULT="$(
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At -v series_id="$SERIES_ID" <<'SQL'
SET ROLE service_role;
SELECT public.tennis_confirm_step(
  '10000000-0000-4000-8000-000000000001',
  :'series_id',
  'a0000000-0000-4000-8000-000000000004',
  2, 1, 2, 3.18, 2.96, 26.61
)::text;
RESET ROLE;
SQL
)"
printf '%s' "$SECOND_RESULT" | grep -q '"recommended_stake": "26.61"'
printf '%s' "$SECOND_RESULT" | grep -q '"loss_before": "20.00"'
printf '%s' "$SECOND_RESULT" | grep -q '"target_profit_snapshot": "38.00"'
printf '%s' "$SECOND_RESULT" | grep -q '"projected_series_result": "32.15"'
pass 9 "derive loss, recommendation and accepted projection"

if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v series_id="$SERIES_ID" <<'SQL' >/dev/null 2>&1
SET ROLE service_role;
SELECT public.tennis_confirm_step(
  '10000000-0000-4000-8000-000000000001',
  :'series_id',
  'a0000000-0000-4000-8000-000000000005',
  3, 1, 3, 3.18, 26.61, 3.18, 26.61, 0.00, 38.00, 38.00
);
RESET ROLE;
SQL
then
  echo "legacy client-derived signature unexpectedly remains callable" >&2
  exit 1
fi
pass 10 "legacy tampered payload is not callable"

LIMIT_SERIES_ID="$(
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At <<'SQL'
SET ROLE service_role;
SELECT public.tennis_create_series(
  '10000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  38.00, 20.00, 0.01, 'USD', 50.00, 100.00, 15, 100.00,
  'v1', 'remaining bank gate'
)->>'series_id';
RESET ROLE;
SQL
)"
LIMIT_STEP_ID="$(
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At -v series_id="$LIMIT_SERIES_ID" <<'SQL'
SET ROLE service_role;
SELECT public.tennis_confirm_step(
  '10000000-0000-4000-8000-000000000001',
  :'series_id',
  'b0000000-0000-4000-8000-000000000002',
  0, 1, 1, 2.90, 2.90, 20.00
)->>'step_id';
RESET ROLE;
SQL
)"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v series_id="$LIMIT_SERIES_ID" -v step_id="$LIMIT_STEP_ID" <<'SQL' >/dev/null
SET ROLE service_role;
SELECT public.tennis_settle_step(
  '10000000-0000-4000-8000-000000000001',
  :'series_id', :'step_id',
  'b0000000-0000-4000-8000-000000000003',
  1, 'lost', NULL
);
RESET ROLE;
SQL
if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v series_id="$LIMIT_SERIES_ID" <<'SQL' >/dev/null 2>&1
SET ROLE service_role;
SELECT public.tennis_confirm_step(
  '10000000-0000-4000-8000-000000000001',
  :'series_id',
  'b0000000-0000-4000-8000-000000000004',
  2, 1, 2, 2.90, 2.90, 30.00
);
RESET ROLE;
SQL
then
  echo "recommended stake bypassed remaining bankroll" >&2
  exit 1
fi
pass 11 "required stake cannot bypass remaining bankroll"

ACCEPTED_LIMIT_SERIES_ID="$(
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At <<'SQL'
SET ROLE service_role;
SELECT public.tennis_create_series(
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  38.00, 20.00, 0.01, 'USD', 500.00, 500.00, 15, 30.00,
  'v1', 'accepted exposure gate'
)->>'series_id';
RESET ROLE;
SQL
)"
if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v series_id="$ACCEPTED_LIMIT_SERIES_ID" <<'SQL' >/dev/null 2>&1
SET ROLE service_role;
SELECT public.tennis_confirm_step(
  '10000000-0000-4000-8000-000000000001',
  :'series_id',
  'c0000000-0000-4000-8000-000000000002',
  0, 1, 1, 2.90, 2.90, 31.00
);
RESET ROLE;
SQL
then
  echo "accepted stake bypassed exposure limit" >&2
  exit 1
fi
pass 12 "accepted stake cannot bypass exposure limit"

REPLAY="$(
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At -v series_id="$SERIES_ID" <<'SQL'
SET ROLE service_role;
SELECT public.tennis_confirm_step(
  '10000000-0000-4000-8000-000000000001',
  :'series_id',
  'a0000000-0000-4000-8000-000000000004',
  2, 1, 2, 3.18, 2.96, 26.61
)->>'replayed';
RESET ROLE;
SQL
)"
[[ "$REPLAY" == "true" ]] || { echo "authoritative confirm replay was not idempotent" >&2; exit 1; }

if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v series_id="$SERIES_ID" <<'SQL' >/dev/null 2>&1
SET ROLE service_role;
SELECT public.tennis_confirm_step(
  '10000000-0000-4000-8000-000000000001',
  :'series_id',
  'a0000000-0000-4000-8000-000000000004',
  2, 1, 2, 3.18, 2.96, 26.62
);
RESET ROLE;
SQL
then
  echo "same operation id accepted a conflicting payload" >&2
  exit 1
fi
pass 13 "payload-bound idempotency preserved"

if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION_028" >/dev/null 2>&1; then
  echo "migration 028 unexpectedly accepted non-empty command history" >&2
  exit 1
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DELETE FROM public.tennis_series;
SQL
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROLLBACK_028" >/dev/null
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF to_regprocedure(
    'public.tennis_confirm_step(uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric)'
  ) IS NOT NULL OR to_regprocedure(
    'public.tennis_confirm_step(uuid,uuid,uuid,integer,integer,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'rollback left a confirm write path callable';
  END IF;
END
$$;
SQL
pass 14 "upgrade guard and fail-closed rollback"

echo "migration 028 verification: ALL CHECKS PASSED"
