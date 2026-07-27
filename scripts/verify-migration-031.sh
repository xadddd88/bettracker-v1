#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_031="$ROOT_DIR/supabase/migrations/031_public_api_privilege_hardening.sql"
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

[[ -f "$MIGRATION_031" ]] || {
  echo "missing required file: $MIGRATION_031" >&2
  exit 2
}

pass() {
  printf '[%02d/12] %s — PASS\n' "$1" "$2"
}

grep -Eq "SET LOCAL lock_timeout[[:space:]]*=" "$MIGRATION_031"
grep -Eq "SET LOCAL statement_timeout[[:space:]]*=" "$MIGRATION_031"
grep -Eq "REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC" "$MIGRATION_031"
if grep -Eiq "GRANT[[:space:]]+.*(anon|authenticated)" "$MIGRATION_031"; then
  echo "migration 031 must not grant client privileges" >&2
  exit 1
fi
pass 1 "static timeout and no-new-client-grant boundary"

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

REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Reproduce the production Supabase defaults owned by postgres.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE public.api_rate_limits (id integer PRIMARY KEY);
CREATE TABLE public.beta_access (id integer PRIMARY KEY);
CREATE TABLE public.fixture_provider_links (id integer PRIMARY KEY);
CREATE TABLE public.fixture_results (id integer PRIMARY KEY);
CREATE TABLE public.football_enrichment (id integer PRIMARY KEY);
CREATE TABLE public.fp001_pricing_quarantine (id integer PRIMARY KEY);
CREATE TABLE public.tennis_series_commands (id integer PRIMARY KEY);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixture_provider_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixture_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.football_enrichment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp001_pricing_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tennis_series_commands ENABLE ROW LEVEL SECURITY;

INSERT INTO public.api_rate_limits VALUES (1);
INSERT INTO public.beta_access VALUES (1);
INSERT INTO public.fixture_provider_links VALUES (1);
INSERT INTO public.fixture_results VALUES (1);
INSERT INTO public.football_enrichment VALUES (1);
INSERT INTO public.fp001_pricing_quarantine VALUES (1);
INSERT INTO public.tennis_series_commands VALUES (1);

-- Three production tables were already service-only before Decision #067.
REVOKE ALL PRIVILEGES ON TABLE
  public.api_rate_limits,
  public.fp001_pricing_quarantine,
  public.tennis_series_commands
FROM PUBLIC, anon, authenticated;

