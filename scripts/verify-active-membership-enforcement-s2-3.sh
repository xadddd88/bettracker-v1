#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$ROOT_DIR/supabase/migrations/20260811160255_active_membership_data_api_rpc_enforcement.sql"
EMERGENCY_STOP="$ROOT_DIR/docs/active-membership-enforcement-s2-3-emergency-stop.sql"
STATIC_TEST="$ROOT_DIR/scripts/test-active-membership-enforcement-s2-3.mjs"
EXPECTED_DATABASE_NAME='bettracker_s23_disposable'
EXPECTED_DATABASE_MARKER_PREFIX='bettracker-s2-3-disposable:v1'
CHECK_URL_ONLY=false

usage() {
  echo "usage: $0 --check-database-url postgresql://.../$EXPECTED_DATABASE_NAME" >&2
  echo "       $0 --confirm-disposable postgresql://.../$EXPECTED_DATABASE_NAME" >&2
}

case "${1:-}" in
  --check-database-url)
    CHECK_URL_ONLY=true
    DATABASE_URL="${2:-}"
    [[ $# -eq 2 ]] || { usage; exit 2; }
    ;;
  --confirm-disposable)
    DATABASE_URL="${2:-}"
    [[ $# -eq 2 ]] || { usage; exit 2; }
    ;;
  *)
    usage
    exit 2
    ;;
esac

if [[ -z "$DATABASE_URL" ]]; then
  echo "REFUSED: a disposable localhost PostgreSQL URL is required" >&2
  exit 2
fi

if ! S23_DATABASE_URL_TO_VALIDATE="$DATABASE_URL" \
  S23_EXPECTED_DATABASE_NAME="$EXPECTED_DATABASE_NAME" \
  node <<'NODE'
const raw = process.env.S23_DATABASE_URL_TO_VALIDATE
const expectedDatabaseName = process.env.S23_EXPECTED_DATABASE_NAME
let parsed
try {
  parsed = new URL(raw)
} catch {
  process.exit(1)
}

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

if (
  parsed.protocol !== 'postgresql:'
  || !loopbackHosts.has(parsed.hostname.toLowerCase())
  || parsed.port === ''
  || parsed.pathname !== `/${expectedDatabaseName}`
  || parsed.search !== ''
  || parsed.hash !== ''
) {
  process.exit(1)
}
NODE
then
  echo "REFUSED: verifier accepts only a query-free loopback PostgreSQL URL for database $EXPECTED_DATABASE_NAME" >&2
  exit 2
fi

if [[ "$CHECK_URL_ONLY" == true ]]; then
  exit 0
fi

for required in "$MIGRATION" "$EMERGENCY_STOP" "$STATIC_TEST"; do
  [[ -f "$required" ]] || { echo "missing required file: $required" >&2; exit 2; }
done

# libpq fills parameters that are absent from a URI from its process
# environment. In particular, PGHOSTADDR is independent of the URI host and
# can redirect a syntactically loopback connection. Keep the validated URI as
# the only destination/service authority passed to psql.
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGSERVICE PGSERVICEFILE PGSYSCONFDIR

PSQL=(psql "$DATABASE_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 -q)
RUN_MARKER="$EXPECTED_DATABASE_MARKER_PREFIX:$(
  node -e "process.stdout.write(require('node:crypto').randomBytes(16).toString('hex'))"
)"

emit_session_guard() {
  cat <<SQL
DO \$s23_session_guard\$
BEGIN
  IF current_setting('server_version_num')::integer < 170000
    OR current_setting('server_version_num')::integer >= 180000 THEN
    RAISE EXCEPTION 'REFUSED: S2.3 verifier requires PostgreSQL 17'
      USING ERRCODE = '55000';
  END IF;

  IF current_database() <> '$EXPECTED_DATABASE_NAME'
    OR coalesce(
      (
        SELECT shobj_description(d.oid, 'pg_database')
        FROM pg_database AS d
        WHERE d.datname = current_database()
      ),
      ''
    ) <> '$RUN_MARKER' THEN
    RAISE EXCEPTION 'REFUSED: S2.3 disposable session identity changed'
      USING ERRCODE = '55000';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role')
  ) <> 3 OR EXISTS (
    SELECT 1
    FROM pg_database
    WHERE datname NOT IN (
      'postgres',
      'template0',
      'template1',
      'bettracker_s23_disposable'
    )
  ) THEN
    RAISE EXCEPTION 'REFUSED: S2.3 disposable cluster identity changed'
      USING ERRCODE = '55000';
  END IF;
END
\$s23_session_guard\$;
SQL
}

psql_guarded() {
  {
    printf 'BEGIN;\n'
    emit_session_guard
    cat
    printf '\nCOMMIT;\n'
  } | "${PSQL[@]}" "$@"
}

psql_guarded_file() {
  local file="$1"
  shift
  psql_guarded "$@" <"$file"
}

psql_guarded_command() {
  local sql="$1"
  shift
  printf '%s;\n' "$sql" | psql_guarded "$@"
}

bootstrap_disposable() {
  {
    cat <<SQL
BEGIN;
DO \$s23_bootstrap_guard\$
BEGIN
  IF current_setting('server_version_num')::integer < 170000
    OR current_setting('server_version_num')::integer >= 180000 THEN
    RAISE EXCEPTION 'REFUSED: S2.3 verifier requires PostgreSQL 17'
      USING ERRCODE = '55000';
  END IF;

  IF current_database() <> '$EXPECTED_DATABASE_NAME'
    OR coalesce(
      (
        SELECT shobj_description(d.oid, 'pg_database')
        FROM pg_database AS d
        WHERE d.datname = current_database()
      ),
      ''
    ) <> '' THEN
    RAISE EXCEPTION 'REFUSED: target must be an unmarked S2.3 disposable database'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_namespace AS n
    WHERE n.nspname NOT IN ('public', 'information_schema', 'pg_catalog', 'pg_toast')
  ) OR EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  ) OR EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ) OR EXISTS (
    SELECT 1
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
  ) OR EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role')
  ) OR EXISTS (
    SELECT 1
    FROM pg_database
    WHERE datname NOT IN (
      'postgres',
      'template0',
      'template1',
      'bettracker_s23_disposable'
    )
  ) THEN
    RAISE EXCEPTION 'REFUSED: target is not a fresh, dedicated S2.3 disposable cluster'
      USING ERRCODE = '55000';
  END IF;
