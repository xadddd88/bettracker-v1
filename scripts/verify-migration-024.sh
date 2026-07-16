#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$ROOT_DIR/supabase/migrations/024_create_tracked_bet.sql"
ROLLBACK="$ROOT_DIR/docs/decision-060-rollback.sql"
DATABASE_URL="${1:-${DATABASE_URL:-}}"

if [[ -z "$DATABASE_URL" ]]; then
  echo "usage: $0 postgresql://...  (DISPOSABLE PostgreSQL 17 database only)" >&2
  exit 2
fi

if [[ "$DATABASE_URL" =~ (supabase\.co|pooler\.supabase\.com|btdk\.app) ]]; then
  echo "refusing a production-looking database URL" >&2
  exit 2
fi

PSQL=(psql "$DATABASE_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 -q)
step=0
step() {
  step=$((step + 1))
  printf '[%02d/11] %s\n' "$step" "$1"
}

step 'bootstrap disposable PostgreSQL 17 fixture'
"${PSQL[@]}" <<'SQL'
DO $$
BEGIN
  IF current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999 THEN
    RAISE EXCEPTION 'PostgreSQL 17 required, got %', version();
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'CREATE ROLE anon NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'CREATE ROLE authenticated NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'CREATE ROLE service_role NOLOGIN';
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.bankrolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT true
);

CREATE TABLE public.bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bankroll_id uuid REFERENCES public.bankrolls(id),
  bet_type text NOT NULL,
  stake numeric NOT NULL,
  total_odds numeric,
  potential_payout numeric,
  status text NOT NULL,
  bookmaker text,
  source text,
  notes text
);

CREATE TABLE public.bet_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id uuid NOT NULL REFERENCES public.bets(id) ON DELETE CASCADE,
  sport text,
  event_name text NOT NULL,
  market_type text,
  selection text,
  odds numeric NOT NULL,
  leg_status text NOT NULL
);

CREATE TABLE public.bankroll_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bankroll_id uuid REFERENCES public.bankrolls(id),
  bet_id uuid REFERENCES public.bets(id),
  type text NOT NULL,
  amount numeric NOT NULL,
  balance_after numeric NOT NULL,
  metadata jsonb,
  idempotency_key text
);

CREATE UNIQUE INDEX uq_bankroll_tx_user_idempotency_key
  ON public.bankroll_transactions(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

INSERT INTO public.bankrolls(user_id, balance, is_default)
VALUES ('00000000-0000-4000-8000-000000000060', 100, true);
SQL

step 'apply migration 024'
"${PSQL[@]}" -f "$MIGRATION"

step 'verify exact catalog contract and privilege surface'
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE
  p record;
BEGIN
  SELECT prosecdef, proconfig INTO p
  FROM pg_proc
  WHERE oid =
    'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)'::regprocedure;

  IF NOT p.prosecdef
     OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
    RAISE EXCEPTION 'function security contract mismatch: %', row_to_json(p);
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)',
       'EXECUTE')
     OR NOT has_function_privilege(
       'service_role',
       'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)',
       'EXECUTE')
     OR has_function_privilege(
       'anon',
       'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'EXECUTE surface mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc proc
    CROSS JOIN LATERAL aclexplode(
      COALESCE(proc.proacl, acldefault('f', proc.proowner))
    ) x
    WHERE proc.oid =
      'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)'::regprocedure
      AND x.grantee = 0
      AND x.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC still has EXECUTE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bet_legs'
      AND column_name = 'leg_index'
      AND data_type = 'integer'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'leg_index column mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.bet_legs'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%leg_index%'
      AND pg_get_constraintdef(oid) ILIKE '%20%'
  ) THEN
    RAISE EXCEPTION 'leg_index 1..20 CHECK missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'bet_legs'
      AND indexname = 'uq_bet_legs_bet_leg_index'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%WHERE (leg_index IS NOT NULL)'
  ) THEN
    RAISE EXCEPTION 'partial unique index missing';
  END IF;
END
$$;
SQL

