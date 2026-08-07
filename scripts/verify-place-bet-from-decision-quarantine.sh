#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$ROOT_DIR/supabase/migrations/20260806154618_quarantine_place_bet_from_decision.sql"
ROLLBACK="$ROOT_DIR/docs/place-bet-from-decision-quarantine-rollback.sql"
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

for required in "$MIGRATION" "$ROLLBACK"; do
  [[ -f "$required" ]] || { echo "missing required file: $required" >&2; exit 2; }
done

PSQL=(psql "$DATABASE_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 -q)
step=0
step() {
  step=$((step + 1))
  printf '[%02d/10] %s\n' "$step" "$1"
}

expect_denied() {
  local role="$1"
  local output
  if output="$("${PSQL[@]}" 2>&1 <<SQL
SET ROLE $role;
SELECT public.place_bet_from_decision(
  NULL::uuid, NULL::uuid, NULL::numeric, NULL::text, NULL::text
);
SQL
)"; then
    echo "$role unexpectedly executed place_bet_from_decision" >&2
    exit 1
  fi
  if [[ "$output" != *"permission denied for function place_bet_from_decision"* ]]; then
    printf '%s\n' "$output" >&2
    echo "$role failed for an unexpected reason" >&2
    exit 1
  fi
}

step 'bootstrap the current authenticated-callable boundary'
"${PSQL[@]}" <<'SQL'
DO $$
BEGIN
  IF current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999 THEN
    RAISE EXCEPTION 'PostgreSQL 17 required, got %', version();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'quarantine_public_probe') THEN
    CREATE ROLE quarantine_public_probe NOLOGIN;
  END IF;
END
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, quarantine_public_probe;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, quarantine_public_probe;

CREATE FUNCTION public.place_bet_from_decision(
  uuid, uuid, numeric, text, text
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT jsonb_build_object('path', 'server-only-ok') $$;

REVOKE EXECUTE ON FUNCTION public.place_bet_from_decision(
  uuid, uuid, numeric, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.place_bet_from_decision(
  uuid, uuid, numeric, text, text
) TO authenticated, service_role;
SQL

step 'prove the pre-migration authenticated bypass is reachable'
BEFORE="$("${PSQL[@]}" -At <<'SQL'
SET ROLE authenticated;
SELECT public.place_bet_from_decision(
  NULL::uuid, NULL::uuid, NULL::numeric, NULL::text, NULL::text
)->>'path';
RESET ROLE;
SQL
)"
[[ "$BEFORE" == 'server-only-ok' ]]

step 'apply quarantine to disposable PostgreSQL 17'
"${PSQL[@]}" -f "$MIGRATION" >/dev/null

step 'verify exact post-migration ACL catalog state'
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE
  v_rpc regprocedure :=
    'public.place_bet_from_decision(uuid,uuid,numeric,text,text)'::regprocedure;
BEGIN
  IF has_function_privilege('anon', v_rpc, 'EXECUTE')
     OR has_function_privilege('authenticated', v_rpc, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_rpc, 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_proc AS p
       CROSS JOIN LATERAL aclexplode(
         COALESCE(p.proacl, acldefault('f', p.proowner))
       ) AS acl
       WHERE p.oid = v_rpc
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'quarantine ACL mismatch';
  END IF;
END
$$;
SQL

step 'deny PUBLIC-only, anon and authenticated callers behaviorally'
expect_denied quarantine_public_probe
expect_denied anon
expect_denied authenticated

step 'preserve the service_role execution path'
SERVICE_RESULT="$("${PSQL[@]}" -At <<'SQL'
SET ROLE service_role;
SELECT public.place_bet_from_decision(
  NULL::uuid, NULL::uuid, NULL::numeric, NULL::text, NULL::text
)->>'path';
RESET ROLE;
SQL
)"
[[ "$SERVICE_RESULT" == 'server-only-ok' ]]

step 'apply reviewed rollback to disposable database'
"${PSQL[@]}" -f "$ROLLBACK" >/dev/null

step 'verify rollback restores authenticated but not PUBLIC or anon'
ROLLBACK_RESULT="$("${PSQL[@]}" -At <<'SQL'
SET ROLE authenticated;
SELECT public.place_bet_from_decision(
  NULL::uuid, NULL::uuid, NULL::numeric, NULL::text, NULL::text
)->>'path';
RESET ROLE;
SQL
)"
[[ "$ROLLBACK_RESULT" == 'server-only-ok' ]]
expect_denied quarantine_public_probe
expect_denied anon

step 're-apply quarantine after rollback'
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
expect_denied authenticated

step 'verify idempotent secure re-application and final control'
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
expect_denied quarantine_public_probe
expect_denied anon
expect_denied authenticated
FINAL_SERVICE_RESULT="$("${PSQL[@]}" -At <<'SQL'
SET ROLE service_role;
SELECT public.place_bet_from_decision(
  NULL::uuid, NULL::uuid, NULL::numeric, NULL::text, NULL::text
)->>'path';
RESET ROLE;
SQL
)"
[[ "$FINAL_SERVICE_RESULT" == 'server-only-ok' ]]

echo 'place_bet_from_decision quarantine verifier passed on disposable PostgreSQL 17.'