END
\$s23_bootstrap_guard\$;

COMMENT ON DATABASE $EXPECTED_DATABASE_NAME IS '$RUN_MARKER';
SQL
    cat
    printf '\nCOMMIT;\n'
  } | "${PSQL[@]}"
}

step=0
step() {
  step=$((step + 1))
  printf '[%02d/14] %s — PASS\n' "$step" "$1"
}

expect_file_refused() {
  local file="$1"
  local expected="$2"
  local output
  if output="$(psql_guarded_file "$file" 2>&1)"; then
    echo "expected SQL file to refuse drift: $file" >&2
    exit 1
  fi
  if [[ "$output" != *"$expected"* ]]; then
    printf '%s\n' "$output" >&2
    echo "SQL file refused for an unexpected reason: $file" >&2
    exit 1
  fi
}

relation_count() {
  local role="$1"
  local user_id="$2"
  local relation="$3"
  psql_guarded -At <<SQL | tail -n 1
SET ROLE $role;
SELECT set_config('request.jwt.claim.sub', '$user_id', false);
SELECT count(*) FROM public.$relation;
RESET ROLE;
SQL
}

expect_inactive() {
  local user_id="$1"
  local sql="$2"
  local output
  if output="$(psql_guarded -At 2>&1 <<SQL
\set VERBOSITY verbose
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$user_id', false);
$sql
SQL
)"; then
    echo "inactive caller unexpectedly crossed RPC boundary: $sql" >&2
    exit 1
  fi
  if [[ "$output" != *"42501"* || "$output" != *"inactive_membership"* ]]; then
    printf '%s\n' "$output" >&2
    echo "inactive caller failed for an unexpected reason" >&2
    exit 1
  fi
}

