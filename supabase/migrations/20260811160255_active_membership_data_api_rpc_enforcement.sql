-- ============================================================
-- Security S2.3: active membership at direct database boundaries
--
-- REVIEW ONLY. This migration is intentionally not auto-applied.
-- It composes the S2.1 live-membership predicate with:
--   1. every client-readable base table (restrictive RLS), and
--   2. every authenticated public SECURITY DEFINER RPC.
--
-- Existing ownership/shared-data policies, function signatures,
-- ACLs, search paths, state machines, idempotency, concurrency and
-- financial guards remain in force. Body/catalog drift aborts the
-- transaction before any persistent DDL is executed.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1. Exact predecessor contract ───────────────────────────

DO $preflight$
DECLARE
  v_signature text;
  v_function  regprocedure;
  v_expected_body_md5s text[];
  v_expected_config text[];
  v_relation text;
  v_authenticated oid := (SELECT oid FROM pg_roles WHERE rolname = 'authenticated');
  v_service_role oid := (SELECT oid FROM pg_roles WHERE rolname = 'service_role');
BEGIN
  IF v_authenticated IS NULL OR v_service_role IS NULL THEN
    RAISE EXCEPTION 'required Supabase database roles are missing';
  END IF;

  IF to_regprocedure('private.is_active_member()') IS NULL THEN
    RAISE EXCEPTION 'S2.1 predecessor missing: private.is_active_member()';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE p.oid = 'private.is_active_member()'::regprocedure
      AND n.nspname = 'private'
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND p.prosecdef
      AND p.provolatile = 's'
      AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
      AND md5(p.prosrc) = '6f30a1cd84e1603a817971a3b3798541'
  ) THEN
    RAISE EXCEPTION 'private.is_active_member() catalog or body drift';
  END IF;

  IF (
       SELECT count(*)
       FROM pg_proc AS p
       CROSS JOIN LATERAL aclexplode(
         COALESCE(p.proacl, acldefault('f', p.proowner))
       ) AS acl
       WHERE p.oid = 'private.is_active_member()'::regprocedure
         AND acl.privilege_type = 'EXECUTE'
         AND acl.grantee IN (v_authenticated, v_service_role)
         AND NOT acl.is_grantable
     ) IS DISTINCT FROM 2
     OR EXISTS (
       SELECT 1
       FROM pg_proc AS p
       CROSS JOIN LATERAL aclexplode(
         COALESCE(p.proacl, acldefault('f', p.proowner))
       ) AS acl
       WHERE p.oid = 'private.is_active_member()'::regprocedure
         AND acl.privilege_type = 'EXECUTE'
         AND acl.grantee <> p.proowner
         AND (
           acl.grantee NOT IN (v_authenticated, v_service_role)
           OR acl.is_grantable
         )
     ) THEN
    RAISE EXCEPTION 'private.is_active_member() ACL drift';
  END IF;

  CREATE TEMP TABLE s23_expected_rpc (
    signature text PRIMARY KEY,
    body_md5s text[] NOT NULL,
    expected_config text[] NOT NULL
  ) ON COMMIT DROP;

  -- Four production bodies were historically installed without source
  -- comments. Their normalized SQL tokens are identical to the tracked
  -- rebuild bodies, so both exact raw hashes are accepted and no third
  -- variant is allowed.
  INSERT INTO s23_expected_rpc (signature, body_md5s, expected_config) VALUES
    (
      'public.adjust_bankroll(text,numeric,text,text)',
      ARRAY['241736144ffcfed10e2be65b9a787fe0'],
      ARRAY['search_path=public, pg_temp']
    ),
    (
      'public.cancel_pending_bet(uuid,text)',
      ARRAY['7907069229ddcb9d5f9aa12bcc04099f'],
      ARRAY['search_path=""']
    ),
    (
      'public.complete_onboarding()',
      ARRAY['2973674ff4aca301166f3df002c5d5e6'],
      ARRAY['search_path=public, pg_temp']
    ),
    (
      'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)',
      ARRAY['597bd6196d68e95d5594a674922f7855'],
      ARRAY['search_path=""']
    ),
    (
      'public.save_user_settings(text,text,numeric,numeric,boolean,text)',
      ARRAY[
        '61eddc989fbe721acfa29db7424bbc13',
        '4ed804b4e81dbbcc54aa11d8d2b37676'
      ],
      ARRAY['search_path=public, pg_temp']
    ),
    (
      'public.settle_bet(uuid,text)',
      ARRAY[
        'ff38892c82edf86a2d73dce445d3e18f',
        '003060e1c451a25e044a8dd0403f4b4e'
      ],
      ARRAY['search_path=public, pg_temp']
    ),
    (
      'public.update_decision_action(uuid,text)',
      ARRAY[
        'e4865f80b8eb638947f9346fea581b56',
        '69652473b21b737aa009c43d1de49f21'
      ],
      ARRAY['search_path=public, pg_temp']
    ),
    (
      'public.update_opportunity_status(uuid,text,uuid)',
      ARRAY[
        '04ce1aa4f24ff414e32c183f619d6f85',
        '9035a10306204c69a1eaeaed0ef4233e'
      ],
      ARRAY['search_path=public, pg_temp']
    );

  CREATE TEMP TABLE s23_expected_relation (
    relation_name text PRIMARY KEY
  ) ON COMMIT DROP;

  INSERT INTO s23_expected_relation (relation_name) VALUES
    ('public.ai_analysis_runs'),
    ('public.bankroll_transactions'),
    ('public.bankrolls'),
    ('public.bet_legs'),
    ('public.beta_feedback'),
    ('public.bets'),
    ('public.canonical_fixtures'),
    ('public.coaching_sessions'),
    ('public.decisions'),
    ('public.global_config'),
    ('public.market_catalog'),
    ('public.market_opportunities'),
    ('public.odds_snapshots'),
    ('public.profiles'),
    ('public.tennis_series'),
    ('public.tennis_series_steps');

  CREATE TEMP TABLE s23_expected_non_table_relation (
    relation_name text PRIMARY KEY
  ) ON COMMIT DROP;

  INSERT INTO s23_expected_non_table_relation (relation_name) VALUES
    ('public.odds_snapshots_public');

  IF (
    SELECT count(*)
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) IS DISTINCT FROM 8 THEN
    RAISE EXCEPTION 'expected exactly eight authenticated public definer RPCs';
  END IF;

  FOR v_signature, v_expected_body_md5s, v_expected_config IN
    SELECT signature, body_md5s, expected_config
    FROM s23_expected_rpc
    ORDER BY signature
  LOOP
    v_function := to_regprocedure(v_signature);
    IF v_function IS NULL THEN
      RAISE EXCEPTION 'required RPC missing: %', v_signature;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc AS p
      WHERE p.oid = v_function
        AND pg_get_userbyid(p.proowner) = 'postgres'
        AND p.prokind = 'f'
        AND p.prosecdef
        AND p.provolatile = 'v'
        AND p.proconfig IS NOT DISTINCT FROM v_expected_config
        AND md5(p.prosrc) = ANY(v_expected_body_md5s)
        AND position('private.is_active_member()' in p.prosrc) = 0
    ) THEN
      RAISE EXCEPTION 'RPC catalog or body drift: %', v_signature;
    END IF;

    IF (
         SELECT count(*)
         FROM pg_proc AS p
         CROSS JOIN LATERAL aclexplode(
           COALESCE(p.proacl, acldefault('f', p.proowner))
         ) AS acl
         WHERE p.oid = v_function
           AND acl.privilege_type = 'EXECUTE'
           AND acl.grantee IN (v_authenticated, v_service_role)
           AND NOT acl.is_grantable
       ) IS DISTINCT FROM 2
       OR EXISTS (
         SELECT 1
         FROM pg_proc AS p
         CROSS JOIN LATERAL aclexplode(
           COALESCE(p.proacl, acldefault('f', p.proowner))
         ) AS acl
         WHERE p.oid = v_function
           AND acl.privilege_type = 'EXECUTE'
           AND acl.grantee <> p.proowner
           AND (
             acl.grantee NOT IN (v_authenticated, v_service_role)
             OR acl.is_grantable
           )
       ) THEN
      RAISE EXCEPTION 'RPC ACL drift: %', v_signature;
    END IF;
  END LOOP;

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
    SELECT relation_name FROM s23_expected_relation
  ) OR EXISTS (
    SELECT relation_name FROM s23_expected_relation
    EXCEPT
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
  ) THEN
    RAISE EXCEPTION 'authenticated Data API base relation inventory drift';
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
    SELECT relation_name FROM s23_expected_non_table_relation
  ) OR EXISTS (
    SELECT relation_name FROM s23_expected_non_table_relation
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
    RAISE EXCEPTION 'authenticated Data API non-table relation inventory drift';
  END IF;

  FOR v_relation IN
    SELECT relation_name FROM s23_expected_relation ORDER BY relation_name
  LOOP
    IF to_regclass(v_relation) IS NULL THEN
      RAISE EXCEPTION 'required client relation missing: %', v_relation;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_class
      WHERE oid = to_regclass(v_relation)
        AND relkind IN ('r', 'p')
        AND relrowsecurity
    ) THEN
      RAISE EXCEPTION 'required RLS base table mismatch: %', v_relation;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_policy
      WHERE polrelid = to_regclass(v_relation)
        AND polname = 'active_membership_required'
    ) THEN
      RAISE EXCEPTION 'S2.3 policy already exists on %', v_relation;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE COALESCE(pg_get_expr(polqual, polrelid), '')
            LIKE '%private.is_active_member()%'
       OR COALESCE(pg_get_expr(polwithcheck, polrelid), '')
            LIKE '%private.is_active_member()%'
  ) THEN
    RAISE EXCEPTION 'unexpected predecessor membership policy drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'odds_snapshots_public'
      AND c.relkind = 'v'
      AND c.reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'odds_snapshots_public security-invoker contract drift';
  END IF;
