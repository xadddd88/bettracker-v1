-- ============================================================
-- Migration 024: create_tracked_bet() — Decision #060 Phase A
--
-- REVIEW ONLY — do NOT apply automatically.
-- This migration is NOT applied to production by the Phase A PR.
-- Apply manually in Supabase SQL Editor only after CPO accept,
-- merge, and a separate application/verification authorization.
--
-- Purpose: the atomic foundation for the future unified
-- Single/Express tracker form (Coupon-to-Tracker). A tracked bet
-- is a pure tracker entry — it never creates a Decision row and
-- carries no AI/pricing semantics. Phase B (UI/API adoption) is a
-- separate PR with a separate CPO approval under the SAME Decision
-- #060 after this migration is applied and verified.
--
-- Contract (Decision #060 Phase A):
--   * identity ONLY from auth.uid(); default bankroll only;
--   * legs jsonb array of 1..20; unknown leg keys and wrong types
--     fail closed; legs are canonically normalized before hashing
--     and insertion; leg order preserved via bet_legs.leg_index
--     (CHECK 1..20 + partial UNIQUE (bet_id, leg_index));
--   * each leg: canonical sport, event_name, market_type,
--     optional selection, odds > 1;
--   * 1 leg  → bet_type='single', total_odds taken from leg odds;
--   * 2..20  → bet_type='parlay', p_total_odds required;
--   * bankroll row locked FOR UPDATE; no-overdraft guard;
--   * bet + all legs + balance update + stake transaction in ONE
--     transaction (single plpgsql function body);
--   * strict payload-bound idempotency via the existing
--     bankroll_transactions.idempotency_key unique index (016):
--     same key + same normalized payload → original bet_id,
--     replayed=true, no second deduction; same key + different
--     payload → 'Idempotency conflict', zero writes;
--   * transaction metadata: ONLY request_hash, source, leg_count —
--     never event names, raw coupon text, status/score text, or
--     screenshots;
--   * no new direct DML grants on bets/bet_legs/bankrolls/
--     bankroll_transactions (Decision #048 boundary unchanged).
-- ============================================================

-- ── 1. Additive column: preserve leg order ────────────────────
-- bet_legs has no ordering column; UUID ids and same-timestamp
-- created_at cannot guarantee coupon order. Nullable and additive:
-- existing rows keep NULL, only create_tracked_bet() populates it.
ALTER TABLE public.bet_legs
  ADD COLUMN IF NOT EXISTS leg_index integer
    CHECK (leg_index IS NULL OR leg_index BETWEEN 1 AND 20);

-- One position per bet: duplicate leg_index values inside the same
-- bet are impossible. Partial: legacy NULL rows stay untouched.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bet_legs_bet_leg_index
  ON public.bet_legs (bet_id, leg_index)
  WHERE leg_index IS NOT NULL;

COMMENT ON COLUMN public.bet_legs.leg_index IS
  'Ordinal position of the leg inside its bet (1-based). Populated by create_tracked_bet() (Decision #060); NULL for legacy rows.';

-- ── 2. create_tracked_bet() ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_tracked_bet(
  p_legs            jsonb,
  p_total_odds      numeric DEFAULT NULL,
  p_stake           numeric DEFAULT NULL,
  p_bookmaker       text    DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  p_source          text    DEFAULT 'manual',
  p_idempotency_key text    DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_bankroll_id  uuid;
  v_balance      numeric;
  v_new_balance  numeric;
  v_bet_id       uuid;
  v_bet_type     text;
  v_total_odds   numeric;
  v_leg             jsonb;
  v_leg_count       integer;
  v_i               integer;
  v_key             text;
  v_odds            numeric;
  v_stake           numeric;
  v_bookmaker       text;
  v_notes           text;
  v_idempotency_key text;
  v_normalized_legs jsonb := '[]'::jsonb;
  v_request_hash    text;
  v_existing        record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ── Input validation: fail closed on anything unexpected ──
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

  -- Validate every leg BEFORE any write. Unknown keys fail closed.
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
       OR v_leg ->> 'sport' NOT IN ('soccer', 'tennis', 'basketball', 'ice_hockey', 'cs2', 'mma', 'other') THEN
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

    -- selection is nullable: absent and explicit JSON null are both
    -- accepted; when present as a string it is bounded.
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

    -- Canonical normalized leg: fixed key set, trimmed strings,
    -- selection collapsed to NULL when absent/null/empty, odds as
    -- numeric. Both the hash and the inserted rows use THIS form,
    -- so replay comparison is immune to whitespace/format noise.
    v_normalized_legs := v_normalized_legs || jsonb_build_object(
      'sport',       v_leg ->> 'sport',
      'event_name',  trim(v_leg ->> 'event_name'),
      'market_type', trim(v_leg ->> 'market_type'),
      'selection',   NULLIF(trim(v_leg ->> 'selection'), ''),
      'odds',        v_odds
    );
  END LOOP;

  -- ── single/parlay derivation ──
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

  -- Normalized payload hash binds the idempotency key to this
  -- exact request. Built from the CANONICAL legs form (not the raw
  -- input), so semantically equal payloads hash identically; jsonb
  -- text output has deterministic key order. SHA-256 via the
  -- PostgreSQL built-in sha256() (PG11+) — no extension dependency.
  -- IDs and hashes only — no coupon content leaves this function.
  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'legs',       v_normalized_legs,
    'total_odds', v_total_odds,
    'stake',      v_stake,
    'bookmaker',  v_bookmaker,
    'notes',      v_notes,
    'source',     p_source
  )::text, 'UTF8')), 'hex');

  -- Lock the default bankroll row FIRST (same discipline as
  -- adjust_bankroll in 016): concurrent calls for the same user
  -- serialize here, so the idempotency check below sees any
  -- transaction committed by an earlier holder of the lock.
  SELECT id, balance INTO v_bankroll_id, v_balance
  FROM public.bankrolls
  WHERE user_id = v_user_id AND is_default = true
  LIMIT 1
  FOR UPDATE;

  IF v_bankroll_id IS NULL THEN
    RAISE EXCEPTION 'No default bankroll found';
  END IF;

  -- Payload-bound idempotent replay (unique index
  -- uq_bankroll_tx_user_idempotency_key from 016 backstops this).
  -- STRICT replay: the stored transaction must be a stake created
  -- by this function (type='stake', non-null bet_id) AND carry the
  -- identical request hash. A key reused from any other operation
  -- (e.g. adjust_bankroll) or with any payload drift is a conflict
  -- with zero writes — never a silent replay.
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

  -- No-overdraft guard (Decision #047 policy): the stake may
  -- never take the locked balance below zero.
  IF v_balance < v_stake THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- ── Atomic writes: bet → legs → balance → stake transaction ──
  INSERT INTO public.bets (user_id, bankroll_id, bet_type, stake, total_odds, potential_payout, status, bookmaker, source, notes)
  VALUES (v_user_id, v_bankroll_id, v_bet_type, v_stake, v_total_odds, v_stake * v_total_odds, 'pending', v_bookmaker, p_source, v_notes)
  RETURNING id INTO v_bet_id;

  -- NOTE: deliberately NO INSERT INTO decisions — a tracked bet is
  -- a tracker entry, not an AI decision (Decision #060 contract).
  -- Legs are inserted from the canonical normalized form — the same
  -- values the request hash was computed over.
  FOR v_i IN 0 .. v_leg_count - 1 LOOP
    v_leg := v_normalized_legs -> v_i;
    INSERT INTO public.bet_legs (bet_id, sport, event_name, market_type, selection, odds, leg_status, leg_index)
    VALUES (
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
    user_id, bankroll_id, bet_id, type, amount, balance_after, metadata, idempotency_key
  ) VALUES (
    v_user_id, v_bankroll_id, v_bet_id, 'stake', -v_stake, v_new_balance,
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
$$;

REVOKE EXECUTE ON FUNCTION public.create_tracked_bet(jsonb, numeric, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_tracked_bet(jsonb, numeric, numeric, text, text, text, text) TO authenticated, service_role;

-- ── Catalog verification (run after applying) ────────────────
-- These checks are read-only and bind to the exact function signature.
-- 1. Function exists, SECURITY DEFINER, pinned search_path:
--    SELECT p.proname, p.prosecdef, p.proconfig
--    FROM pg_proc p
--    WHERE p.oid =
--      'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)'::regprocedure;
--    -- expect: prosecdef = true, proconfig = {search_path=""}
-- 2. EXECUTE surface is exactly authenticated + service_role:
--    SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC'
--                ELSE pg_get_userbyid(a.grantee) END AS grantee,
--           a.privilege_type
--    FROM pg_proc p
--    CROSS JOIN LATERAL aclexplode(
--      COALESCE(p.proacl, acldefault('f', p.proowner))
--    ) a
--    WHERE p.oid =
--      'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)'::regprocedure;
--    -- expect: authenticated/EXECUTE, service_role/EXECUTE, owner only;
--    -- no PUBLIC or anon EXECUTE row.
-- 3. leg_index column is present, nullable, integer:
--    SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'bet_legs'
--      AND column_name = 'leg_index';
-- 4. CHECK constraint and partial UNIQUE index are present:
--    SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.bet_legs'::regclass
--      AND pg_get_constraintdef(oid) ILIKE '%leg_index%';
--    SELECT indexname, indexdef FROM pg_indexes
--    WHERE schemaname = 'public' AND tablename = 'bet_legs'
--      AND indexname = 'uq_bet_legs_bet_leg_index';
--
-- Authenticated runtime smoke is deliberately NOT embedded here. It is a
-- separate, one-shot CPO-authorized step after production apply/catalog
-- verification. Disposable coverage lives in scripts/verify-migration-024.sh.
--
-- Emergency rollback: docs/decision-060-rollback.sql (kept OUTSIDE
-- supabase/migrations so it can never run as a forward migration).