expect_auth_required() {
  local role="$1"
  local sql="$2"
  local output
  if output="$(psql_guarded -At 2>&1 <<SQL
SET ROLE $role;
SELECT set_config('request.jwt.claim.sub', '', false);
$sql
SQL
)"; then
    echo "$role unexpectedly crossed unauthenticated RPC boundary" >&2
    exit 1
  fi
  if [[ "$output" != *"authenticated"* || "$output" == *"inactive_membership"* ]]; then
    printf '%s\n' "$output" >&2
    echo "$role failed for an unexpected reason" >&2
    exit 1
  fi
}

node "$STATIC_TEST"
step 'static exact-scope contract'

bootstrap_disposable <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE SCHEMA private;

CREATE TABLE public.beta_access (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  used_by_user_id uuid
);
ALTER TABLE public.beta_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beta_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.beta_access TO service_role;

INSERT INTO public.beta_access (id, status, used_by_user_id) VALUES
  (
    'a1111111-1111-4111-8111-111111111111',
    'used',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'a2222222-2222-4222-8222-222222222222',
    'approved',
    NULL
  ),
  (
    'a3333333-3333-4333-8333-333333333333',
    'invited',
    NULL
  ),
  (
    'a4444444-4444-4444-8444-444444444444',
    'revoked',
    '44444444-4444-4444-8444-444444444444'
  );

CREATE TABLE public.ai_analysis_runs (id uuid, user_id uuid);
CREATE TABLE public.bankroll_transactions (id uuid, user_id uuid);
CREATE TABLE public.bankrolls (id uuid, user_id uuid);
CREATE TABLE public.bet_legs (id uuid, user_id uuid);
CREATE TABLE public.beta_feedback (id uuid, user_id uuid);
CREATE TABLE public.bets (id uuid, user_id uuid);
CREATE TABLE public.canonical_fixtures (id uuid, user_id uuid);
CREATE TABLE public.coaching_sessions (id uuid, user_id uuid);
CREATE TABLE public.decisions (id uuid, user_id uuid);
CREATE TABLE public.global_config (id uuid, user_id uuid);
CREATE TABLE public.market_catalog (id uuid, user_id uuid);
CREATE TABLE public.market_opportunities (id uuid, user_id uuid);
CREATE TABLE public.odds_snapshots (id uuid, user_id uuid);
CREATE TABLE public.profiles (id uuid, user_id uuid);
CREATE TABLE public.tennis_series (id uuid, user_id uuid);
CREATE TABLE public.tennis_series_steps (id uuid, user_id uuid);

DO $bootstrap$
DECLARE
  v_relation text;
BEGIN
  FOREACH v_relation IN ARRAY ARRAY[
    'ai_analysis_runs',
    'bankroll_transactions',
    'bankrolls',
    'bet_legs',
    'beta_feedback',
    'bets',
    'canonical_fixtures',
    'coaching_sessions',
    'decisions',
    'global_config',
    'market_catalog',
    'market_opportunities',
    'odds_snapshots',
    'profiles',
    'tennis_series',
    'tennis_series_steps'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_relation);
    EXECUTE format(
      'CREATE POLICY predecessor_allow ON public.%I AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      v_relation
    );
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_relation);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v_relation);
    EXECUTE format(
      'INSERT INTO public.%I (id, user_id) VALUES ($1, $2)',
      v_relation
    ) USING
      '91111111-1111-4111-8111-111111111111'::uuid,
      '11111111-1111-4111-8111-111111111111'::uuid;
  END LOOP;
END
$bootstrap$;

-- Match migration 030's production ACL shape: odds_snapshots is readable only
-- through an explicit safe-column grant, not a table-level SELECT grant.
REVOKE SELECT ON public.odds_snapshots FROM authenticated;
GRANT SELECT (id, user_id) ON public.odds_snapshots TO authenticated;