END
$preflight$;

-- Persist exact OID/owner/ACL/config state so postflight proves that
-- CREATE OR REPLACE changed only reviewed bodies.
CREATE TEMP TABLE s23_rpc_before ON COMMIT DROP AS
SELECT
  expected.signature,
  p.oid,
  p.proowner,
  p.proacl,
  p.proconfig
FROM s23_expected_rpc AS expected
JOIN pg_proc AS p ON p.oid = to_regprocedure(expected.signature);

-- ── 2. Restrictive membership composition for Data API ──────

CREATE POLICY active_membership_required
  ON public.ai_analysis_runs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

CREATE POLICY active_membership_required
  ON public.bankroll_transactions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

CREATE POLICY active_membership_required
  ON public.bankrolls
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

CREATE POLICY active_membership_required
  ON public.bet_legs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

CREATE POLICY active_membership_required
  ON public.beta_feedback
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

CREATE POLICY active_membership_required
  ON public.bets
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

CREATE POLICY active_membership_required
  ON public.canonical_fixtures
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

CREATE POLICY active_membership_required
  ON public.coaching_sessions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

CREATE POLICY active_membership_required
  ON public.decisions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

CREATE POLICY active_membership_required
  ON public.global_config
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

CREATE POLICY active_membership_required
  ON public.market_catalog
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

