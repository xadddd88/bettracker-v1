#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEDGER_MIGRATION="$ROOT_DIR/supabase/migrations/20260728162034_decision_056_execution_ledger.sql"
QUARANTINE_MIGRATION="$ROOT_DIR/supabase/migrations/20260806154618_quarantine_place_bet_from_decision.sql"
BASELINE="$ROOT_DIR/docs/security/supabase-advisor-baseline.v1.json"
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

for required in "$LEDGER_MIGRATION" "$QUARANTINE_MIGRATION" "$BASELINE"; do
  [[ -f "$required" ]] || {
    echo "missing required file: $required" >&2
    exit 2
  }
done

pass() {
  printf '[%02d/09] %s — PASS\n' "$1" "$2"
}

grep -Fq '"schemaVersion": 1' "$BASELINE"
grep -Fq '"0029_authenticated_security_definer_function_executable": 8' "$BASELINE"
grep -Fq '"0008_rls_enabled_no_policy": 1' "$BASELINE"
grep -Fq 'rls_enabled_no_policy_public_decision_056_execution_ledger' "$BASELINE"
grep -Fq '"signature": "public.place_bet_from_decision(uuid,uuid,numeric,text,text)"' "$BASELINE"
pass 1 "versioned baseline and negative control are present"

SERVER_VERSION_NUM="$(psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -c 'SHOW server_version_num')"
if (( SERVER_VERSION_NUM < 170000 || SERVER_VERSION_NUM >= 180000 )); then
  echo "PostgreSQL 17 required, server_version_num=$SERVER_VERSION_NUM" >&2
  exit 1
fi
pass 2 "PostgreSQL 17 disposable server"

# This verifier is deliberately chained after verify-migration-031.sh. Its
# marker and the authenticated pre-quarantine RPC prove the predecessor ran.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF to_regprocedure('public.post031_default_function()') IS NULL THEN
    RAISE EXCEPTION 'run scripts/verify-migration-031.sh first';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.place_bet_from_decision(uuid,uuid,numeric,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'pre-quarantine Decision #067 fixture mismatch';
  END IF;
END
$$;
SQL
pass 3 "Decision #067 predecessor and pre-quarantine boundary"

# Decision #067 uses compact unnamed stubs because it tests privilege changes.
# Replace only those disposable stubs with named-argument equivalents so
# pg_get_function_identity_arguments and Advisor cache_key generation match the
# reviewed production catalog. No repository migration is changed here.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DROP FUNCTION public.adjust_bankroll(text,numeric,text,text);
DROP FUNCTION public.cancel_pending_bet(uuid,text);
DROP FUNCTION public.complete_onboarding();
DROP FUNCTION public.create_quick_bet(uuid,text,text,text,text,numeric,numeric,text,text);
DROP FUNCTION public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text);
DROP FUNCTION public.place_bet_from_decision(uuid,uuid,numeric,text,text);
DROP FUNCTION public.save_user_settings(text,text,numeric,numeric,boolean,text);
DROP FUNCTION public.set_user_currency(text);
DROP FUNCTION public.settle_bet(uuid,text);
DROP FUNCTION public.update_decision_action(uuid,text);
DROP FUNCTION public.update_opportunity_status(uuid,text,uuid);

CREATE FUNCTION public.adjust_bankroll(
  p_type text,
  p_amount numeric,
  p_note text,
  p_idempotency_key text
) RETURNS text LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp AS 'SELECT ''ok''::text';

CREATE FUNCTION public.cancel_pending_bet(
  p_bet_id uuid,
  p_idempotency_key text
) RETURNS text LANGUAGE sql SECURITY DEFINER
SET search_path = '' AS 'SELECT ''ok''::text';

CREATE FUNCTION public.complete_onboarding()
RETURNS text LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp AS 'SELECT ''ok''::text';