GRANT INSERT ON public.beta_feedback TO authenticated;

CREATE VIEW public.odds_snapshots_public
WITH (security_invoker = true)
AS SELECT id, user_id FROM public.odds_snapshots;
GRANT SELECT ON public.odds_snapshots_public TO authenticated;
SQL
step 'self-attested PostgreSQL 17 target, run-bound marker and production-shaped boundary'

node "$STATIC_TEST" --emit-membership-helper | psql_guarded
psql_guarded <<'SQL'
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.is_active_member()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_active_member()
  TO authenticated, service_role;
SQL
step 'exact S2.1 private helper predecessor'

node "$STATIC_TEST" --emit-predecessor-functions | psql_guarded
psql_guarded <<'SQL'
REVOKE ALL PRIVILEGES ON FUNCTION
  public.adjust_bankroll(text, numeric, text, text),
  public.cancel_pending_bet(uuid, text),
  public.complete_onboarding(),
  public.create_tracked_bet(jsonb, numeric, numeric, text, text, text, text),
  public.save_user_settings(text, text, numeric, numeric, boolean, text),
  public.settle_bet(uuid, text),
  public.update_decision_action(uuid, text),
  public.update_opportunity_status(uuid, text, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.adjust_bankroll(text, numeric, text, text),
  public.cancel_pending_bet(uuid, text),
  public.complete_onboarding(),
  public.create_tracked_bet(jsonb, numeric, numeric, text, text, text, text),
  public.save_user_settings(text, text, numeric, numeric, boolean, text),
  public.settle_bet(uuid, text),
  public.update_decision_action(uuid, text),
  public.update_opportunity_status(uuid, text, uuid)
TO authenticated, service_role;
SQL
step 'exact eight-RPC body, ACL and search-path predecessor'

psql_guarded <<'SQL'
CREATE TABLE public.unexpected_column_data (id uuid, user_id uuid);
ALTER TABLE public.unexpected_column_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY unexpected_client_allow
  ON public.unexpected_column_data
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
GRANT SELECT (id) ON public.unexpected_column_data TO authenticated;
GRANT ALL ON public.unexpected_column_data TO service_role;
SQL
expect_file_refused "$MIGRATION" 'authenticated Data API base relation inventory drift'
psql_guarded_command 'DROP TABLE public.unexpected_column_data' >/dev/null

psql_guarded <<'SQL'
CREATE TABLE public.unexpected_view_source (id uuid, user_id uuid);
CREATE VIEW public.unexpected_owner_view
AS SELECT id, user_id FROM public.unexpected_view_source;
GRANT SELECT ON public.unexpected_owner_view TO authenticated;
SQL
expect_file_refused "$MIGRATION" 'authenticated Data API non-table relation inventory drift'
psql_guarded <<'SQL'
DROP VIEW public.unexpected_owner_view;
DROP TABLE public.unexpected_view_source;
SQL

psql_guarded <<'SQL'
CREATE ROLE unexpected_helper_owner NOLOGIN;
ALTER FUNCTION private.is_active_member() OWNER TO unexpected_helper_owner;
SQL
expect_file_refused "$MIGRATION" 'private.is_active_member() catalog or body drift'
psql_guarded <<'SQL'
ALTER FUNCTION private.is_active_member() OWNER TO postgres;
DROP ROLE unexpected_helper_owner;
SQL

psql_guarded <<'SQL'
CREATE ROLE unexpected_rpc_role NOLOGIN;
GRANT EXECUTE ON FUNCTION public.complete_onboarding() TO unexpected_rpc_role;
SQL
expect_file_refused "$MIGRATION" 'RPC ACL drift: public.complete_onboarding()'
psql_guarded <<'SQL'
REVOKE EXECUTE ON FUNCTION public.complete_onboarding() FROM unexpected_rpc_role;
DROP ROLE unexpected_rpc_role;
SQL
step 'migration preflight rejects column, view, helper-owner and RPC-ACL drift'

psql_guarded_file "$MIGRATION" >/dev/null
step 'apply review-only S2.3 migration to disposable PostgreSQL 17'

psql_guarded <<'SQL'
DO $$
DECLARE
  v_authenticated oid := (SELECT oid FROM pg_roles WHERE rolname = 'authenticated');
  v_service_role oid := (SELECT oid FROM pg_roles WHERE rolname = 'service_role');
BEGIN
  IF (
    SELECT count(*)
    FROM pg_policy AS p
    JOIN pg_class AS c ON c.oid = p.polrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.polname = 'active_membership_required'
      AND NOT p.polpermissive
      AND p.polcmd = '*'
      AND p.polroles = ARRAY[v_authenticated]
      AND pg_get_expr(p.polqual, p.polrelid)
            = '( SELECT private.is_active_member() AS is_active_member)'
      AND pg_get_expr(p.polwithcheck, p.polrelid)
            = '( SELECT private.is_active_member() AS is_active_member)'
  ) <> 16 THEN
    RAISE EXCEPTION 'restrictive membership policy mismatch';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND position('private.is_active_member()' in p.prosrc) > 0
  ) <> 8 THEN
    RAISE EXCEPTION 'authenticated RPC membership assertion mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'anon definer RPC widened';
  END IF;

  IF EXISTS (
    SELECT format('%I.%I', n.nspname, c.relname)
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND (
        has_table_privilege('authenticated', c.oid, 'SELECT')
        OR has_table_privilege('authenticated', c.oid, 'INSERT')
        OR has_table_privilege('authenticated', c.oid, 'UPDATE')
        OR has_table_privilege('authenticated', c.oid, 'DELETE')
        OR has_table_privilege('authenticated', c.oid, 'TRUNCATE')
        OR has_table_privilege('authenticated', c.oid, 'REFERENCES')
        OR has_table_privilege('authenticated', c.oid, 'TRIGGER')
        OR has_any_column_privilege('authenticated', c.oid, 'SELECT')
        OR has_any_column_privilege('authenticated', c.oid, 'INSERT')
        OR has_any_column_privilege('authenticated', c.oid, 'UPDATE')
        OR has_any_column_privilege('authenticated', c.oid, 'REFERENCES')
      )
    EXCEPT
    SELECT unnest(ARRAY[
      'public.ai_analysis_runs',
      'public.bankroll_transactions',
      'public.bankrolls',
      'public.bet_legs',
      'public.beta_feedback',
      'public.bets',
      'public.canonical_fixtures',
      'public.coaching_sessions',
      'public.decisions',
      'public.global_config',
      'public.market_catalog',
      'public.market_opportunities',
      'public.odds_snapshots',
      'public.profiles',
      'public.tennis_series',
      'public.tennis_series_steps'
    ])
  ) THEN
    RAISE EXCEPTION 'authenticated relation inventory widened';
  END IF;

  IF EXISTS (
    SELECT format('%I.%I', n.nspname, c.relname)
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('v', 'm', 'f')
      AND (
        has_table_privilege('authenticated', c.oid, 'SELECT')
        OR has_table_privilege('authenticated', c.oid, 'INSERT')
        OR has_table_privilege('authenticated', c.oid, 'UPDATE')
        OR has_table_privilege('authenticated', c.oid, 'DELETE')
        OR has_table_privilege('authenticated', c.oid, 'TRUNCATE')
        OR has_table_privilege('authenticated', c.oid, 'REFERENCES')
        OR has_table_privilege('authenticated', c.oid, 'TRIGGER')
        OR has_any_column_privilege('authenticated', c.oid, 'SELECT')
        OR has_any_column_privilege('authenticated', c.oid, 'INSERT')
        OR has_any_column_privilege('authenticated', c.oid, 'UPDATE')
        OR has_any_column_privilege('authenticated', c.oid, 'REFERENCES')
      )
    EXCEPT
    SELECT 'public.odds_snapshots_public'
  ) OR EXISTS (
    SELECT 'public.odds_snapshots_public'
    EXCEPT
    SELECT format('%I.%I', n.nspname, c.relname)
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('v', 'm', 'f')
      AND (
        has_table_privilege('authenticated', c.oid, 'SELECT')
        OR has_table_privilege('authenticated', c.oid, 'INSERT')
        OR has_table_privilege('authenticated', c.oid, 'UPDATE')
        OR has_table_privilege('authenticated', c.oid, 'DELETE')
        OR has_table_privilege('authenticated', c.oid, 'TRUNCATE')
        OR has_table_privilege('authenticated', c.oid, 'REFERENCES')
        OR has_table_privilege('authenticated', c.oid, 'TRIGGER')
        OR has_any_column_privilege('authenticated', c.oid, 'SELECT')
        OR has_any_column_privilege('authenticated', c.oid, 'INSERT')
        OR has_any_column_privilege('authenticated', c.oid, 'UPDATE')
        OR has_any_column_privilege('authenticated', c.oid, 'REFERENCES')
      )
  ) THEN
    RAISE EXCEPTION 'authenticated non-table relation inventory mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee <> p.proowner
      AND (
        acl.grantee NOT IN (v_authenticated, v_service_role)
        OR acl.is_grantable
      )
  ) THEN
    RAISE EXCEPTION 'authenticated RPC exact ACL mismatch';
  END IF;