CREATE POLICY active_membership_required
  ON public.market_opportunities
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

-- odds_snapshots_public is a SECURITY INVOKER view. Gating its base
-- table closes both the view and direct nine-column base projection.
CREATE POLICY active_membership_required
  ON public.odds_snapshots
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

CREATE POLICY active_membership_required
  ON public.profiles
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

CREATE POLICY active_membership_required
  ON public.tennis_series
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

CREATE POLICY active_membership_required
  ON public.tennis_series_steps
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.is_active_member()))
  WITH CHECK ((SELECT private.is_active_member()));

-- ── 3. Authenticated SECURITY DEFINER RPC assertions ─────────

CREATE OR REPLACE FUNCTION public.adjust_bankroll(
  p_type            text,
  p_amount          numeric,
  p_note            text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id     uuid := auth.uid();
  v_bankroll_id uuid;
  v_balance     numeric;
  v_new_balance numeric;
  v_delta       numeric;
  v_note        text;
  v_tx_id       uuid;
  v_existing    record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF private.is_active_member() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'inactive_membership'
      USING ERRCODE = '42501';
  END IF;

  IF p_type NOT IN ('deposit', 'withdrawal') THEN
    RAISE EXCEPTION 'Unsupported transaction type';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF p_amount > 100000000 THEN
    RAISE EXCEPTION 'Amount exceeds sanity limit';
  END IF;

  IF p_idempotency_key IS NULL
     OR p_idempotency_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;

  v_note := NULLIF(trim(p_note), '');
  IF length(v_note) > 200 THEN
    RAISE EXCEPTION 'Note too long';
  END IF;

  v_delta := CASE WHEN p_type = 'withdrawal' THEN -p_amount ELSE p_amount END;

  -- Lock the default bankroll row first so concurrent operations for
  -- one user serialize before the payload-bound replay lookup.
  SELECT id, balance INTO v_bankroll_id, v_balance
  FROM bankrolls
  WHERE user_id = v_user_id AND is_default = true
  LIMIT 1
  FOR UPDATE;

  IF v_bankroll_id IS NULL THEN
    RAISE EXCEPTION 'No default bankroll found';
  END IF;

  SELECT id, balance_after, type, amount, metadata->>'note' AS note
  INTO v_existing
  FROM bankroll_transactions
  WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.type IS DISTINCT FROM p_type
       OR v_existing.amount IS DISTINCT FROM v_delta
       OR COALESCE(v_existing.note, '') IS DISTINCT FROM COALESCE(v_note, '') THEN
      RAISE EXCEPTION 'Idempotency conflict';
    END IF;

    RETURN jsonb_build_object(
      'transaction_id', v_existing.id,
      'balance',        v_existing.balance_after,
      'replayed',       true
    );
  END IF;

  IF p_type = 'withdrawal' AND v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  v_new_balance := v_balance + v_delta;

  UPDATE bankrolls SET balance = v_new_balance
  WHERE id = v_bankroll_id AND user_id = v_user_id;

  INSERT INTO bankroll_transactions (
    user_id, bankroll_id, type, amount, balance_after, metadata, idempotency_key
  ) VALUES (
    v_user_id, v_bankroll_id, p_type, v_delta, v_new_balance,
    jsonb_strip_nulls(jsonb_build_object(
      'note',             v_note,
      'previous_balance', v_balance
    )),
    p_idempotency_key
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'transaction_id', v_tx_id,
    'balance',        v_new_balance,
    'replayed',       false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_pending_bet(
  p_bet_id          uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id        uuid := auth.uid();
  v_key            text;
  v_bet            public.bets%ROWTYPE;
  v_balance        numeric;
  v_new_balance    numeric;
  v_stake_tx_count integer;
  v_refund_tx      public.bankroll_transactions%ROWTYPE;
  v_key_tx         public.bankroll_transactions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF private.is_active_member() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'inactive_membership'
      USING ERRCODE = '42501';
  END IF;

  IF p_bet_id IS NULL THEN
    RAISE EXCEPTION 'invalid_bet_id';
  END IF;

  IF p_idempotency_key IS NULL
     OR p_idempotency_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;
  v_key := lower(p_idempotency_key);

  SELECT * INTO v_bet
  FROM public.bets
  WHERE id = p_bet_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bet_not_found';
  END IF;

  SELECT * INTO v_key_tx
  FROM public.bankroll_transactions
  WHERE user_id = v_user_id
    AND lower(idempotency_key) = v_key;

  IF FOUND THEN
    IF v_key_tx.type IS DISTINCT FROM 'payout'
       OR v_key_tx.bet_id IS DISTINCT FROM p_bet_id
       OR v_key_tx.metadata ->> 'action' IS DISTINCT FROM 'tracker_cancel' THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;

    RETURN jsonb_build_object(
      'bet_id',        p_bet_id,
      'refund_amount', v_key_tx.amount,
      'balance',       v_key_tx.balance_after,
      'replayed',      true
    );
  END IF;

  IF v_bet.archived_at IS NOT NULL THEN
    SELECT * INTO v_refund_tx
    FROM public.bankroll_transactions
    WHERE user_id = v_user_id
      AND bet_id = p_bet_id
      AND type = 'payout'
      AND metadata ->> 'action' = 'tracker_cancel';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'already_archived';
    END IF;

    RETURN jsonb_build_object(
      'bet_id',        p_bet_id,
      'refund_amount', v_refund_tx.amount,
      'balance',       v_refund_tx.balance_after,
      'replayed',      true
    );
  END IF;

  IF v_bet.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'bet_not_cancellable';
  END IF;

  IF v_bet.bankroll_id IS NULL THEN
    RAISE EXCEPTION 'refund_bankroll_missing';
  END IF;

  SELECT balance INTO v_balance
  FROM public.bankrolls
  WHERE id = v_bet.bankroll_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_bankroll_missing';
  END IF;

  SELECT count(*) INTO v_stake_tx_count
  FROM public.bankroll_transactions
  WHERE user_id = v_user_id
    AND bankroll_id = v_bet.bankroll_id
    AND bet_id = p_bet_id
    AND type = 'stake'
    AND amount = -v_bet.stake;

  IF v_stake_tx_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'stake_ledger_mismatch';
  END IF;

  v_new_balance := v_balance + v_bet.stake;

  UPDATE public.bets
  SET status = 'void',
      settlement_outcome = 'void',
      pnl = 0,
      settled_at = now(),
      archived_at = now(),
      updated_at = now()
  WHERE id = p_bet_id
    AND user_id = v_user_id;

  UPDATE public.bet_legs
  SET leg_status = 'void',
      updated_at = now()
  WHERE bet_id = p_bet_id;

  UPDATE public.bankrolls
  SET balance = v_new_balance
  WHERE id = v_bet.bankroll_id
    AND user_id = v_user_id;

  INSERT INTO public.bankroll_transactions (
    user_id,
    bankroll_id,
    bet_id,
    type,
    amount,
    balance_after,
    metadata,
    idempotency_key
  ) VALUES (
    v_user_id,
    v_bet.bankroll_id,
    p_bet_id,
    'payout',
    v_bet.stake,
    v_new_balance,
    jsonb_build_object(
      'action',           'tracker_cancel',
      'previous_balance', v_balance,
      'audit_retained',   true
    ),
    v_key
  )
  RETURNING * INTO v_refund_tx;

  RETURN jsonb_build_object(
    'bet_id',        p_bet_id,
    'refund_amount', v_bet.stake,
    'balance',       v_new_balance,
    'replayed',      false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF private.is_active_member() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'inactive_membership'
      USING ERRCODE = '42501';
  END IF;

  UPDATE profiles SET
    onboarding_completed = true,
    onboarding_stage     = 'completed',
    updated_at           = now()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN jsonb_build_object('onboarding_completed', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_user_settings(
  p_display_name       text DEFAULT NULL,
  p_currency           text DEFAULT NULL,
  p_default_stake      numeric DEFAULT NULL,
  p_kelly_fraction     numeric DEFAULT NULL,
  p_web_search_enabled boolean DEFAULT NULL,
  p_timezone           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_rows    integer;
  v_profile jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF private.is_active_member() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'inactive_membership'
      USING ERRCODE = '42501';
  END IF;

  IF p_display_name IS NULL AND p_currency IS NULL AND p_default_stake IS NULL
     AND p_kelly_fraction IS NULL AND p_web_search_enabled IS NULL
     AND p_timezone IS NULL THEN
    RAISE EXCEPTION 'No fields provided';
  END IF;

  IF p_display_name IS NOT NULL AND length(p_display_name) > 50 THEN
    RAISE EXCEPTION 'Display name too long';
  END IF;
  IF p_currency IS NOT NULL
     AND p_currency NOT IN ('USD', 'EUR', 'UAH', 'GBP', 'CAD', 'AUD') THEN
    RAISE EXCEPTION 'Unsupported currency';
  END IF;
  IF p_default_stake IS NOT NULL
     AND (p_default_stake < 0.01 OR p_default_stake > 100000) THEN
    RAISE EXCEPTION 'Default stake out of range';
  END IF;
  IF p_kelly_fraction IS NOT NULL
     AND (p_kelly_fraction < 0.1 OR p_kelly_fraction > 1.0) THEN
    RAISE EXCEPTION 'Kelly fraction out of range';
  END IF;
  IF p_timezone IS NOT NULL AND length(p_timezone) > 100 THEN
    RAISE EXCEPTION 'Timezone too long';
  END IF;

  UPDATE profiles SET
    display_name       = COALESCE(p_display_name, display_name),
    currency           = COALESCE(p_currency, currency),
    default_stake      = COALESCE(p_default_stake, default_stake),
    kelly_fraction     = COALESCE(p_kelly_fraction, kelly_fraction),
    web_search_enabled = COALESCE(p_web_search_enabled, web_search_enabled),
    timezone           = COALESCE(p_timezone, timezone),
    updated_at         = now()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF p_currency IS NOT NULL THEN
    UPDATE bankrolls SET currency = p_currency
    WHERE user_id = v_user_id AND is_default = true;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      RAISE EXCEPTION 'No default bankroll found';
    END IF;
    IF v_rows > 1 THEN
      RAISE EXCEPTION 'Multiple default bankrolls';
    END IF;
  END IF;

  SELECT to_jsonb(p) INTO v_profile FROM profiles p WHERE p.id = v_user_id;
  RETURN v_profile;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_decision_action(
  p_decision_id  uuid,
  p_final_action text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id        uuid := auth.uid();
  v_current_action text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF private.is_active_member() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'inactive_membership'
      USING ERRCODE = '42501';
  END IF;

  IF p_final_action NOT IN ('skipped', 'watchlisted', 'pending', 'ignored') THEN
    RAISE EXCEPTION 'Invalid final_action value: %', p_final_action;
  END IF;

  SELECT final_action INTO v_current_action FROM decisions
  WHERE id = p_decision_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found or does not belong to user';
  END IF;

  IF v_current_action = 'placed' THEN
    RAISE EXCEPTION 'Cannot change action on a placed decision';
  END IF;

  UPDATE decisions
  SET final_action = p_final_action, updated_at = now()
  WHERE id = p_decision_id AND user_id = v_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_bet(
  p_bet_id  uuid,
  p_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id     uuid := auth.uid();
  v_bet         bets%ROWTYPE;
  v_pnl         numeric;
  v_payout      numeric;
  v_new_balance numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF private.is_active_member() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'inactive_membership'
      USING ERRCODE = '42501';
  END IF;

  IF p_outcome NOT IN ('won','lost','void') THEN
    RAISE EXCEPTION 'invalid_outcome';
  END IF;

  SELECT * INTO v_bet
  FROM bets
  WHERE id = p_bet_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bet_not_found';
  END IF;

  IF v_bet.status != 'pending' THEN
    RAISE EXCEPTION 'already_settled';
  END IF;

  IF p_outcome = 'won' THEN
    v_pnl    := v_bet.stake * (v_bet.total_odds - 1);
    v_payout := v_bet.stake * v_bet.total_odds;
  ELSIF p_outcome = 'lost' THEN
    v_pnl    := -v_bet.stake;
    v_payout := 0;
  ELSE
    v_pnl    := 0;
    v_payout := v_bet.stake;
  END IF;

  UPDATE bets
  SET status             = p_outcome,
      settled_at         = now(),
      settlement_outcome = p_outcome,
      pnl                = v_pnl,
      updated_at         = now()
  WHERE id = p_bet_id AND user_id = v_user_id;

  UPDATE bet_legs
  SET leg_status = p_outcome,
      updated_at = now()
  WHERE bet_id = p_bet_id;

  IF p_outcome IN ('won','void') AND v_bet.bankroll_id IS NOT NULL THEN
    UPDATE bankrolls
    SET balance = balance + v_payout
    WHERE id = v_bet.bankroll_id AND user_id = v_user_id
    RETURNING balance INTO v_new_balance;

    INSERT INTO bankroll_transactions (
      user_id, bankroll_id, bet_id, type, amount, balance_after
    ) VALUES (
      v_user_id, v_bet.bankroll_id, p_bet_id,
      'payout', v_payout, v_new_balance
    );
  END IF;

  IF p_outcome = 'lost' AND v_bet.bankroll_id IS NOT NULL THEN
    SELECT balance INTO v_new_balance
    FROM bankrolls
    WHERE id = v_bet.bankroll_id AND user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'bet_id',      p_bet_id,
    'outcome',     p_outcome,
    'pnl',         v_pnl,
    'new_balance', v_new_balance
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_opportunity_status(
  p_opportunity_id     uuid,
  p_status             text,
  p_linked_decision_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id        uuid := auth.uid();
  v_current_status text;
  v_current_link   uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF private.is_active_member() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'inactive_membership'
      USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('watchlisted','dismissed','converted_to_decision') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  SELECT status, linked_decision_id
  INTO v_current_status, v_current_link
  FROM market_opportunities
  WHERE id = p_opportunity_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity_not_found';
  END IF;

  IF v_current_status = 'converted_to_decision' THEN
    IF p_status = 'converted_to_decision'
       AND p_linked_decision_id IS NOT NULL
       AND p_linked_decision_id = v_current_link THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'invalid_transition';
  END IF;
  IF v_current_status IN ('dismissed','expired') THEN
    RAISE EXCEPTION 'invalid_transition';
  END IF;

  IF p_status = 'converted_to_decision' THEN
    IF p_linked_decision_id IS NULL THEN
      RAISE EXCEPTION 'link_required';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM decisions
      WHERE id = p_linked_decision_id
        AND user_id = v_user_id
        AND source = 'ai_analyst'
    ) THEN
      RAISE EXCEPTION 'invalid_link';
    END IF;

    UPDATE market_opportunities SET
      status             = 'converted_to_decision',
      linked_decision_id = p_linked_decision_id,
      updated_at         = now()
    WHERE id = p_opportunity_id AND user_id = v_user_id;
  ELSE
    IF p_linked_decision_id IS NOT NULL THEN
      RAISE EXCEPTION 'link_not_allowed';
    END IF;

    UPDATE market_opportunities SET
      status     = p_status,
      updated_at = now()
    WHERE id = p_opportunity_id AND user_id = v_user_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_tracked_bet(
  p_legs            jsonb,
  p_total_odds      numeric DEFAULT NULL,
  p_stake           numeric DEFAULT NULL,
  p_bookmaker       text    DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  p_source          text    DEFAULT 'manual',
  p_idempotency_key text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id        uuid := auth.uid();
  v_bankroll_id    uuid;
  v_balance        numeric;
  v_new_balance    numeric;
  v_bet_id         uuid;
  v_bet_type       text;
  v_total_odds     numeric;
  v_leg            jsonb;
  v_leg_count      integer;
  v_i              integer;
  v_key            text;
  v_odds           numeric;
  v_stake          numeric;
  v_bookmaker      text;
  v_notes          text;
  v_idempotency_key text;
  v_normalized_legs jsonb := '[]'::jsonb;
  v_request_hash   text;
  v_existing       record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF private.is_active_member() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'inactive_membership'
      USING ERRCODE = '42501';
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('manual', 'scanner') THEN
    RAISE EXCEPTION 'Unsupported source';
  END IF;

  IF p_idempotency_key IS NULL
     OR p_idempotency_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;
  v_idempotency_key := lower(p_idempotency_key);

  v_stake := trim_scale(p_stake);
  IF v_stake IS NULL OR v_stake <= 0 THEN
    RAISE EXCEPTION 'Stake must be positive';
  END IF;
  IF v_stake > 100000000 THEN
    RAISE EXCEPTION 'Stake exceeds sanity limit';
  END IF;

  v_bookmaker := NULLIF(trim(p_bookmaker), '');
  IF length(v_bookmaker) > 100 THEN
    RAISE EXCEPTION 'Bookmaker too long';
  END IF;

  v_notes := NULLIF(trim(p_notes), '');
  IF length(v_notes) > 500 THEN
    RAISE EXCEPTION 'Notes too long';
  END IF;

  IF p_legs IS NULL OR jsonb_typeof(p_legs) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Legs must be an array';
  END IF;

  v_leg_count := jsonb_array_length(p_legs);
  IF v_leg_count < 1 OR v_leg_count > 20 THEN
    RAISE EXCEPTION 'Legs must contain between 1 and 20 entries';
  END IF;

  FOR v_i IN 0 .. v_leg_count - 1 LOOP
    v_leg := p_legs -> v_i;

    IF jsonb_typeof(v_leg) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Leg % must be an object', v_i + 1;
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(v_leg) LOOP
      IF v_key NOT IN ('sport', 'event_name', 'market_type', 'selection', 'odds') THEN
        RAISE EXCEPTION 'Leg % has unknown field %', v_i + 1, v_key;
      END IF;
    END LOOP;

    IF jsonb_typeof(v_leg -> 'sport') IS DISTINCT FROM 'string'
       OR v_leg ->> 'sport' NOT IN (
         'soccer', 'tennis', 'basketball', 'ice_hockey', 'cs2', 'mma', 'other'
       ) THEN
      RAISE EXCEPTION 'Leg % has invalid sport', v_i + 1;
    END IF;

    IF jsonb_typeof(v_leg -> 'event_name') IS DISTINCT FROM 'string'
       OR NULLIF(trim(v_leg ->> 'event_name'), '') IS NULL
       OR length(trim(v_leg ->> 'event_name')) > 200 THEN
      RAISE EXCEPTION 'Leg % has invalid event_name', v_i + 1;
    END IF;

    IF jsonb_typeof(v_leg -> 'market_type') IS DISTINCT FROM 'string'
       OR NULLIF(trim(v_leg ->> 'market_type'), '') IS NULL
       OR length(trim(v_leg ->> 'market_type')) > 100 THEN
      RAISE EXCEPTION 'Leg % has invalid market_type', v_i + 1;
    END IF;

    IF v_leg ? 'selection'
       AND jsonb_typeof(v_leg -> 'selection') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'Leg % has invalid selection', v_i + 1;
    END IF;
    IF jsonb_typeof(v_leg -> 'selection') = 'string'
       AND length(trim(v_leg ->> 'selection')) > 200 THEN
      RAISE EXCEPTION 'Leg % has invalid selection', v_i + 1;
    END IF;

    IF jsonb_typeof(v_leg -> 'odds') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Leg % has invalid odds', v_i + 1;
    END IF;
    v_odds := trim_scale((v_leg ->> 'odds')::numeric);
    IF v_odds <= 1 OR v_odds > 10000 THEN
      RAISE EXCEPTION 'Leg % odds must be greater than 1', v_i + 1;
    END IF;

    v_normalized_legs := v_normalized_legs || jsonb_build_object(
      'sport',       v_leg ->> 'sport',
      'event_name',  trim(v_leg ->> 'event_name'),
      'market_type', trim(v_leg ->> 'market_type'),
      'selection',   NULLIF(trim(v_leg ->> 'selection'), ''),
      'odds',        v_odds
    );
  END LOOP;

  IF v_leg_count = 1 THEN
    v_bet_type   := 'single';
    v_total_odds := trim_scale((v_normalized_legs -> 0 ->> 'odds')::numeric);
    IF p_total_odds IS NOT NULL
       AND trim_scale(p_total_odds) IS DISTINCT FROM v_total_odds THEN
      RAISE EXCEPTION 'total_odds must match the single leg odds';
    END IF;
  ELSE
    v_bet_type := 'parlay';
    IF p_total_odds IS NULL THEN
      RAISE EXCEPTION 'total_odds is required for a parlay';
    END IF;
    v_total_odds := trim_scale(p_total_odds);
    IF v_total_odds <= 1 OR v_total_odds > 100000000 THEN
      RAISE EXCEPTION 'total_odds out of bounds';
    END IF;
  END IF;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'legs',       v_normalized_legs,
    'total_odds', v_total_odds,
    'stake',      v_stake,
    'bookmaker',  v_bookmaker,
    'notes',      v_notes,
    'source',     p_source
  )::text, 'UTF8')), 'hex');

  SELECT id, balance INTO v_bankroll_id, v_balance
  FROM public.bankrolls
  WHERE user_id = v_user_id AND is_default = true
  LIMIT 1
  FOR UPDATE;

  IF v_bankroll_id IS NULL THEN
    RAISE EXCEPTION 'No default bankroll found';
  END IF;

  SELECT id, bet_id, type, balance_after, metadata->>'request_hash' AS request_hash
  INTO v_existing
  FROM public.bankroll_transactions
  WHERE user_id = v_user_id
    AND lower(idempotency_key) = v_idempotency_key;

  IF FOUND THEN
    IF v_existing.type IS DISTINCT FROM 'stake'
       OR v_existing.bet_id IS NULL
       OR v_existing.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'Idempotency conflict';
    END IF;

    RETURN jsonb_build_object(
      'bet_id',   v_existing.bet_id,
      'balance',  v_existing.balance_after,
      'replayed', true
    );
  END IF;

  IF v_balance < v_stake THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  INSERT INTO public.bets (
    user_id, bankroll_id, bet_type, stake, total_odds,
    potential_payout, status, bookmaker, source, notes
  ) VALUES (
    v_user_id, v_bankroll_id, v_bet_type, v_stake, v_total_odds,
    v_stake * v_total_odds, 'pending', v_bookmaker, p_source, v_notes
  )
  RETURNING id INTO v_bet_id;

  FOR v_i IN 0 .. v_leg_count - 1 LOOP
    v_leg := v_normalized_legs -> v_i;
    INSERT INTO public.bet_legs (
      bet_id, sport, event_name, market_type,
      selection, odds, leg_status, leg_index
    ) VALUES (
      v_bet_id,
      v_leg ->> 'sport',
      v_leg ->> 'event_name',
      v_leg ->> 'market_type',
      v_leg ->> 'selection',
      (v_leg ->> 'odds')::numeric,
      'pending',
      v_i + 1
    );
  END LOOP;

  v_new_balance := v_balance - v_stake;

  UPDATE public.bankrolls SET balance = v_new_balance
  WHERE id = v_bankroll_id AND user_id = v_user_id;

  INSERT INTO public.bankroll_transactions (
    user_id, bankroll_id, bet_id, type,
    amount, balance_after, metadata, idempotency_key
  ) VALUES (
    v_user_id, v_bankroll_id, v_bet_id, 'stake',
    -v_stake, v_new_balance,
    jsonb_build_object(
      'request_hash', v_request_hash,
      'source',       p_source,
      'leg_count',    v_leg_count
    ),
    v_idempotency_key
  );

  RETURN jsonb_build_object(
    'bet_id',   v_bet_id,
    'balance',  v_new_balance,
    'replayed', false
  );
END;
$function$;

-- Reassert the exact reviewed callable surface after replacing the bodies.
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

-- ── 4. Postflight: no widened or drifted boundary ────────────

DO $postflight$
DECLARE
  v_authenticated oid := (SELECT oid FROM pg_roles WHERE rolname = 'authenticated');
  v_service_role oid := (SELECT oid FROM pg_roles WHERE rolname = 'service_role');
  v_before record;
  v_function regprocedure;
BEGIN
  IF (
    SELECT count(*)
    FROM pg_policy AS p
    JOIN pg_class AS c ON c.oid = p.polrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.polname = 'active_membership_required'
      AND c.relrowsecurity
      AND NOT p.polpermissive
      AND p.polcmd = '*'
      AND p.polroles = ARRAY[v_authenticated]
      AND pg_get_expr(p.polqual, p.polrelid)
            = '( SELECT private.is_active_member() AS is_active_member)'
      AND pg_get_expr(p.polwithcheck, p.polrelid)
            = '( SELECT private.is_active_member() AS is_active_member)'
  ) IS DISTINCT FROM 16 THEN
    RAISE EXCEPTION 'S2.3 restrictive policy catalog mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policy AS p
    JOIN pg_class AS c ON c.oid = p.polrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE p.polname = 'active_membership_required'
      AND (n.nspname, c.relname) NOT IN (
        ('public', 'ai_analysis_runs'),
        ('public', 'bankroll_transactions'),
        ('public', 'bankrolls'),
        ('public', 'bet_legs'),
        ('public', 'beta_feedback'),
        ('public', 'bets'),
        ('public', 'canonical_fixtures'),
        ('public', 'coaching_sessions'),
        ('public', 'decisions'),
        ('public', 'global_config'),
        ('public', 'market_catalog'),
        ('public', 'market_opportunities'),
        ('public', 'odds_snapshots'),
        ('public', 'profiles'),
        ('public', 'tennis_series'),
        ('public', 'tennis_series_steps')
      )
  ) THEN
    RAISE EXCEPTION 'unexpected S2.3 policy relation';
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
    SELECT relation_name FROM s23_expected_relation
  ) OR EXISTS (
    SELECT relation_name FROM s23_expected_relation
    EXCEPT
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
  ) THEN
    RAISE EXCEPTION 'authenticated Data API base relation inventory widened';
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
    SELECT relation_name FROM s23_expected_non_table_relation
  ) OR EXISTS (
    SELECT relation_name FROM s23_expected_non_table_relation
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
    RAISE EXCEPTION 'authenticated Data API non-table relation inventory widened';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'odds_snapshots_public'
      AND c.relkind = 'v'
      AND c.reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'odds_snapshots_public postflight execution-mode drift';
  END IF;

  FOR v_before IN SELECT * FROM s23_rpc_before ORDER BY signature LOOP
    v_function := to_regprocedure(v_before.signature);

    IF v_function IS NULL OR v_function::oid IS DISTINCT FROM v_before.oid THEN
      RAISE EXCEPTION 'RPC identity drift: %', v_before.signature;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc AS p
      WHERE p.oid = v_function
        AND p.proowner = v_before.proowner
        AND p.prokind = 'f'
        AND p.prosecdef
        AND p.provolatile = 'v'
        AND p.proconfig IS NOT DISTINCT FROM v_before.proconfig
        AND (
          length(p.prosrc)
          - length(replace(p.prosrc, 'private.is_active_member()', ''))
        ) / length('private.is_active_member()') = 1
        AND position('IF v_user_id IS NULL THEN' in p.prosrc) > 0
        AND position('private.is_active_member()' in p.prosrc)
              > position('IF v_user_id IS NULL THEN' in p.prosrc)
    ) THEN
      RAISE EXCEPTION 'RPC postflight body or catalog mismatch: %', v_before.signature;
    END IF;

    IF (
         SELECT count(*)
         FROM pg_proc AS p
         CROSS JOIN LATERAL aclexplode(
           COALESCE(p.proacl, acldefault('f', p.proowner))
         ) AS acl
         WHERE p.oid = v_function
           AND acl.privilege_type = 'EXECUTE'
           AND acl.grantee IN (v_authenticated, v_service_role)
           AND NOT acl.is_grantable
       ) IS DISTINCT FROM 2
       OR EXISTS (
         SELECT 1
         FROM pg_proc AS p
         CROSS JOIN LATERAL aclexplode(
           COALESCE(p.proacl, acldefault('f', p.proowner))
         ) AS acl
         WHERE p.oid = v_function
           AND acl.privilege_type = 'EXECUTE'
           AND acl.grantee <> p.proowner
           AND (
             acl.grantee NOT IN (v_authenticated, v_service_role)
             OR acl.is_grantable
           )
       ) THEN
      RAISE EXCEPTION 'RPC postflight ACL mismatch: %', v_before.signature;
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) IS DISTINCT FROM 8 THEN
    RAISE EXCEPTION 'authenticated definer inventory widened';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE p.oid = 'private.is_active_member()'::regprocedure
      AND n.nspname = 'private'
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND p.prosecdef
      AND p.provolatile = 's'
      AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
      AND md5(p.prosrc) = '6f30a1cd84e1603a817971a3b3798541'
  ) OR (
    SELECT count(*)
    FROM pg_proc AS p
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE p.oid = 'private.is_active_member()'::regprocedure
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee IN (v_authenticated, v_service_role)
      AND NOT acl.is_grantable
  ) IS DISTINCT FROM 2 OR EXISTS (
    SELECT 1
    FROM pg_proc AS p
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE p.oid = 'private.is_active_member()'::regprocedure
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee <> p.proowner
      AND (
        acl.grantee NOT IN (v_authenticated, v_service_role)
        OR acl.is_grantable
      )
  ) THEN
    RAISE EXCEPTION 'membership helper changed unexpectedly';
  END IF;
END
$postflight$;

COMMIT;
