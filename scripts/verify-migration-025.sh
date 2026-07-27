#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_025="$ROOT_DIR/supabase/migrations/025_tracked_leg_fixture_lineage.sql"
ROLLBACK_025="$ROOT_DIR/docs/decision-064-rollback.sql"
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

for required in "$MIGRATION_025" "$ROLLBACK_025"; do
  [[ -f "$required" ]] || { echo "missing required file: $required" >&2; exit 2; }
done

pass() {
  printf '[%02d/16] %s — PASS\n' "$1" "$2"
}

expect_failure() {
  local description="$1"
  local sql="$2"
  if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "$sql" >/dev/null 2>&1; then
    echo "$description unexpectedly succeeded" >&2
    exit 1
  fi
}

grep -Eq "SET LOCAL lock_timeout[[:space:]]*=" "$MIGRATION_025"
grep -Eq "SET LOCAL statement_timeout[[:space:]]*=" "$MIGRATION_025"
if grep -Eq "TO[[:space:]]+authenticated([,;[:space:]]|$)" "$MIGRATION_025"; then
  echo "migration 025 must not grant create_tracked_bet_v2 to authenticated" >&2
  exit 1
fi
pass 1 "static lock and initial ACL boundary"

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

CREATE TABLE auth.users (
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

CREATE TABLE public.bankrolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  balance numeric NOT NULL,
  is_default boolean NOT NULL DEFAULT false
);

CREATE TABLE public.canonical_fixtures (
  id uuid PRIMARY KEY,
  sport text NOT NULL,
  kickoff_at timestamptz NOT NULL
);

CREATE TABLE public.fixture_provider_links (
  id uuid PRIMARY KEY,
  canonical_fixture_id uuid NOT NULL REFERENCES public.canonical_fixtures(id),
  provider text NOT NULL,
  provider_fixture_id text NOT NULL,
  mapping_confidence text NOT NULL,
  mapping_method text
);

CREATE TABLE public.bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bankroll_id uuid NOT NULL REFERENCES public.bankrolls(id),
  bet_type text NOT NULL,
  stake numeric NOT NULL,
  total_odds numeric NOT NULL,
  potential_payout numeric NOT NULL,
  status text NOT NULL,
  bookmaker text,
  source text NOT NULL,
  notes text
);

CREATE TABLE public.bet_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id uuid NOT NULL REFERENCES public.bets(id) ON DELETE CASCADE,
  sport text NOT NULL,
  event_name text NOT NULL,
  market_type text NOT NULL,
  selection text,
  odds numeric NOT NULL,
  leg_status text NOT NULL,
  leg_index integer NOT NULL
);

CREATE TABLE public.bankroll_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bankroll_id uuid NOT NULL REFERENCES public.bankrolls(id),
  bet_id uuid REFERENCES public.bets(id),
  type text NOT NULL,
  amount numeric NOT NULL,
  balance_after numeric NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL
);
CREATE UNIQUE INDEX bankroll_transactions_user_idempotency_key
  ON public.bankroll_transactions(user_id, lower(idempotency_key));

CREATE OR REPLACE FUNCTION public.create_tracked_bet(
  p_marker text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
AS $$ SELECT 'legacy-v1:' || COALESCE(p_marker, '') $$;
SQL
pass 2 "bootstrap disposable production-shape fixture"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION_025" >/dev/null
pass 3 "apply migration 025 to disposable PostgreSQL 17"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE
  v_v2 regprocedure :=
    'public.create_tracked_bet_v2(jsonb,numeric,numeric,text,text,text,text)'::regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_v2 AND prosecdef) THEN
    RAISE EXCEPTION 'v2 must remain SECURITY DEFINER';
  END IF;
  IF NOT has_function_privilege('service_role',v_v2,'EXECUTE')
     OR has_function_privilege('authenticated',v_v2,'EXECUTE')
     OR has_function_privilege('anon',v_v2,'EXECUTE') THEN
    RAISE EXCEPTION 'v2 initial ACL mismatch';
  END IF;
  IF public.create_tracked_bet('probe') IS DISTINCT FROM 'legacy-v1:probe' THEN
    RAISE EXCEPTION 'legacy v1 function changed';
  END IF;
END
$$;
SQL
pass 4 "service-only v2 ACL and v1 compatibility"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO auth.users(id) VALUES ('10000000-0000-4000-8000-000000000001');
INSERT INTO public.bankrolls(id,user_id,balance,is_default) VALUES
  ('11000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001',10000,true);
