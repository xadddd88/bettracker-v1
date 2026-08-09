#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$ROOT_DIR/supabase/migrations/20260809083122_active_membership_foundation.sql"
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

for required in "$MIGRATION" "$BASELINE"; do
  [[ -f "$required" ]] || { echo "missing required file: $required" >&2; exit 2; }
done

PSQL=(psql "$DATABASE_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 -q)
S2_TMP_DIR="$(mktemp -d /tmp/bettracker-s2-membership.XXXXXX)"
cleanup() {
  rm -f "$S2_TMP_DIR/revoke-first.out" "$S2_TMP_DIR/consume-first.out"
  rmdir "$S2_TMP_DIR"
}
trap cleanup EXIT

step=0
step() {
  step=$((step + 1))
  printf '[%02d/12] %s — PASS\n' "$step" "$1"
}

membership_result() {
  local user_id="$1"
  "${PSQL[@]}" -At <<SQL | tail -n 1
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$user_id', false);
SELECT private.is_active_member();
RESET ROLE;
SQL
}

consume_result() {
  local user_id="$1"
  local email="$2"
  "${PSQL[@]}" -At <<SQL | tail -n 1
SET ROLE service_role;
SELECT public.consume_beta_access_invite('$user_id'::uuid, '$email'::text);
RESET ROLE;
SQL
}

expect_denied() {
  local role="$1"
  local sql="$2"
  local output
  if output="$("${PSQL[@]}" -At 2>&1 <<SQL
SET ROLE $role;
$sql
SQL
)"; then
    echo "$role unexpectedly crossed an S2.1 function boundary" >&2
    exit 1
  fi
  if [[ "$output" != *"permission denied"* ]]; then
    printf '%s\n' "$output" >&2
    echo "$role failed for an unexpected reason" >&2
    exit 1
  fi
}

wait_for_sleeping_app() {
  local app_name="$1"
  local attempts
  for attempts in $(seq 1 50); do
    if [[ "$("${PSQL[@]}" -Atc "SELECT count(*) FROM pg_stat_activity WHERE application_name = '$app_name' AND state = 'active' AND query LIKE 'SELECT pg_sleep%'")" == '1' ]]; then
      return 0
    fi
    sleep 0.1
  done
  echo "timed out waiting for concurrency fixture: $app_name" >&2
  return 1
}

SERVER_VERSION_NUM="$("${PSQL[@]}" -Atc 'SHOW server_version_num')"
if (( SERVER_VERSION_NUM < 170000 || SERVER_VERSION_NUM >= 180000 )); then
  echo "PostgreSQL 17 required, server_version_num=$SERVER_VERSION_NUM" >&2
  exit 1
fi
grep -Fq '"0029_authenticated_security_definer_function_executable": 8' "$BASELINE"
grep -Fq '"0008_rls_enabled_no_policy": 1' "$BASELINE"
step 'PostgreSQL 17 required and the versioned S1 baseline is present'

"${PSQL[@]}" <<'SQL'
DO $$
BEGIN
  IF to_regprocedure('public.post031_default_function()') IS NULL
     OR to_regclass('public.decision_056_execution_ledger') IS NULL THEN
    RAISE EXCEPTION
      'run verify-migration-031.sh and verify-supabase-advisor-baseline.sh first';
  END IF;
  IF (
    SELECT count(*)
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) <> 8 THEN
    RAISE EXCEPTION 'S1 authenticated RPC precondition mismatch';
  END IF;
END
$$;
SQL
step 'S1 PostgreSQL predecessor and exact eight-RPC precondition'

"${PSQL[@]}" <<'SQL'
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
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 's2_public_probe') THEN
    CREATE ROLE s2_public_probe NOLOGIN;
  END IF;
END
$$;

DROP TABLE public.beta_access;
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text UNIQUE
);

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.beta_access (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  email_normalized text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'approved',
  used_at timestamptz,
  used_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beta_access_status_check
    CHECK (status IN ('approved', 'invited', 'used', 'revoked'))
);
ALTER TABLE public.beta_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.beta_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.beta_access TO service_role;
CREATE POLICY beta_access_client_deny_all
  ON public.beta_access AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE INDEX idx_beta_access_used_by_user
  ON public.beta_access (used_by_user_id)
  WHERE used_by_user_id IS NOT NULL;
CREATE INDEX idx_beta_access_used_by_user_id
  ON public.beta_access (used_by_user_id);

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'active@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'approved@example.com'),
  ('33333333-3333-4333-8333-333333333333', 'invited@example.com'),
  ('44444444-4444-4444-8444-444444444444', 'revoked@example.com'),
  ('55555555-5555-4555-8555-555555555555', 'missing@example.com'),
  ('66666666-6666-4666-8666-666666666666', 'pending@example.com'),
  ('77777777-7777-4777-8777-777777777777', 'foreign@example.com'),
  ('88888888-8888-4888-8888-888888888888', 'revoke-first@example.com'),
  ('99999999-9999-4999-8999-999999999999', 'consume-first@example.com'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'history@example.com');

