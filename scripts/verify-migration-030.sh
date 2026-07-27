#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_030="$ROOT_DIR/supabase/migrations/030_odds_snapshots_public_security_invoker.sql"
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

[[ -f "$MIGRATION_030" ]] || {
  echo "missing required file: $MIGRATION_030" >&2
  exit 2
}

pass() {
  printf '[%02d/12] %s — PASS\n' "$1" "$2"
}

expect_failure() {
  local description="$1"
  local sql="$2"
  if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "$sql" >/dev/null 2>&1; then
    echo "$description unexpectedly succeeded" >&2
    exit 1
  fi
}

grep -Eq "SET LOCAL lock_timeout[[:space:]]*=" "$MIGRATION_030"
grep -Eq "SET LOCAL statement_timeout[[:space:]]*=" "$MIGRATION_030"
grep -Eq "security_invoker[[:space:]]*=[[:space:]]*true" "$MIGRATION_030"
if grep -Eq "GRANT[[:space:]]+SELECT[[:space:]]+ON([[:space:]]+TABLE)?[[:space:]]+public\.odds_snapshots[[:space:]]+TO" "$MIGRATION_030"; then
  echo "migration 030 must not grant table-wide SELECT on odds_snapshots" >&2
  exit 1
fi
pass 1 "static timeout, invoker and no broad base-table SELECT boundary"

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

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE public.odds_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_fixture_id uuid NOT NULL,
  provider text NOT NULL,
  market_catalog_id uuid,
  raw_market_name text NOT NULL,
  selection text NOT NULL,
  line numeric,
  price numeric NOT NULL CHECK (price > 1),
  bookmaker text,
  raw_provider_payload jsonb,
  provider_updated_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  sync_run_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.odds_snapshots ENABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON TABLE public.odds_snapshots TO service_role;

CREATE VIEW public.odds_snapshots_public AS
SELECT
  id,
  canonical_fixture_id,
  market_catalog_id,
  selection,
  line,
  price,
  bookmaker,
  ingested_at,
  provider_updated_at
FROM public.odds_snapshots;

REVOKE ALL PRIVILEGES ON TABLE public.odds_snapshots_public
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.odds_snapshots_public TO authenticated;

INSERT INTO public.odds_snapshots (
  id,
  canonical_fixture_id,
  provider,
  market_catalog_id,
  raw_market_name,
  selection,
  line,
  price,
  bookmaker,
  raw_provider_payload,
  provider_updated_at,
  ingested_at,
  sync_run_id
) VALUES (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'api_football',
  '30000000-0000-4000-8000-000000000001',
  'Asian Handicap Internal',
  'home',
  -0.5,
  1.95,
  'Verifier Book',
  '{"secret":"must-not-leak"}',
  '2026-07-27 06:00:00+00',
  '2026-07-27 06:01:00+00',
  'internal-sync-1'
);
SQL
pass 2 "bootstrap disposable pre-030 production shape"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid='public.odds_snapshots_public'::regclass
      AND COALESCE(reloptions @> ARRAY['security_invoker=true'], false)
  ) THEN
    RAISE EXCEPTION 'precondition requires the legacy security-definer view';
  END IF;
  IF NOT has_table_privilege('authenticated','public.odds_snapshots_public','SELECT')
     OR has_table_privilege('anon','public.odds_snapshots_public','SELECT') THEN
    RAISE EXCEPTION 'legacy view ACL fixture mismatch';
  END IF;
END
$$;
SQL
pass 3 "legacy security-definer precondition"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION_030" >/dev/null
pass 4 "apply migration 030 to disposable PostgreSQL 17"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid='public.odds_snapshots_public'::regclass
      AND relkind='v'
      AND COALESCE(reloptions @> ARRAY['security_invoker=true'], false)
  ) THEN
    RAISE EXCEPTION 'security_invoker reloption missing';
  END IF;
END
$$;
SQL
pass 5 "view catalog is security-invoker"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE
  v_authenticated oid := (SELECT oid FROM pg_roles WHERE rolname='authenticated');
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid='public.odds_snapshots'::regclass
      AND polname='odds_snapshots_authenticated_read'
      AND polcmd='r'
      AND polroles=ARRAY[v_authenticated]
      AND pg_get_expr(polqual,polrelid)='true'
      AND polwithcheck IS NULL
  ) THEN
    RAISE EXCEPTION 'authenticated read policy mismatch';
  END IF;