END
$$;
SQL
step 'exact 16-policy, one-view and eight-RPC postflight catalog'

for relation in \
  ai_analysis_runs bankroll_transactions bankrolls bet_legs beta_feedback bets \
  canonical_fixtures coaching_sessions decisions global_config market_catalog \
  market_opportunities odds_snapshots profiles tennis_series tennis_series_steps \
  odds_snapshots_public; do
  [[ "$(relation_count authenticated '11111111-1111-4111-8111-111111111111' "$relation")" == '1' ]]
  [[ "$(relation_count authenticated '44444444-4444-4444-8444-444444444444' "$relation")" == '0' ]]
  [[ "$(relation_count authenticated '55555555-5555-4555-8555-555555555555' "$relation")" == '0' ]]
done
step 'active direct reads pass while revoked and missing membership fail closed'

feedback_error="$(psql_guarded -At 2>&1 <<'SQL' || true
SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '44444444-4444-4444-8444-444444444444',
  false
);
INSERT INTO public.beta_feedback (id, user_id) VALUES (
  '94444444-4444-4444-8444-444444444444',
  '44444444-4444-4444-8444-444444444444'
);
SQL
)"
[[ "$feedback_error" == *"row-level security"* ]]

psql_guarded <<'SQL'
SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  false
);
INSERT INTO public.beta_feedback (id, user_id) VALUES (
  '92222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111'
);
RESET ROLE;
SQL
step 'revoked feedback INSERT denied and active owner INSERT preserved'