INSERT INTO public.beta_access (
  id, email, email_normalized, status, used_at, used_by_user_id
) VALUES
  (
    'a1111111-1111-4111-8111-111111111111',
    'active@example.com', 'active@example.com', 'used', now(),
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'a2222222-2222-4222-8222-222222222222',
    'approved@example.com', 'approved@example.com', 'approved', NULL, NULL
  ),
  (
    'a3333333-3333-4333-8333-333333333333',
    'invited@example.com', 'invited@example.com', 'invited', NULL, NULL
  ),
  (
    'a4444444-4444-4444-8444-444444444444',
    'revoked@example.com', 'revoked@example.com', 'revoked', NULL, NULL
  ),
  (
    'a6666666-6666-4666-8666-666666666666',
    'pending@example.com', 'pending@example.com', 'approved', NULL, NULL
  ),
  (
    'a7777777-7777-4777-8777-777777777777',
    'foreign@example.com', 'foreign@example.com', 'approved', NULL, NULL
  ),
  (
    'a8888888-8888-4888-8888-888888888888',
    'revoke-first@example.com', 'revoke-first@example.com', 'invited', NULL, NULL
  ),
  (
    'a9999999-9999-4999-8999-999999999999',
    'consume-first@example.com', 'consume-first@example.com', 'invited', NULL, NULL
  );
SQL
step 'production-shaped Auth and beta_access fixtures without data drift'

"${PSQL[@]}" -f "$MIGRATION" >/dev/null
step 'apply S2.1 migration to disposable PostgreSQL 17'

"${PSQL[@]}" <<'SQL'
DO $$
DECLARE
  helper regprocedure := 'private.is_active_member()'::regprocedure;
  consume_rpc regprocedure :=
    'public.consume_beta_access_invite(uuid,text)'::regprocedure;
BEGIN
  IF to_regprocedure('public.is_active_member()') IS NOT NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_proc AS p
       JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE p.oid = helper
         AND n.nspname = 'private'
         AND p.prosecdef
         AND p.provolatile = 's'
         AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
     )
     OR NOT has_schema_privilege('authenticated', 'private', 'USAGE')
     OR has_schema_privilege('anon', 'private', 'USAGE')
     OR has_function_privilege('anon', helper, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', helper, 'EXECUTE')
     OR NOT has_function_privilege('service_role', helper, 'EXECUTE') THEN
    RAISE EXCEPTION 'private helper catalog or ACL mismatch';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM pg_proc
       WHERE oid = consume_rpc
         AND prosecdef
         AND provolatile = 'v'
         AND proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
     )
     OR has_function_privilege('anon', consume_rpc, 'EXECUTE')
     OR has_function_privilege('authenticated', consume_rpc, 'EXECUTE')
     OR NOT has_function_privilege('service_role', consume_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'consume RPC catalog or ACL mismatch';
  END IF;
END
$$;
SQL
expect_denied s2_public_probe 'SELECT private.is_active_member();'
expect_denied anon 'SELECT private.is_active_member();'
expect_denied s2_public_probe "SELECT public.consume_beta_access_invite(NULL::uuid, NULL::text);"
expect_denied anon "SELECT public.consume_beta_access_invite(NULL::uuid, NULL::text);"
expect_denied authenticated "SELECT public.consume_beta_access_invite(NULL::uuid, NULL::text);"
step 'service-only consume ACL and private non-API surface'

[[ "$(membership_result '11111111-1111-4111-8111-111111111111')" == 't' ]]
for user_id in \
  '22222222-2222-4222-8222-222222222222' \
  '33333333-3333-4333-8333-333333333333' \
  '44444444-4444-4444-8444-444444444444' \
  '55555555-5555-4555-8555-555555555555' \
  '77777777-7777-4777-8777-777777777777'; do
  [[ "$(membership_result "$user_id")" == 'f' ]]
done
[[ "$(membership_result '')" == 'f' ]]
step 'active, pending, revoked, missing and unauthenticated membership behavior'

[[ "$(consume_result '22222222-2222-4222-8222-222222222222' ' APPROVED@EXAMPLE.COM ')" == 'consumed' ]]
[[ "$(consume_result '22222222-2222-4222-8222-222222222222' 'approved@example.com')" == 'already_used' ]]
[[ "$(consume_result '33333333-3333-4333-8333-333333333333' 'invited@example.com')" == 'consumed' ]]
[[ "$(membership_result '22222222-2222-4222-8222-222222222222')" == 't' ]]
[[ "$(membership_result '33333333-3333-4333-8333-333333333333')" == 't' ]]
step 'approved and invited consumption plus idempotent repeat'

[[ "$(consume_result '44444444-4444-4444-8444-444444444444' 'revoked@example.com')" == 'not_eligible' ]]
[[ "$(consume_result '55555555-5555-4555-8555-555555555555' 'missing@example.com')" == 'not_eligible' ]]
[[ "$(consume_result '77777777-7777-4777-8777-777777777777' 'pending@example.com')" == 'not_eligible' ]]
[[ "$(consume_result '66666666-6666-4666-8666-666666666666' 'wrong@example.com')" == 'not_eligible' ]]
step 'foreign, missing, revoked and email-mismatch rejection'

"${PSQL[@]}" <<'SQL'
DO $$
BEGIN
  BEGIN
    INSERT INTO public.beta_access (
      id, email, email_normalized, status, used_at, used_by_user_id
    ) VALUES (
      'b2222222-2222-4222-8222-222222222222',
      'approved-duplicate@example.com', 'approved-duplicate@example.com',
      'used', now(), '22222222-2222-4222-8222-222222222222'
    );
    RAISE EXCEPTION 'duplicate membership was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.beta_access (
      id, email, email_normalized, status, used_at, used_by_user_id
    ) VALUES (
      'b3333333-3333-4333-8333-333333333333',
      'invalid-pending@example.com', 'invalid-pending@example.com',
      'approved', now(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    RAISE EXCEPTION 'invalid pending lifecycle shape was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.beta_access (
      id, email, email_normalized, status, used_at, used_by_user_id
    ) VALUES (
      'b4444444-4444-4444-8444-444444444444',
      'invalid-used@example.com', 'invalid-used@example.com',
      'used', NULL, NULL
    );
    RAISE EXCEPTION 'invalid used lifecycle shape was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO public.beta_access (
    id, email, email_normalized, status, used_at, used_by_user_id
  ) VALUES (
    'baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'history@example.com', 'history@example.com',
    'revoked', now(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'idx_beta_access_used_by_user',
        'idx_beta_access_used_by_user_id',
        'beta_access_used_by_user_unique'
      )
    GROUP BY schemaname
    HAVING count(*) = 3
  ) THEN
    RAISE EXCEPTION 'existing or unique membership index missing';
  END IF;