CREATE TABLE public.security_path_probe (marker text NOT NULL);
INSERT INTO public.security_path_probe VALUES ('trusted-public');
REVOKE ALL PRIVILEGES ON TABLE public.security_path_probe
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.adjust_bankroll(text, numeric, text, text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS 'SELECT marker FROM security_path_probe LIMIT 1';

CREATE FUNCTION public.cancel_pending_bet(uuid, text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS 'SELECT ''ok''::text';

CREATE FUNCTION public.complete_onboarding()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public
AS 'SELECT ''ok''::text';

CREATE FUNCTION public.create_quick_bet(
  uuid, text, text, text, text, numeric, numeric, text, text
) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public
AS 'SELECT ''ok''::text';

CREATE FUNCTION public.create_tracked_bet(
  jsonb, numeric, numeric, text, text, text, text
) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS 'SELECT ''ok''::text';

CREATE FUNCTION public.place_bet_from_decision(
  uuid, uuid, numeric, text, text
) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public
AS 'SELECT ''ok''::text';

CREATE FUNCTION public.save_user_settings(
  text, text, numeric, numeric, boolean, text
) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public
AS 'SELECT ''ok''::text';

CREATE FUNCTION public.set_user_currency(text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public
AS 'SELECT ''ok''::text';

CREATE FUNCTION public.settle_bet(uuid, text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public
AS 'SELECT ''ok''::text';

CREATE FUNCTION public.update_decision_action(uuid, text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public
AS 'SELECT ''ok''::text';

CREATE FUNCTION public.update_opportunity_status(uuid, text, uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public
AS 'SELECT ''ok''::text';

REVOKE ALL PRIVILEGES ON FUNCTION
  public.adjust_bankroll(text, numeric, text, text),
  public.cancel_pending_bet(uuid, text),
  public.complete_onboarding(),
  public.create_quick_bet(uuid, text, text, text, text, numeric, numeric, text, text),
  public.create_tracked_bet(jsonb, numeric, numeric, text, text, text, text),
  public.place_bet_from_decision(uuid, uuid, numeric, text, text),
  public.save_user_settings(text, text, numeric, numeric, boolean, text),
  public.set_user_currency(text),
  public.settle_bet(uuid, text),
  public.update_decision_action(uuid, text),
  public.update_opportunity_status(uuid, text, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.adjust_bankroll(text, numeric, text, text),
  public.cancel_pending_bet(uuid, text),
  public.complete_onboarding(),
  public.create_quick_bet(uuid, text, text, text, text, numeric, numeric, text, text),
  public.create_tracked_bet(jsonb, numeric, numeric, text, text, text, text),
  public.place_bet_from_decision(uuid, uuid, numeric, text, text),
  public.save_user_settings(text, text, numeric, numeric, boolean, text),
  public.set_user_currency(text),
  public.settle_bet(uuid, text),
  public.update_decision_action(uuid, text),
  public.update_opportunity_status(uuid, text, uuid)
TO authenticated, service_role;
SQL
pass 2 "bootstrap disposable pre-031 production shape"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE
  v_table regclass;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.beta_access'::regclass,
    'public.fixture_provider_links'::regclass,
    'public.fixture_results'::regclass,
    'public.football_enrichment'::regclass
  ] LOOP
    IF NOT has_table_privilege('anon',v_table,'SELECT')
       OR NOT has_table_privilege('authenticated',v_table,'SELECT') THEN
      RAISE EXCEPTION 'expected inherited client grants on %', v_table;
    END IF;
  END LOOP;

  IF NOT has_function_privilege(
    'authenticated',
    'public.create_quick_bet(uuid,text,text,text,text,numeric,numeric,text,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.set_user_currency(text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'retired RPC precondition mismatch';
  END IF;
END
$$;

CREATE TABLE public.pre031_default_table (id integer);
CREATE FUNCTION public.pre031_default_function()
RETURNS integer LANGUAGE sql AS 'SELECT 1';

DO $$
BEGIN
  IF NOT has_table_privilege(
    'authenticated','public.pre031_default_table','SELECT'
  ) OR NOT has_function_privilege(
    'authenticated','public.pre031_default_function()','EXECUTE'
  ) THEN
    RAISE EXCEPTION 'broad default privilege precondition mismatch';
  END IF;
END
$$;

DROP FUNCTION public.pre031_default_function();
DROP TABLE public.pre031_default_table;
SQL
pass 3 "legacy client ACL, RPC and default-privilege preconditions"

PRE_HIJACK="$(
  psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At <<'SQL'
SET ROLE authenticated;
CREATE TEMP TABLE security_path_probe (marker text NOT NULL);
INSERT INTO security_path_probe VALUES ('attacker-temp');
SELECT public.adjust_bankroll(NULL, NULL, NULL, NULL);
RESET ROLE;
SQL
)"
[[ "$PRE_HIJACK" == "attacker-temp" ]]
pass 4 "legacy search_path permits pg_temp shadowing"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION_031" >/dev/null
pass 5 "apply migration 031 to disposable PostgreSQL 17"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE
  v_table regclass;
  v_policy text;
  v_anon oid := (SELECT oid FROM pg_roles WHERE rolname='anon');
  v_authenticated oid := (
    SELECT oid FROM pg_roles WHERE rolname='authenticated'
  );
BEGIN
  FOR v_table, v_policy IN
    SELECT *
    FROM (VALUES
      ('public.api_rate_limits'::regclass,'api_rate_limits_client_deny_all'),
      ('public.beta_access'::regclass,'beta_access_client_deny_all'),
      ('public.fixture_provider_links'::regclass,'fixture_provider_links_client_deny_all'),
      ('public.fixture_results'::regclass,'fixture_results_client_deny_all'),
      ('public.football_enrichment'::regclass,'football_enrichment_client_deny_all'),
      ('public.fp001_pricing_quarantine'::regclass,'fp001_pricing_quarantine_client_deny_all'),
      ('public.tennis_series_commands'::regclass,'tennis_series_commands_client_deny_all')
    ) AS expected(table_oid,policy_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policy
      WHERE polrelid=v_table
        AND polname=v_policy
        AND NOT polpermissive
        AND polcmd='*'
        AND polroles @> ARRAY[v_anon,v_authenticated]
        AND polroles <@ ARRAY[v_anon,v_authenticated]
        AND pg_get_expr(polqual,polrelid)='false'
        AND pg_get_expr(polwithcheck,polrelid)='false'
    ) THEN
      RAISE EXCEPTION 'explicit deny policy mismatch on %', v_table;
    END IF;
  END LOOP;
END
$$;
SQL
pass 6 "seven exact restrictive client-deny policies"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE
  v_table regclass;
  v_role oid;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.api_rate_limits'::regclass,
    'public.beta_access'::regclass,
    'public.fixture_provider_links'::regclass,
    'public.fixture_results'::regclass,
    'public.football_enrichment'::regclass,
    'public.fp001_pricing_quarantine'::regclass,
    'public.tennis_series_commands'::regclass
  ] LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class AS c
      CROSS JOIN LATERAL aclexplode(
        COALESCE(c.relacl,acldefault('r',c.relowner))
      ) AS acl
      WHERE c.oid=v_table
        AND acl.grantee IN (
          0,
          (SELECT oid FROM pg_roles WHERE rolname='anon'),
          (SELECT oid FROM pg_roles WHERE rolname='authenticated')
        )
    ) THEN
      RAISE EXCEPTION 'client table ACL remains on %', v_table;
    END IF;
    IF NOT has_table_privilege('service_role',v_table,'SELECT') THEN
      RAISE EXCEPTION 'service_role SELECT lost on %', v_table;
    END IF;
  END LOOP;
END
$$;
SQL
pass 7 "client table ACLs removed and service_role preserved"

DENIED_COUNT="$(
  psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At <<'SQL'
GRANT SELECT ON TABLE
  public.api_rate_limits,
  public.beta_access,
  public.fixture_provider_links,
  public.fixture_results,
  public.football_enrichment,
  public.fp001_pricing_quarantine,
  public.tennis_series_commands
TO authenticated;
SET ROLE authenticated;
SELECT
  (SELECT count(*) FROM public.api_rate_limits)
  + (SELECT count(*) FROM public.beta_access)
  + (SELECT count(*) FROM public.fixture_provider_links)
  + (SELECT count(*) FROM public.fixture_results)
  + (SELECT count(*) FROM public.football_enrichment)
  + (SELECT count(*) FROM public.fp001_pricing_quarantine)
  + (SELECT count(*) FROM public.tennis_series_commands);
RESET ROLE;
REVOKE SELECT ON TABLE
  public.api_rate_limits,
  public.beta_access,
  public.fixture_provider_links,
  public.fixture_results,
  public.football_enrichment,
  public.fp001_pricing_quarantine,
  public.tennis_series_commands
FROM authenticated;
SQL
)"
[[ "$DENIED_COUNT" == "0" ]]
pass 8 "deny policies survive accidental future SELECT grants"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE
  v_signature regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.adjust_bankroll(text,numeric,text,text)'::regprocedure,
    'public.complete_onboarding()'::regprocedure,
    'public.create_quick_bet(uuid,text,text,text,text,numeric,numeric,text,text)'::regprocedure,
    'public.place_bet_from_decision(uuid,uuid,numeric,text,text)'::regprocedure,
    'public.save_user_settings(text,text,numeric,numeric,boolean,text)'::regprocedure,
    'public.set_user_currency(text)'::regprocedure,
    'public.settle_bet(uuid,text)'::regprocedure,
    'public.update_decision_action(uuid,text)'::regprocedure,
    'public.update_opportunity_status(uuid,text,uuid)'::regprocedure
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc
      WHERE oid=v_signature
        AND prosecdef
        AND proconfig @> ARRAY['search_path=public, pg_temp']
    ) THEN
      RAISE EXCEPTION 'safe search_path mismatch on %', v_signature;
    END IF;
  END LOOP;
END
$$;
SQL
pass 9 "nine definer functions pin pg_temp last"

POST_HIJACK="$(
  psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At <<'SQL'
SET ROLE authenticated;
CREATE TEMP TABLE security_path_probe (marker text NOT NULL);
INSERT INTO security_path_probe VALUES ('attacker-temp');
SELECT public.adjust_bankroll(NULL, NULL, NULL, NULL);
RESET ROLE;
SQL
)"
[[ "$POST_HIJACK" == "trusted-public" ]]
pass 10 "temporary-object shadowing is blocked behaviorally"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
DECLARE
  v_signature regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.create_quick_bet(uuid,text,text,text,text,numeric,numeric,text,text)'::regprocedure,
    'public.set_user_currency(text)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon',v_signature,'EXECUTE')
       OR has_function_privilege('authenticated',v_signature,'EXECUTE')
       OR NOT has_function_privilege('service_role',v_signature,'EXECUTE')
       OR EXISTS (
         SELECT 1
         FROM pg_proc AS p
         CROSS JOIN LATERAL aclexplode(
           COALESCE(p.proacl,acldefault('f',p.proowner))
         ) AS acl
         WHERE p.oid=v_signature
           AND acl.grantee=0
           AND acl.privilege_type='EXECUTE'
       ) THEN
      RAISE EXCEPTION 'retired RPC ACL mismatch on %', v_signature;
    END IF;
  END LOOP;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.adjust_bankroll(text,numeric,text,text)'::regprocedure,
    'public.cancel_pending_bet(uuid,text)'::regprocedure,
    'public.complete_onboarding()'::regprocedure,
    'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)'::regprocedure,
    'public.place_bet_from_decision(uuid,uuid,numeric,text,text)'::regprocedure,
    'public.save_user_settings(text,text,numeric,numeric,boolean,text)'::regprocedure,
    'public.settle_bet(uuid,text)'::regprocedure,
    'public.update_decision_action(uuid,text)'::regprocedure,
    'public.update_opportunity_status(uuid,text,uuid)'::regprocedure
  ] LOOP
    IF NOT has_function_privilege('authenticated',v_signature,'EXECUTE')
       OR NOT has_function_privilege('service_role',v_signature,'EXECUTE') THEN
      RAISE EXCEPTION 'intentional RPC access lost on %', v_signature;
    END IF;
  END LOOP;
