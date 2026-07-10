-- ============================================================
-- Migration 016: Atomic financial writes & no-overdraft policy
-- Decision #047 (CPO audit 2026-07-10, P0 items 2 and 3)
--
-- 1. adjust_bankroll() RPC — the ONLY approved user path for
--    deposit / withdrawal:
--    row lock (FOR UPDATE) → validate → funds guard → balance
--    update + transaction insert in ONE transaction, with
--    strict payload-bound idempotency (required UUID key).
--    Reconciliation 'adjustment' is NOT user-callable — it is a
--    separate future operator-controlled flow.
-- 2. set_user_currency() RPC — atomic profiles.currency +
--    default bankroll currency sync (replaces the two separate
--    unchecked UPDATEs in /api/settings).
-- 3. Funds guards in create_quick_bet() and
--    place_bet_from_decision(): a stake may never take the
--    bankroll below 0. Conditional locked subtraction —
--    concurrent placements serialize on the row lock and the
--    second re-evaluates against the decremented balance.
--
-- Overdraft policy (CPO 2026-07-10): FORBIDDEN.
--   - a new bet cannot take the bankroll below 0
--   - a withdrawal cannot take the bankroll below 0
--   - negative balance is not a credit limit
-- Historical negative bankroll: preserved as-is
-- (reconciliation_required). Stakes and withdrawals from it are
-- blocked automatically by the guards (negative < any positive
-- amount); deposits remain allowed for repair.
-- A hard CHECK (balance >= 0) is deliberately NOT added here —
-- it would fail validation against the existing negative row
-- and would reject partial repair deposits (-100 → -50). It is
-- added by a later migration after reconciliation.
--
-- NOTE: direct DML on financial tables is NOT revoked here —
-- that is Decision #048, which lands only after every active
-- caller is on these RPCs.
-- ============================================================

-- ── 1. Idempotency support ───────────────────────────────────

ALTER TABLE bankroll_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bankroll_tx_user_idempotency_key
  ON bankroll_transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 2. adjust_bankroll() ─────────────────────────────────────