rpc_calls=(
  "SELECT public.adjust_bankroll(NULL::text,NULL::numeric,NULL::text,NULL::text);"
  "SELECT public.cancel_pending_bet(NULL::uuid,NULL::text);"
  "SELECT public.complete_onboarding();"
  "SELECT public.create_tracked_bet(NULL::jsonb,NULL::numeric,NULL::numeric,NULL::text,NULL::text,NULL::text,NULL::text);"
  "SELECT public.save_user_settings(NULL::text,NULL::text,NULL::numeric,NULL::numeric,NULL::boolean,NULL::text);"
  "SELECT public.settle_bet(NULL::uuid,NULL::text);"
  "SELECT public.update_decision_action(NULL::uuid,NULL::text);"
  "SELECT public.update_opportunity_status(NULL::uuid,NULL::text,NULL::uuid);"
)

for rpc_call in "${rpc_calls[@]}"; do
  expect_inactive '22222222-2222-4222-8222-222222222222' "$rpc_call"
  expect_inactive '33333333-3333-4333-8333-333333333333' "$rpc_call"
  expect_inactive '44444444-4444-4444-8444-444444444444' "$rpc_call"
  expect_inactive '55555555-5555-4555-8555-555555555555' "$rpc_call"
done
step 'all eight RPCs deny approved, invited, revoked and missing membership with 42501'