END
$$;
SQL
pass 11 "retired RPCs close while nine intentional RPCs remain callable"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE TABLE public.post031_default_table (id integer);
CREATE FUNCTION public.post031_default_function()
RETURNS integer LANGUAGE sql AS 'SELECT 1';

DO $$
BEGIN
  IF has_table_privilege('anon','public.post031_default_table','SELECT')
     OR has_table_privilege(
       'authenticated','public.post031_default_table','SELECT'
     )
     OR NOT has_table_privilege(
       'service_role','public.post031_default_table','SELECT'
     )
     OR has_function_privilege(
       'anon','public.post031_default_function()','EXECUTE'
     )
     OR has_function_privilege(
       'authenticated','public.post031_default_function()','EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role','public.post031_default_function()','EXECUTE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_proc AS p
       CROSS JOIN LATERAL aclexplode(
         COALESCE(p.proacl,acldefault('f',p.proowner))
       ) AS acl
       WHERE p.oid='public.post031_default_function()'::regprocedure
         AND acl.grantee=0
         AND acl.privilege_type='EXECUTE'
     ) THEN
    RAISE EXCEPTION 'post-031 default privilege boundary mismatch';
  END IF;
END
$$;
SQL
pass 12 "future public tables and functions are client-deny by default"

echo "Decision #067 migration 031 verifier passed on disposable PostgreSQL."