CREATE FUNCTION public.create_tracked_bet(
  p_legs jsonb,
  p_total_odds numeric,
  p_stake numeric,
  p_bookmaker text,
  p_notes text,
  p_source text,
  p_idempotency_key text
) RETURNS text LANGUAGE sql SECURITY DEFINER
SET search_path = '' AS 'SELECT ''ok''::text';

CREATE FUNCTION public.place_bet_from_decision(
  p_decision_id uuid,
  p_bankroll_id uuid,
  p_stake numeric,
  p_bookmaker text,
  p_notes text
) RETURNS text LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp AS 'SELECT ''server-only-ok''::text';

CREATE FUNCTION public.save_user_settings(
  p_display_name text,
  p_currency text,
  p_default_stake numeric,
  p_kelly_fraction numeric,
  p_web_search_enabled boolean,
  p_timezone text
) RETURNS text LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp AS 'SELECT ''ok''::text';

CREATE FUNCTION public.settle_bet(
  p_bet_id uuid,
  p_outcome text
) RETURNS text LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp AS 'SELECT ''ok''::text';

CREATE FUNCTION public.update_decision_action(
  p_decision_id uuid,
  p_final_action text
) RETURNS text LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp AS 'SELECT ''ok''::text';

CREATE FUNCTION public.update_opportunity_status(
  p_opportunity_id uuid,
  p_status text,
  p_linked_decision_id uuid
) RETURNS text LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp AS 'SELECT ''ok''::text';

GRANT EXECUTE ON FUNCTION
  public.adjust_bankroll(text,numeric,text,text),
  public.cancel_pending_bet(uuid,text),
  public.complete_onboarding(),
  public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text),
  public.place_bet_from_decision(uuid,uuid,numeric,text,text),
  public.save_user_settings(text,text,numeric,numeric,boolean,text),
  public.settle_bet(uuid,text),
  public.update_decision_action(uuid,text),
  public.update_opportunity_status(uuid,text,uuid)