INSERT INTO public.bets(
  id,user_id,bankroll_id,bet_type,stake,total_odds,potential_payout,status,source
) VALUES (
  '12000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'single',1,2,2,'pending','manual'
);
INSERT INTO public.bet_legs(
  bet_id,sport,event_name,market_type,selection,odds,leg_status,leg_index
) VALUES (
  '12000000-0000-4000-8000-000000000001',
  'soccer','Legacy event','winner','home',2,'pending',1
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bet_legs
    WHERE event_name='Legacy event'
      AND lineage_state='unresolved'
      AND lineage_source='legacy'
      AND lineage_contract_version=0
      AND canonical_fixture_id IS NULL
      AND fixture_provider_link_id IS NULL
  ) THEN
    RAISE EXCEPTION 'legacy defaults mismatch';
  END IF;
END
$$;
SQL
pass 5 "legacy and future v1 row defaults"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO public.canonical_fixtures(id,sport,kickoff_at) VALUES
  ('20000000-0000-4000-8000-000000000001','football','2026-08-01 12:00:00+00'),
  ('20000000-0000-4000-8000-000000000002','tennis','2026-08-01 14:00:00+00'),
  ('20000000-0000-4000-8000-000000000003','tennis','2026-08-01 16:00:00+00');
INSERT INTO public.fixture_provider_links(
  id,canonical_fixture_id,provider,provider_fixture_id,mapping_confidence,mapping_method
) VALUES
  ('30000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001','sportmonks','sm-1','exact','provider-id'),
  ('30000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000002','sportradar','sr-2','high','manual-review'),
  ('30000000-0000-4000-8000-000000000003',
   '20000000-0000-4000-8000-000000000003','sportradar','sr-3','exact','provider-id');
SQL

EXACT_RESULT="$(
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At <<'SQL'
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
SET ROLE service_role;
SELECT public.create_tracked_bet_v2(
  p_legs => '[{
    "sport":"soccer","event_name":"Exact single","market_type":"winner",
    "selection":"home","odds":2.1,
    "lineage":{
      "contractVersion":1,"source":"fixture_picker_exact",
      "canonicalFixtureId":"20000000-0000-4000-8000-000000000001",
      "fixtureProviderLinkId":"30000000-0000-4000-8000-000000000001"
    }
  }]'::jsonb,
  p_stake => 100,
  p_source => 'manual',
  p_idempotency_key => '40000000-0000-4000-8000-000000000001'
)::text;
RESET ROLE;
SQL
)"
printf '%s' "$EXACT_RESULT" | grep -q '"replayed": false'

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bet_legs
    WHERE event_name='Exact single'
      AND lineage_state='verified'
      AND lineage_source='fixture_picker_exact'
      AND lineage_contract_version=1
      AND fixture_provider='sportmonks'
      AND provider_fixture_id='sm-1'
      AND fixture_kickoff_at_snapshot='2026-08-01 12:00:00+00'
      AND fixture_timezone='UTC'
      AND mapping_confidence_snapshot='exact'
      AND mapping_method_snapshot='provider-id'
      AND lineage_verified_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'exact snapshot mismatch';
  END IF;
END
$$;
SQL
pass 6 "exact single and server-derived snapshot"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
UPDATE public.fixture_provider_links
SET provider='changed-provider', provider_fixture_id='changed-id'
WHERE id='30000000-0000-4000-8000-000000000001';
SQL
REPLAY_RESULT="$(
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At <<'SQL'
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
SET ROLE service_role;
SELECT public.create_tracked_bet_v2(
  p_legs => '[{
    "sport":"soccer","event_name":"Exact single","market_type":"winner",
    "selection":"home","odds":2.1,
    "lineage":{
      "contractVersion":1,"source":"fixture_picker_exact",
      "canonicalFixtureId":"20000000-0000-4000-8000-000000000001",
      "fixtureProviderLinkId":"30000000-0000-4000-8000-000000000001"
    }
  }]'::jsonb,
  p_stake => 100,
  p_source => 'manual',
  p_idempotency_key => '40000000-0000-4000-8000-000000000001'
)::text;
RESET ROLE;
SQL
)"
printf '%s' "$REPLAY_RESULT" | grep -q '"replayed": true'
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF (SELECT count(*) FROM public.bankroll_transactions) <> 1
     OR (SELECT balance FROM public.bankrolls WHERE is_default) <> 9900
     OR NOT EXISTS (
       SELECT 1 FROM public.bet_legs
       WHERE event_name='Exact single'
         AND fixture_provider='sportmonks'
         AND provider_fixture_id='sm-1'
     ) THEN
    RAISE EXCEPTION 'replay changed financial or stored snapshot state';
  END IF;