step 'verify unauthenticated call is rejected'
"${PSQL[@]}" <<'SQL'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', false);
DO $$
BEGIN
  PERFORM public.create_tracked_bet(
    '[{"sport":"soccer","event_name":"T","market_type":"1X2","odds":2}]',
    NULL, 1, NULL, NULL, 'manual',
    'a0000000-0000-4000-8000-000000000001'
  );
  RAISE EXCEPTION 'expected unauthenticated rejection';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IS DISTINCT FROM 'Not authenticated' THEN
    RAISE;
  END IF;
END
$$;
RESET ROLE;
SQL

step 'verify canonical insert and 2/2.0/2.00 replay equivalence'
"${PSQL[@]}" <<'SQL'
SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000060',
  false
);
DO $$
DECLARE
  r1 jsonb;
  r2 jsonb;
  r3 jsonb;
BEGIN
  r1 := public.create_tracked_bet(
    '[{"sport":"soccer","event_name":"  A v B  ","market_type":"  1X2  ","selection":"  ","odds":2}]',
    2.0, 10.00, '  Book  ', '  note  ', 'manual',
    'a0000000-0000-4000-8000-000000000001'
  );
  r2 := public.create_tracked_bet(
    '[{"sport":"soccer","event_name":"A v B","market_type":"1X2","selection":null,"odds":2.0}]',
    2.00, 10.0, 'Book', 'note', 'manual',
    'A0000000-0000-4000-8000-000000000001'
  );
  r3 := public.create_tracked_bet(
    '[{"sport":"soccer","event_name":"A v B","market_type":"1X2","odds":2.00}]',
    2, 10, 'Book', 'note', 'manual',
    'a0000000-0000-4000-8000-000000000001'
  );

  IF (r1->>'replayed')::boolean
     OR NOT (r2->>'replayed')::boolean
     OR NOT (r3->>'replayed')::boolean
     OR r1->>'bet_id' IS DISTINCT FROM r2->>'bet_id'
     OR r1->>'bet_id' IS DISTINCT FROM r3->>'bet_id' THEN
    RAISE EXCEPTION 'canonical replay mismatch';
  END IF;
END
$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT balance FROM public.bankrolls)
       IS DISTINCT FROM 90::numeric THEN
    RAISE EXCEPTION 'second deduction occurred';
  END IF;
  IF (SELECT count(*) FROM public.bets) <> 1
     OR (SELECT count(*) FROM public.bankroll_transactions WHERE type = 'stake') <> 1 THEN
    RAISE EXCEPTION 'replay created rows';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.bankroll_transactions
    WHERE idempotency_key = 'a0000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'idempotency key was not canonicalized';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.bets
    WHERE stake = 10 AND total_odds = 2
      AND bookmaker = 'Book' AND notes = 'note'
  ) THEN
    RAISE EXCEPTION 'normalized bet missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.bet_legs
    WHERE event_name = 'A v B' AND market_type = '1X2'
      AND selection IS NULL AND odds = 2 AND leg_index = 1
  ) THEN
    RAISE EXCEPTION 'normalized leg missing';
  END IF;
END
$$;
SQL

step 'verify payload drift and cross-function key conflicts'
"${PSQL[@]}" <<'SQL'
SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000060',
  false
);
DO $$
BEGIN
  PERFORM public.create_tracked_bet(
    '[{"sport":"soccer","event_name":"A v B","market_type":"1X2","odds":2}]',
    NULL, 11, 'Book', 'note', 'manual',
    'A0000000-0000-4000-8000-000000000001'
  );
  RAISE EXCEPTION 'expected payload conflict';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IS DISTINCT FROM 'Idempotency conflict' THEN
    RAISE;
  END IF;
END
$$;
RESET ROLE;

INSERT INTO public.bankroll_transactions(
  user_id, bankroll_id, type, amount, balance_after, metadata, idempotency_key
)
SELECT user_id, id, 'deposit', 1, balance, '{}',
       'B0000000-0000-4000-8000-000000000002'
FROM public.bankrolls;

SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000060',
  false
);
DO $$
BEGIN
  PERFORM public.create_tracked_bet(
    '[{"sport":"soccer","event_name":"C v D","market_type":"1X2","odds":2}]',
    NULL, 1, NULL, NULL, 'manual',
    'b0000000-0000-4000-8000-000000000002'
  );
  RAISE EXCEPTION 'expected cross-function conflict';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IS DISTINCT FROM 'Idempotency conflict' THEN
    RAISE;
  END IF;