TO authenticated, service_role;
SQL
pass 4 "named-argument production-shape fixture"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$LEDGER_MIGRATION" >/dev/null
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$QUARANTINE_MIGRATION" >/dev/null
pass 5 "ledger and quarantine migrations on disposable database"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE
  expected record;
  actual record;
  expected_config text[];
  expected_cache_key text;
  raw_acl_count integer;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('adjust_bankroll','public.adjust_bankroll(text,numeric,text,text)','p_type text, p_amount numeric, p_note text, p_idempotency_key text','public, pg_temp'),
      ('cancel_pending_bet','public.cancel_pending_bet(uuid,text)','p_bet_id uuid, p_idempotency_key text',''),
      ('complete_onboarding','public.complete_onboarding()','','public, pg_temp'),
      ('create_tracked_bet','public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)','p_legs jsonb, p_total_odds numeric, p_stake numeric, p_bookmaker text, p_notes text, p_source text, p_idempotency_key text',''),
      ('save_user_settings','public.save_user_settings(text,text,numeric,numeric,boolean,text)','p_display_name text, p_currency text, p_default_stake numeric, p_kelly_fraction numeric, p_web_search_enabled boolean, p_timezone text','public, pg_temp'),
      ('settle_bet','public.settle_bet(uuid,text)','p_bet_id uuid, p_outcome text','public, pg_temp'),
      ('update_decision_action','public.update_decision_action(uuid,text)','p_decision_id uuid, p_final_action text','public, pg_temp'),
      ('update_opportunity_status','public.update_opportunity_status(uuid,text,uuid)','p_opportunity_id uuid, p_status text, p_linked_decision_id uuid','public, pg_temp')
    ) AS e(function_name,signature,identity_arguments,search_path)
  LOOP
    IF (
      SELECT count(*)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=expected.function_name
    ) <> 1 THEN
      RAISE EXCEPTION 'overload count mismatch for %', expected.function_name;
    END IF;

    SELECT
      pg_get_userbyid(p.proowner) AS owner_name,
      p.prosecdef,
      p.proconfig,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,
      p.oid,
      p.proowner
    INTO STRICT actual
    FROM pg_proc p
    WHERE p.oid=expected.signature::regprocedure;

    expected_config := CASE
      WHEN expected.search_path='' THEN ARRAY['search_path=""']
      ELSE ARRAY['search_path=' || expected.search_path]
    END;
    IF actual.owner_name <> 'postgres'
       OR NOT actual.prosecdef
       OR actual.proconfig IS DISTINCT FROM expected_config
       OR actual.identity_arguments <> expected.identity_arguments THEN
      RAISE EXCEPTION
        'catalog mismatch for %: owner=%, definer=%, config=%, args=%',
        expected.signature,
        actual.owner_name,
        actual.prosecdef,
        actual.proconfig,
        actual.identity_arguments;
    END IF;

    SELECT count(*) INTO raw_acl_count
    FROM aclexplode(COALESCE(
      (SELECT proacl FROM pg_proc WHERE oid=actual.oid),
      acldefault('f',actual.proowner)
    )) acl
    WHERE acl.privilege_type='EXECUTE';

    IF raw_acl_count <> 3 OR EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(
        (SELECT proacl FROM pg_proc WHERE oid=actual.oid),
        acldefault('f',actual.proowner)
      )) acl
      WHERE acl.privilege_type <> 'EXECUTE'
         OR acl.grantor <> actual.proowner
         OR acl.grantee NOT IN (
           actual.proowner,
           (SELECT oid FROM pg_roles WHERE rolname='authenticated'),
           (SELECT oid FROM pg_roles WHERE rolname='service_role')
         )
    ) THEN
      RAISE EXCEPTION 'raw ACL mismatch for %', expected.signature;
    END IF;

    IF has_function_privilege('anon',actual.oid,'EXECUTE')
       OR NOT has_function_privilege('authenticated',actual.oid,'EXECUTE')
       OR NOT has_function_privilege('service_role',actual.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'effective ACL mismatch for %', expected.signature;
    END IF;

    expected_cache_key := format(
      'authenticated_security_definer_function_executable_public_%s_%s',
      expected.function_name,
      expected.identity_arguments
    );
    IF expected_cache_key NOT IN (
      'authenticated_security_definer_function_executable_public_adjust_bankroll_p_type text, p_amount numeric, p_note text, p_idempotency_key text',
      'authenticated_security_definer_function_executable_public_cancel_pending_bet_p_bet_id uuid, p_idempotency_key text',
      'authenticated_security_definer_function_executable_public_complete_onboarding_',
      'authenticated_security_definer_function_executable_public_create_tracked_bet_p_legs jsonb, p_total_odds numeric, p_stake numeric, p_bookmaker text, p_notes text, p_source text, p_idempotency_key text',
      'authenticated_security_definer_function_executable_public_save_user_settings_p_display_name text, p_currency text, p_default_stake numeric, p_kelly_fraction numeric, p_web_search_enabled boolean, p_timezone text',
      'authenticated_security_definer_function_executable_public_settle_bet_p_bet_id uuid, p_outcome text',
      'authenticated_security_definer_function_executable_public_update_decision_action_p_decision_id uuid, p_final_action text',
      'authenticated_security_definer_function_executable_public_update_opportunity_status_p_opportunity_id uuid, p_status text, p_linked_decision_id uuid'
    ) THEN
      RAISE EXCEPTION 'Advisor cache_key mismatch: %', expected_cache_key;
    END IF;
  END LOOP;
END
$$;
SQL
pass 6 "eight exact signatures, owners, search paths, ACLs and cache keys"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE
  rpc regprocedure :=
    'public.place_bet_from_decision(uuid,uuid,numeric,text,text)'::regprocedure;
  owner_oid oid := (SELECT proowner FROM pg_proc WHERE oid=rpc);
  raw_acl_count integer;
BEGIN
  IF (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='place_bet_from_decision'
  ) <> 1 THEN
    RAISE EXCEPTION 'place_bet_from_decision overload count mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid=rpc
      AND pg_get_userbyid(p.proowner)='postgres'
      AND p.prosecdef
      AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=public, pg_temp']
      AND pg_get_function_identity_arguments(p.oid)=
        'p_decision_id uuid, p_bankroll_id uuid, p_stake numeric, p_bookmaker text, p_notes text'
  ) THEN
    RAISE EXCEPTION 'place_bet_from_decision catalog mismatch';
  END IF;

  SELECT count(*) INTO raw_acl_count
  FROM aclexplode(COALESCE(
    (SELECT proacl FROM pg_proc WHERE oid=rpc),
    acldefault('f',owner_oid)
  )) acl
  WHERE acl.privilege_type='EXECUTE';

  IF raw_acl_count <> 2
     OR has_function_privilege('anon',rpc,'EXECUTE')
     OR has_function_privilege('authenticated',rpc,'EXECUTE')
     OR NOT has_function_privilege('service_role',rpc,'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM aclexplode(COALESCE(
         (SELECT proacl FROM pg_proc WHERE oid=rpc),
         acldefault('f',owner_oid)
       )) acl
       WHERE acl.privilege_type <> 'EXECUTE'
          OR acl.grantor <> owner_oid
          OR acl.grantee NOT IN (
            owner_oid,
            (SELECT oid FROM pg_roles WHERE rolname='service_role')
          )
     ) THEN
    RAISE EXCEPTION 'place_bet_from_decision is not service-only';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prosecdef
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) <> 8 THEN
    RAISE EXCEPTION 'expected exactly eight authenticated SECURITY DEFINER RPCs';
  END IF;
