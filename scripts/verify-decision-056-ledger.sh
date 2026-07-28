#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$(
  find "$ROOT_DIR/supabase/migrations" \
    -maxdepth 1 \
    -type f \
    -name '*_decision_056_execution_ledger.sql' \
    -print
)"
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

[[ -f "$MIGRATION" ]] || {
  echo "missing Decision #056 ledger migration" >&2
  exit 2
}

pass() {
  printf '[%02d/08] %s — PASS\n' "$1" "$2"
}

expect_failure() {
  local description="$1"
  local sql="$2"
  if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "$sql" >/dev/null 2>&1; then
    echo "$description unexpectedly succeeded" >&2
    exit 1
  fi
}

grep -Eq "execution_key[[:space:]]+text[[:space:]]+PRIMARY KEY" "$MIGRATION"
grep -Eq "ENABLE ROW LEVEL SECURITY" "$MIGRATION"
grep -Eq "GRANT INSERT ON TABLE public.decision_056_execution_ledger TO service_role" "$MIGRATION"
if grep -Eiq "GRANT[[:space:]]+(SELECT|UPDATE|DELETE|ALL)" "$MIGRATION"; then
  echo "ledger migration grants more than INSERT" >&2
  exit 1
fi
pass 1 "static primary-key, RLS and INSERT-only boundary"

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
SQL

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null
pass 2 "migration applies to disposable PostgreSQL 17"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $$
BEGIN
  IF NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid='public.decision_056_execution_ledger'::regclass
  ) THEN
    RAISE EXCEPTION 'ledger RLS is disabled';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid='public.decision_056_execution_ledger'::regclass
  ) THEN
    RAISE EXCEPTION 'ledger must not have client policies';
  END IF;
END
$$;
SQL
pass 3 "catalog confirms RLS with no policies"

expect_failure "anon INSERT" \
  "SET ROLE anon; INSERT INTO public.decision_056_execution_ledger VALUES ('decision-056:sportmonks-structural-presence-dry-run', repeat('a',64), repeat('b',40));"
expect_failure "authenticated INSERT" \
  "SET ROLE authenticated; INSERT INTO public.decision_056_execution_ledger VALUES ('decision-056:sportmonks-structural-presence-dry-run', repeat('a',64), repeat('b',40));"
pass 4 "anon and authenticated cannot claim"

expect_failure "service_role SELECT" \
  "SET ROLE service_role; SELECT * FROM public.decision_056_execution_ledger;"
expect_failure "service_role UPDATE" \
  "SET ROLE service_role; UPDATE public.decision_056_execution_ledger SET claimed_at=now();"
expect_failure "service_role DELETE" \
  "SET ROLE service_role; DELETE FROM public.decision_056_execution_ledger;"
pass 5 "service_role ledger access is append-only"

RESULT_DIR="$(mktemp -d)"
trap 'rm -r -- "$RESULT_DIR"' EXIT

for attempt in $(seq 1 12); do
  (
    if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
      -c "SET ROLE service_role; INSERT INTO public.decision_056_execution_ledger (execution_key, token_jti_sha256, deployment_sha) VALUES ('decision-056:sportmonks-structural-presence-dry-run', repeat('a',64), repeat('b',40));" \
      >/dev/null 2>&1; then
      echo 0 >"$RESULT_DIR/$attempt"
    else
      echo 1 >"$RESULT_DIR/$attempt"
    fi
  ) &
done
wait

SUCCESS_COUNT="$(
  awk '$1 == 0 { count++ } END { print count + 0 }' "$RESULT_DIR"/*
)"
[[ "$SUCCESS_COUNT" == "1" ]] || {
  echo "expected exactly one concurrent claim, got $SUCCESS_COUNT" >&2
  exit 1
}
pass 6 "twelve concurrent claims produce exactly one winner"

expect_failure "duplicate execution key" \
  "SET ROLE service_role; INSERT INTO public.decision_056_execution_ledger VALUES ('decision-056:sportmonks-structural-presence-dry-run', repeat('c',64), repeat('d',40));"
pass 7 "later dispatch cannot reclaim the immutable execution key"

expect_failure "different execution key" \
  "SET ROLE service_role; INSERT INTO public.decision_056_execution_ledger VALUES ('decision-056:other', repeat('c',64), repeat('d',40));"
pass 8 "ledger refuses widened execution scope"