END
$$;
RESET ROLE;
SQL

step 'verify insufficient balance and fail-closed validation write nothing'
"${PSQL[@]}" <<'SQL'
SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000060',
  false
);
DO $$
BEGIN
  PERFORM public.create_tracked_bet(
    '[{"sport":"soccer","event_name":"X","market_type":"1X2","odds":2}]',
    NULL, 1000, NULL, NULL, 'manual',
    '00000000-0000-4000-8000-000000000003'
  );
  RAISE EXCEPTION 'expected insufficient balance';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IS DISTINCT FROM 'Insufficient balance' THEN
    RAISE;
  END IF;
END
$$;

DO $$
BEGIN
  PERFORM public.create_tracked_bet(
    '[{"sport":"soccer","event_name":"X","market_type":"1X2","odds":2,"extra":true}]',
    NULL, 1, NULL, NULL, 'manual',
    '00000000-0000-4000-8000-000000000004'
  );
  RAISE EXCEPTION 'expected validation failure';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Leg 1 has unknown field %' THEN
    RAISE;
  END IF;
END
$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.bets) <> 1
     OR (SELECT balance FROM public.bankrolls) <> 90 THEN
    RAISE EXCEPTION 'failed call wrote state';
  END IF;
END
$$;
SQL

step 'verify parlay order plus CHECK/UNIQUE enforcement'
"${PSQL[@]}" <<'SQL'
SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000060',
  false
);
SELECT public.create_tracked_bet(
  '[{"sport":"soccer","event_name":"Leg one","market_type":"1X2","odds":2},{"sport":"tennis","event_name":"Leg two","market_type":"winner","selection":"P2","odds":3}]',
  6.0, 20, NULL, NULL, 'manual',
  '00000000-0000-4000-8000-000000000005'
);
RESET ROLE;

DO $$
DECLARE
  b uuid;
BEGIN
  SELECT bet_id INTO b
  FROM public.bankroll_transactions
  WHERE idempotency_key = '00000000-0000-4000-8000-000000000005';

  IF (
    SELECT array_agg(event_name ORDER BY leg_index)
    FROM public.bet_legs WHERE bet_id = b
  ) IS DISTINCT FROM ARRAY['Leg one', 'Leg two']::text[] THEN
    RAISE EXCEPTION 'leg order mismatch';
  END IF;

  BEGIN
    INSERT INTO public.bet_legs(
      bet_id, event_name, odds, leg_status, leg_index
    ) VALUES (b, 'bad', 2, 'pending', 21);
    RAISE EXCEPTION 'expected CHECK violation';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.bet_legs(
      bet_id, event_name, odds, leg_status, leg_index
    ) VALUES (b, 'dup', 2, 'pending', 1);
    RAISE EXCEPTION 'expected UNIQUE violation';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$$;
SQL

step 'verify rollback preflight blocks live ordered-leg data atomically'
if rollback_output="$("${PSQL[@]}" -f "$ROLLBACK" 2>&1)"; then
  echo 'rollback unexpectedly succeeded with live leg_index data' >&2
  exit 1
fi
if [[ "$rollback_output" != *'Rollback blocked: live leg_index data exists'* ]]; then
  printf '%s\n' "$rollback_output" >&2
  echo 'rollback failed for an unexpected reason' >&2
  exit 1
fi
"${PSQL[@]}" <<'SQL'
DO $$
BEGIN
  IF to_regprocedure(
       'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)'
     ) IS NULL
     OR to_regclass('public.uq_bet_legs_bet_leg_index') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'bet_legs'
         AND column_name = 'leg_index'
     ) THEN
    RAISE EXCEPTION 'failed rollback deleted an artifact';
  END IF;
END
$$;
SQL

step 'clear disposable data, execute rollback, verify postconditions'
"${PSQL[@]}" -c '
  DELETE FROM public.bankroll_transactions;
  DELETE FROM public.bet_legs;
  DELETE FROM public.bets;
'
"${PSQL[@]}" -f "$ROLLBACK"

step 'clean re-apply after rollback'
"${PSQL[@]}" -f "$MIGRATION"
"${PSQL[@]}" -c \
  "SELECT 'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)'::regprocedure;"

[[ "$step" -eq 11 ]]
echo 'ALL 11 STEPS PASSED'