END
$$;
SQL
pass 7 "service-only quarantine and exactly eight accepted RPCs"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE
  table_oid oid := 'public.decision_056_execution_ledger'::regclass;
  owner_oid oid := (SELECT relowner FROM pg_class WHERE oid=table_oid);
BEGIN
  IF NOT (
    SELECT relrowsecurity AND pg_get_userbyid(relowner)='postgres'
    FROM pg_class
    WHERE oid=table_oid
  ) THEN
    RAISE EXCEPTION 'ledger owner/RLS mismatch';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid=table_oid) <> 0 THEN
    RAISE EXCEPTION 'ledger policy count mismatch';
  END IF;
  IF has_table_privilege('anon',table_oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('authenticated',table_oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR NOT has_table_privilege('service_role',table_oid,'INSERT')
     OR has_table_privilege('service_role',table_oid,'SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'ledger effective ACL mismatch';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM aclexplode(COALESCE(
      (SELECT relacl FROM pg_class WHERE oid=table_oid),
      acldefault('r',owner_oid)
    )) acl
    WHERE acl.grantee IN (
      0,
      (SELECT oid FROM pg_roles WHERE rolname='anon'),
      (SELECT oid FROM pg_roles WHERE rolname='authenticated')
    )
  ) OR EXISTS (
    SELECT 1
    FROM aclexplode(COALESCE(
      (SELECT relacl FROM pg_class WHERE oid=table_oid),
      acldefault('r',owner_oid)
    )) acl
    WHERE acl.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role')
      AND acl.privilege_type <> 'INSERT'
  ) THEN
    RAISE EXCEPTION 'ledger raw ACL mismatch';
  END IF;
END
$$;
SQL
pass 8 "ledger RLS, zero-policy and INSERT-only service contract"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prosecdef
      AND (
        has_function_privilege('anon',p.oid,'EXECUTE')
        OR EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
          WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
        )
      )
  ) THEN
    RAISE EXCEPTION 'PUBLIC/anon can execute a public SECURITY DEFINER function';
  END IF;
END
$$;
SQL
pass 9 "no PUBLIC or anon SECURITY DEFINER execution"

echo "Supabase Advisor Slice S1 baseline passed on disposable PostgreSQL 17."