END
$$;
SQL
pass 7 "idempotent replay with immutable original snapshot"

expect_failure "idempotency conflict" "
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
SET ROLE service_role;
SELECT public.create_tracked_bet_v2(
  p_legs => '[{
    \"sport\":\"soccer\",\"event_name\":\"Exact single\",\"market_type\":\"winner\",
    \"selection\":\"home\",\"odds\":2.2,
    \"lineage\":{\"contractVersion\":1,\"source\":\"fixture_picker_exact\",
      \"canonicalFixtureId\":\"20000000-0000-4000-8000-000000000001\",
      \"fixtureProviderLinkId\":\"30000000-0000-4000-8000-000000000001\"}
  }]'::jsonb,
  p_stake => 100,p_source => 'manual',
  p_idempotency_key => '40000000-0000-4000-8000-000000000001'
);"
pass 8 "conflicting replay fails before additional debit"

expect_failure "cross-fixture tuple" "
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
SET ROLE service_role;
SELECT public.create_tracked_bet_v2(
  p_legs => '[{\"sport\":\"soccer\",\"event_name\":\"Cross fixture\",\"market_type\":\"winner\",\"odds\":2,
    \"lineage\":{\"contractVersion\":1,\"source\":\"fixture_picker_exact\",
      \"canonicalFixtureId\":\"20000000-0000-4000-8000-000000000001\",
      \"fixtureProviderLinkId\":\"30000000-0000-4000-8000-000000000003\"}}]'::jsonb,
  p_stake => 10,p_source => 'manual',
  p_idempotency_key => '40000000-0000-4000-8000-000000000002'
);"

expect_failure "non-exact mapping" "
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
SET ROLE service_role;
SELECT public.create_tracked_bet_v2(
  p_legs => '[{\"sport\":\"tennis\",\"event_name\":\"High mapping\",\"market_type\":\"winner\",\"odds\":2,
    \"lineage\":{\"contractVersion\":1,\"source\":\"fixture_picker_exact\",
      \"canonicalFixtureId\":\"20000000-0000-4000-8000-000000000002\",
      \"fixtureProviderLinkId\":\"30000000-0000-4000-8000-000000000002\"}}]'::jsonb,
  p_stake => 10,p_source => 'manual',
  p_idempotency_key => '40000000-0000-4000-8000-000000000003'
);"

expect_failure "sport mismatch" "
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
SET ROLE service_role;
SELECT public.create_tracked_bet_v2(
  p_legs => '[{\"sport\":\"soccer\",\"event_name\":\"Sport mismatch\",\"market_type\":\"winner\",\"odds\":2,
    \"lineage\":{\"contractVersion\":1,\"source\":\"fixture_picker_exact\",
      \"canonicalFixtureId\":\"20000000-0000-4000-8000-000000000003\",
      \"fixtureProviderLinkId\":\"30000000-0000-4000-8000-000000000003\"}}]'::jsonb,
  p_stake => 10,p_source => 'manual',
  p_idempotency_key => '40000000-0000-4000-8000-000000000004'
);"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF (SELECT count(*) FROM public.bankroll_transactions) <> 1
     OR (SELECT balance FROM public.bankrolls WHERE is_default) <> 9900 THEN
    RAISE EXCEPTION 'rejected lineage changed financial state';
  END IF;
END
$$;
SQL
pass 9 "cross-fixture, non-exact and sport mismatch fail closed"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
SET ROLE service_role;
SELECT public.create_tracked_bet_v2(
  p_legs => '[{
    "sport":"other","event_name":"Manual unresolved","market_type":"winner","odds":2,
    "lineage":{"contractVersion":1,"source":"manual_unresolved",
      "canonicalFixtureId":null,"fixtureProviderLinkId":null}
  }]'::jsonb,
  p_stake => 10,p_source => 'manual',
  p_idempotency_key => '40000000-0000-4000-8000-000000000005'
);
SELECT public.create_tracked_bet_v2(
  p_legs => '[{
    "sport":"other","event_name":"Manual review","market_type":"winner","odds":2,
    "lineage":{"contractVersion":1,"source":"manual_candidate_review",
      "canonicalFixtureId":null,"fixtureProviderLinkId":null}
  }]'::jsonb,
  p_stake => 10,p_source => 'manual',
  p_idempotency_key => '40000000-0000-4000-8000-000000000006'
);
RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bet_legs
    WHERE event_name='Manual unresolved' AND lineage_state='unresolved'
      AND lineage_contract_version=1
  ) OR NOT EXISTS (
    SELECT 1 FROM public.bet_legs
    WHERE event_name='Manual review' AND lineage_state='needs_review'
      AND lineage_contract_version=1
  ) THEN
    RAISE EXCEPTION 'unresolved/review shape mismatch';
  END IF;