expect_auth_required authenticated 'SELECT public.complete_onboarding();'
expect_auth_required service_role 'SELECT public.complete_onboarding();'

[[ "$(relation_count service_role '' profiles)" == '1' ]]
step 'original unauthenticated guard and service-role RLS bypass contract preserved'

psql_guarded <<'SQL'
ALTER POLICY active_membership_required
  ON public.profiles
  USING (true)
  WITH CHECK (true);
SQL
expect_file_refused "$EMERGENCY_STOP" 'refusing emergency stop on policy drift: public.profiles'
psql_guarded <<'SQL'
ALTER POLICY active_membership_required
  ON public.profiles
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));
SQL

psql_guarded_command 'ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY' >/dev/null
expect_file_refused "$EMERGENCY_STOP" 'refusing emergency stop on policy drift: public.profiles'
psql_guarded_command 'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY' >/dev/null

psql_guarded_command 'ALTER VIEW public.odds_snapshots_public RESET (security_invoker)' >/dev/null
expect_file_refused "$EMERGENCY_STOP" 'refusing emergency stop on view execution-mode drift'
psql_guarded_command 'ALTER VIEW public.odds_snapshots_public SET (security_invoker = true)' >/dev/null

psql_guarded <<'SQL'
CREATE TABLE public.unexpected_emergency_column (id uuid);
ALTER TABLE public.unexpected_emergency_column ENABLE ROW LEVEL SECURITY;
CREATE POLICY unexpected_emergency_allow
  ON public.unexpected_emergency_column
  FOR SELECT TO authenticated USING (true);
GRANT SELECT (id) ON public.unexpected_emergency_column TO authenticated;
SQL
expect_file_refused "$EMERGENCY_STOP" 'refusing emergency stop on base relation inventory drift'
psql_guarded_command 'DROP TABLE public.unexpected_emergency_column' >/dev/null

psql_guarded <<'SQL'
CREATE TABLE public.unexpected_emergency_view_source (id uuid);
CREATE VIEW public.unexpected_emergency_owner_view
AS SELECT id FROM public.unexpected_emergency_view_source;
GRANT SELECT ON public.unexpected_emergency_owner_view TO authenticated;
SQL
expect_file_refused "$EMERGENCY_STOP" 'refusing emergency stop on non-table relation inventory drift'
psql_guarded <<'SQL'
DROP VIEW public.unexpected_emergency_owner_view;
DROP TABLE public.unexpected_emergency_view_source;
SQL
step 'emergency stop rejects weakened, inactive and relation inventory drift'

psql_guarded <<'SQL'
CREATE FUNCTION public.unexpected_definer()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT 'reachable'::text
$function$;
REVOKE ALL ON FUNCTION public.unexpected_definer()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unexpected_definer()
  TO authenticated, service_role;
SQL
expect_file_refused "$EMERGENCY_STOP" 'refusing emergency stop on widened RPC inventory'
psql_guarded_command 'DROP FUNCTION public.unexpected_definer()' >/dev/null
step 'emergency stop rejects expanded authenticated definer inventory'

psql_guarded_file "$EMERGENCY_STOP" >/dev/null
psql_guarded <<'SQL'
DO $$
DECLARE
  v_service_role oid := (SELECT oid FROM pg_roles WHERE rolname = 'service_role');
BEGIN
  IF (
    SELECT count(*)
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) IS DISTINCT FROM 8 THEN
    RAISE EXCEPTION 'emergency-stop service-only RPC inventory mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee <> p.proowner
      AND (
        acl.grantee <> v_service_role
        OR acl.is_grantable
      )
  ) THEN
    RAISE EXCEPTION 'emergency-stop exact service-role ACL mismatch';
  END IF;
END
$$;
SQL
step 'emergency stop leaves exactly eight service-role-only RPCs and all policies active'

printf 'S2.3 PostgreSQL 17 contract complete — PASS\n'