END
$$;
SQL
step 'unique membership and lifecycle shape guards'

PGAPPNAME=s2_revoke_first "${PSQL[@]}" -At >"$S2_TMP_DIR/revoke-first.out" <<'SQL' &
BEGIN;
UPDATE public.beta_access
SET status = 'revoked', updated_at = clock_timestamp()
WHERE email_normalized = 'revoke-first@example.com';
SELECT pg_sleep(2);
COMMIT;
SQL
REVOKE_FIRST_PID=$!
wait_for_sleeping_app 's2_revoke_first'
[[ "$(consume_result '88888888-8888-4888-8888-888888888888' 'revoke-first@example.com')" == 'not_eligible' ]]
wait "$REVOKE_FIRST_PID"
[[ "$("${PSQL[@]}" -Atc "SELECT status FROM public.beta_access WHERE email_normalized = 'revoke-first@example.com'")" == 'revoked' ]]
step 'revoke-first concurrency is not overwritten'

PGAPPNAME=s2_consume_first "${PSQL[@]}" -At >"$S2_TMP_DIR/consume-first.out" <<'SQL' &
BEGIN;
SET ROLE service_role;
SELECT public.consume_beta_access_invite(
  '99999999-9999-4999-8999-999999999999'::uuid,
  'consume-first@example.com'
);
RESET ROLE;
SELECT pg_sleep(2);
COMMIT;
SQL
CONSUME_FIRST_PID=$!
wait_for_sleeping_app 's2_consume_first'
"${PSQL[@]}" -c "UPDATE public.beta_access SET status = 'revoked', updated_at = clock_timestamp() WHERE email_normalized = 'consume-first@example.com'" >/dev/null
wait "$CONSUME_FIRST_PID"
grep -Fxq 'consumed' "$S2_TMP_DIR/consume-first.out"
[[ "$("${PSQL[@]}" -Atc "SELECT status FROM public.beta_access WHERE email_normalized = 'consume-first@example.com'")" == 'revoked' ]]
step 'consume-first concurrency still permits later revoke'

"${PSQL[@]}" <<'SQL'
DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) <> 8 THEN
    RAISE EXCEPTION 'authenticated SECURITY DEFINER baseline changed';
  END IF;
  IF (
    SELECT count(*)
    FROM pg_policy
    WHERE polrelid = 'public.decision_056_execution_ledger'::regclass
  ) <> 0 THEN
    RAISE EXCEPTION 'ledger INFO baseline changed';
  END IF;
  IF to_regprocedure('public.is_active_member()') IS NOT NULL
     OR has_function_privilege(
       'authenticated',
       'public.consume_beta_access_invite(uuid,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'S2.1 entered the authenticated public RPC surface';
  END IF;
END
$$;
SQL
step 'Advisor baseline remains eight WARN plus one INFO'

echo 'Security S2.1 Active Membership Foundation verifier passed on disposable PostgreSQL 17.'