END
$$;
SQL
pass 10 "unresolved and needs-review version-1 shapes"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
SET ROLE service_role;
SELECT public.create_tracked_bet_v2(
  p_legs => '[
    {"sport":"other","event_name":"Express 2 A","market_type":"winner","odds":2,
     "lineage":{"contractVersion":1,"source":"manual_unresolved","canonicalFixtureId":null,"fixtureProviderLinkId":null}},
    {"sport":"other","event_name":"Express 2 B","market_type":"winner","odds":2,
     "lineage":{"contractVersion":1,"source":"manual_unresolved","canonicalFixtureId":null,"fixtureProviderLinkId":null}}
  ]'::jsonb,
  p_total_odds => 4,p_stake => 10,p_source => 'manual',
  p_idempotency_key => '40000000-0000-4000-8000-000000000007'
);
SELECT public.create_tracked_bet_v2(
  p_legs => (
    SELECT jsonb_agg(jsonb_build_object(
      'sport','other','event_name','Express 20 ' || n,
      'market_type','winner','odds',2,
      'lineage',jsonb_build_object(
        'contractVersion',1,'source','manual_unresolved',
        'canonicalFixtureId',NULL,'fixtureProviderLinkId',NULL
      )
    ) ORDER BY n)
    FROM generate_series(1,20) AS n
  ),
  p_total_odds => 100,p_stake => 10,p_source => 'manual',
  p_idempotency_key => '40000000-0000-4000-8000-000000000008'
);
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.bet_legs WHERE event_name LIKE 'Express 2 %') <> 2
     OR (SELECT count(*) FROM public.bet_legs WHERE event_name LIKE 'Express 20 %') <> 20 THEN
    RAISE EXCEPTION 'express leg count mismatch';
  END IF;
END
$$;
SQL
pass 11 "2-leg and 20-leg express boundaries"

expect_failure "lineage mutation" "
UPDATE public.bet_legs
SET lineage_source='scanner_unresolved'
WHERE event_name='Manual unresolved';"

expect_failure "canonical fixture delete" "
DELETE FROM public.canonical_fixtures
WHERE id='20000000-0000-4000-8000-000000000001';"

expect_failure "provider link delete" "
DELETE FROM public.fixture_provider_links
WHERE id='30000000-0000-4000-8000-000000000001';"
pass 12 "immutable lineage and ON DELETE RESTRICT"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF (SELECT count(*) FROM public.bankroll_transactions) <> 5
     OR (SELECT balance FROM public.bankrolls WHERE is_default) <> 9860 THEN
    RAISE EXCEPTION 'unexpected final financial state';
  END IF;
END
$$;
SQL
pass 13 "successful calls debit exactly once"

if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROLLBACK_025" >/dev/null 2>&1; then
  echo "rollback unexpectedly removed active version-1 lineage" >&2
  exit 1
fi
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF to_regprocedure(
    'public.create_tracked_bet_v2(jsonb,numeric,numeric,text,text,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'failed rollback did not preserve v2';
  END IF;
END
$$;
SQL
pass 14 "rollback refuses after version-1 lineage"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
TRUNCATE public.bet_legs CASCADE;
SQL
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROLLBACK_025" >/dev/null
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF to_regprocedure(
    'public.create_tracked_bet_v2(jsonb,numeric,numeric,text,text,text,text)'
  ) IS NOT NULL OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bet_legs'
      AND column_name='lineage_contract_version'
  ) THEN
    RAISE EXCEPTION 'clean rollback left lineage objects';
  END IF;
  IF public.create_tracked_bet('after-rollback')
     IS DISTINCT FROM 'legacy-v1:after-rollback' THEN
    RAISE EXCEPTION 'clean rollback changed v1 function';
  END IF;
END
$$;
SQL
pass 15 "clean rollback before lineage use"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROLLBACK_025" >/dev/null
pass 16 "clean rollback is idempotent"

echo "migration 025 verification: ALL CHECKS PASSED"