END
$$;
SQL
pass 6 "RLS policy is SELECT-only and authenticated-only"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE
  v_column text;
  v_safe text[] := ARRAY[
    'id','canonical_fixture_id','market_catalog_id','selection','line',
    'price','bookmaker','ingested_at','provider_updated_at'
  ];
  v_sensitive text[] := ARRAY[
    'provider','raw_market_name','raw_provider_payload','sync_run_id','created_at'
  ];
BEGIN
  IF has_table_privilege('authenticated','public.odds_snapshots','SELECT') THEN
    RAISE EXCEPTION 'authenticated has broad base-table SELECT';
  END IF;
  FOREACH v_column IN ARRAY v_safe LOOP
    IF NOT has_column_privilege(
      'authenticated',
      'public.odds_snapshots',
      v_column,
      'SELECT'
    ) THEN
      RAISE EXCEPTION 'missing safe column grant: %', v_column;
    END IF;
  END LOOP;
  FOREACH v_column IN ARRAY v_sensitive LOOP
    IF has_column_privilege(
      'authenticated',
      'public.odds_snapshots',
      v_column,
      'SELECT'
    ) THEN
      RAISE EXCEPTION 'sensitive column is readable: %', v_column;
    END IF;
  END LOOP;
  IF has_any_column_privilege('anon','public.odds_snapshots','SELECT') THEN
    RAISE EXCEPTION 'anon has a base-table column grant';
  END IF;
END
$$;
SQL
pass 7 "base table exposes exactly nine safe columns"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF NOT has_table_privilege('authenticated','public.odds_snapshots_public','SELECT')
     OR has_table_privilege('anon','public.odds_snapshots_public','SELECT')
     OR has_table_privilege('authenticated','public.odds_snapshots_public','INSERT')
     OR has_table_privilege('authenticated','public.odds_snapshots_public','UPDATE')
     OR has_table_privilege('authenticated','public.odds_snapshots_public','DELETE')
     OR EXISTS (
       SELECT 1
       FROM pg_class AS c
       CROSS JOIN LATERAL aclexplode(
         COALESCE(c.relacl,acldefault('r',c.relowner))
       ) AS acl
       WHERE c.oid='public.odds_snapshots_public'::regclass
         AND acl.grantee=0
         AND acl.privilege_type='SELECT'
     ) THEN
    RAISE EXCEPTION 'curated view ACL mismatch';
  END IF;
END
$$;
SQL
pass 8 "view is authenticated SELECT-only"

AUTH_COUNT="$(
  psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At <<'SQL'
SET ROLE authenticated;
SELECT count(*) FROM public.odds_snapshots_public;
SELECT count(*) FROM public.odds_snapshots
WHERE id='10000000-0000-4000-8000-000000000001'
  AND price=1.95;
RESET ROLE;
SQL
)"
[[ "$AUTH_COUNT" == $'1\n1' ]]
pass 9 "authenticated reads the curated view and safe base projection"

for sensitive_column in \
  provider raw_market_name raw_provider_payload sync_run_id created_at
do
  expect_failure \
    "authenticated sensitive read: $sensitive_column" \
    "SET ROLE authenticated; SELECT $sensitive_column FROM public.odds_snapshots LIMIT 1;"
done
pass 10 "provider payload and internal metadata fail closed"

expect_failure \
  "anon curated view read" \
  "SET ROLE anon; SELECT * FROM public.odds_snapshots_public LIMIT 1;"
expect_failure \
  "authenticated curated view update" \
  "SET ROLE authenticated; UPDATE public.odds_snapshots_public SET price=2 WHERE true;"
expect_failure \
  "authenticated base insert" \
  "SET ROLE authenticated; INSERT INTO public.odds_snapshots(id) VALUES (gen_random_uuid());"
expect_failure \
  "authenticated base delete" \
  "SET ROLE authenticated; DELETE FROM public.odds_snapshots WHERE true;"
pass 11 "anon and every authenticated DML path fail closed"

SERVICE_COUNT="$(
  psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At <<'SQL'
SET ROLE service_role;
SELECT count(*) FROM public.odds_snapshots
WHERE provider='api_football'
  AND raw_market_name='Asian Handicap Internal'
  AND raw_provider_payload->>'secret'='must-not-leak'
  AND sync_run_id='internal-sync-1';
RESET ROLE;
SQL
)"
[[ "$SERVICE_COUNT" == "1" ]]
pass 12 "service-role internal access remains intact"

echo "Decision #066 migration 030 verifier passed on disposable PostgreSQL."