-- Identity comes ONLY from auth.uid(). Amount is always a
-- positive number; the sign is derived from the type:
--   deposit    → +amount
--   withdrawal → -amount
-- The authenticated path supports deposit/withdrawal ONLY (CPO
-- review of PR #127): reconciliation 'adjustment' is a separate
-- future operator-controlled flow, never user-callable.
--
-- Strict idempotency: a UUID key is REQUIRED, and a replay is
-- bound to the original payload — the same key with a different
-- type/amount/note is a conflict with zero writes.

CREATE OR REPLACE FUNCTION adjust_bankroll(
  p_type            text,
  p_amount          numeric,
  p_note            text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- Lock the default bankroll row FIRST. Concurrent calls for
  -- the same user serialize here; the idempotency check below
  -- therefore sees any transaction committed by an earlier
  -- holder of the lock.
  SELECT id, balance INTO v_bankroll_id, v_balance
  FROM bankrolls
  WHERE user_id = v_user_id AND is_default = true
  LIMIT 1
  FOR UPDATE;

  IF v_bankroll_id IS NULL THEN
    RAISE EXCEPTION 'No default bankroll found';
  END IF;

  -- Idempotent replay, bound to the original payload: the same
  -- key returns the original result and never applies twice; the
  -- same key with a different payload is a conflict, zero writes.
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

  -- No-overdraft guard. A negative historical balance blocks
  -- every withdrawal automatically (negative < any positive
  -- amount) while deposits stay open for repair.
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
$$;

REVOKE EXECUTE ON FUNCTION adjust_bankroll(text, numeric, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION adjust_bankroll(text, numeric, text, text) TO authenticated, service_role;

-- ── 3. set_user_currency() ───────────────────────────────────
-- Atomic profiles.currency + default bankroll currency sync.

CREATE OR REPLACE FUNCTION set_user_currency(
  p_currency text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rows    integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_currency NOT IN ('USD', 'EUR', 'UAH', 'GBP', 'CAD', 'AUD') THEN
    RAISE EXCEPTION 'Unsupported currency';
  END IF;

  UPDATE profiles SET currency = p_currency WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Invariant (CPO review of PR #127): EXACTLY one default
  -- bankroll must take the new currency. Zero or multiple rows
  -- raise, which rolls the profile update back with it.
  UPDATE bankrolls SET currency = p_currency
  WHERE user_id = v_user_id AND is_default = true;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'No default bankroll found';
  END IF;
  IF v_rows > 1 THEN
    RAISE EXCEPTION 'Multiple default bankrolls';
  END IF;

  RETURN jsonb_build_object('currency', p_currency);
END;
$$;

REVOKE EXECUTE ON FUNCTION set_user_currency(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION set_user_currency(text) TO authenticated, service_role;

-- ── 4. create_quick_bet() with funds guard ───────────────────
-- Body identical to migration 001 except step 4: the balance
-- deduction is now a conditional locked subtraction, and the
-- exception rolls back the decision/bet/leg rows created above.

CREATE OR REPLACE FUNCTION create_quick_bet(
  p_bankroll_id   uuid,
  p_event_name    text,
  p_sport         text,
  p_market_type   text,
  p_selection     text,
  p_offered_odds  numeric,
  p_stake         numeric,
  p_bookmaker     text DEFAULT NULL,
  p_notes         text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_decision_id uuid;
  v_bet_id      uuid;
  v_new_balance numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_stake <= 0 THEN
    RAISE EXCEPTION 'Stake must be positive';
  END IF;
  IF p_offered_odds <= 1 THEN
    RAISE EXCEPTION 'Odds must be greater than 1';
  END IF;

  -- Resolve bankroll: validate ownership or find default
  IF p_bankroll_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM bankrolls WHERE id = p_bankroll_id AND user_id = v_user_id) THEN
      RAISE EXCEPTION 'Bankroll not found or does not belong to user';
    END IF;
  ELSE
    SELECT id INTO p_bankroll_id FROM bankrolls
    WHERE user_id = v_user_id AND is_default = true LIMIT 1;
    IF p_bankroll_id IS NULL THEN
      RAISE EXCEPTION 'No default bankroll found. Please contact support.';
    END IF;
  END IF;

  -- 1. Decision
  INSERT INTO decisions (user_id, event_name, sport, market_type, selection, offered_odds, bookmaker, source, final_action)
  VALUES (v_user_id, p_event_name, p_sport, p_market_type, p_selection, p_offered_odds, p_bookmaker, 'quick_entry', 'placed')
  RETURNING id INTO v_decision_id;

  -- 2. Bet
  INSERT INTO bets (user_id, bankroll_id, bet_type, stake, total_odds, potential_payout, status, bookmaker, source, notes)
  VALUES (v_user_id, p_bankroll_id, 'single', p_stake, p_offered_odds, p_stake * p_offered_odds, 'pending', p_bookmaker, 'quick_entry', p_notes)
  RETURNING id INTO v_bet_id;

  -- 3. BetLeg
  INSERT INTO bet_legs (bet_id, decision_id, sport, event_name, market_type, selection, odds, leg_status)
  VALUES (v_bet_id, v_decision_id, p_sport, p_event_name, p_market_type, p_selection, p_offered_odds, 'pending');

  -- 4. Deduct from bankroll — no-overdraft guard (Decision #047).
  -- Conditional locked subtraction: concurrent stakes serialize
  -- on the row lock and re-evaluate against the new balance.
  UPDATE bankrolls SET balance = balance - p_stake
  WHERE id = p_bankroll_id AND user_id = v_user_id AND balance >= p_stake
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- 5. Transaction record (balance_after NOT NULL)
  INSERT INTO bankroll_transactions (user_id, bankroll_id, bet_id, type, amount, balance_after)
  VALUES (v_user_id, p_bankroll_id, v_bet_id, 'stake', -p_stake, v_new_balance);

  RETURN jsonb_build_object('decision_id', v_decision_id, 'bet_id', v_bet_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION create_quick_bet(uuid, text, text, text, text, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION create_quick_bet(uuid, text, text, text, text, numeric, numeric, text, text) TO authenticated, service_role;

-- ── 5. place_bet_from_decision() with funds guard ────────────
-- Body identical to migration 002 except step 3 (same guard).

CREATE OR REPLACE FUNCTION place_bet_from_decision(
  p_decision_id   uuid,
  p_bankroll_id   uuid DEFAULT NULL,
  p_stake         numeric DEFAULT NULL,
  p_bookmaker     text DEFAULT NULL,
  p_notes         text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_decision    decisions%ROWTYPE;
  v_bankroll_id uuid := p_bankroll_id;
  v_bet_id      uuid;
  v_new_balance numeric;
  v_stake       numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Load and lock decision row — prevents concurrent double-bet
  SELECT * INTO v_decision FROM decisions
  WHERE id = p_decision_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found or does not belong to user';
  END IF;

  IF v_decision.final_action = 'placed' THEN
    RAISE EXCEPTION 'Decision already placed — duplicate bet rejected';
  END IF;

  IF EXISTS (SELECT 1 FROM bet_legs WHERE decision_id = p_decision_id) THEN
    RAISE EXCEPTION 'A bet already exists for this decision';
  END IF;

  IF v_decision.offered_odds IS NULL OR v_decision.offered_odds <= 1 THEN
    RAISE EXCEPTION 'Decision has no valid odds — cannot place bet';
  END IF;

  v_stake := COALESCE(p_stake, 0);
  IF v_stake <= 0 THEN
    RAISE EXCEPTION 'Stake must be positive';
  END IF;

  -- Resolve bankroll
  IF v_bankroll_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM bankrolls WHERE id = v_bankroll_id AND user_id = v_user_id) THEN
      RAISE EXCEPTION 'Bankroll not found or does not belong to user';
    END IF;
  ELSE
    SELECT id INTO v_bankroll_id FROM bankrolls
    WHERE user_id = v_user_id AND is_default = true LIMIT 1;
    IF v_bankroll_id IS NULL THEN
      RAISE EXCEPTION 'No default bankroll found';
    END IF;
  END IF;

  -- 1. Create bet
  INSERT INTO bets (
    user_id, bankroll_id, bet_type, stake, total_odds,
    potential_payout, status, bookmaker, source, notes
  ) VALUES (
    v_user_id, v_bankroll_id, 'single', v_stake, v_decision.offered_odds,
    v_stake * v_decision.offered_odds, 'pending',
    COALESCE(p_bookmaker, v_decision.bookmaker),
    'ai_analyst', p_notes
  )
  RETURNING id INTO v_bet_id;

  -- 2. Create bet_leg linked to decision
  INSERT INTO bet_legs (
    bet_id, decision_id, sport, event_name, market_type,
    selection, line, odds, leg_status
  ) VALUES (
    v_bet_id, p_decision_id, v_decision.sport, v_decision.event_name,
    v_decision.market_type, v_decision.selection, v_decision.line,
    v_decision.offered_odds, 'pending'
  );

  -- 3. Deduct from bankroll — no-overdraft guard (Decision #047).
  UPDATE bankrolls SET balance = balance - v_stake
  WHERE id = v_bankroll_id AND user_id = v_user_id AND balance >= v_stake
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- 4. Record transaction
  INSERT INTO bankroll_transactions (
    user_id, bankroll_id, bet_id, type, amount, balance_after
  ) VALUES (
    v_user_id, v_bankroll_id, v_bet_id, 'stake', -v_stake, v_new_balance
  );

  -- 5. Mark decision as placed
  UPDATE decisions SET final_action = 'placed', updated_at = now()
  WHERE id = p_decision_id AND user_id = v_user_id;

  RETURN jsonb_build_object('bet_id', v_bet_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION place_bet_from_decision(uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION place_bet_from_decision(uuid, uuid, numeric, text, text) TO authenticated, service_role;

-- ── Post-apply verification (run manually, safe, rolls back) ──
-- BEGIN;
--   -- funds guard: expect 'Insufficient balance' on absurd stake
--   -- SELECT create_quick_bet(NULL, 'T', 'soccer', '1X2', 'Home', 2.0, 999999999);
--   -- idempotent replay: second call returns replayed=true, same tx id
--   -- SELECT adjust_bankroll('deposit', 1, 'verify-016', '00000000-0000-4000-8000-000000000016');
--   -- SELECT adjust_bankroll('deposit', 1, 'verify-016', '00000000-0000-4000-8000-000000000016');
--   -- payload-bound conflict: expect 'Idempotency conflict'
--   -- SELECT adjust_bankroll('deposit', 2, 'verify-016', '00000000-0000-4000-8000-000000000016');
--   -- user-callable adjustment removed: expect 'Unsupported transaction type'
--   -- SELECT adjust_bankroll('adjustment', 1, NULL, '00000000-0000-4000-8000-000000000017');
-- ROLLBACK;
