-- ============================================================
-- Migration 025: tracked-leg fixture lineage foundation
-- Decision #064
--
-- REVIEW ONLY — DO NOT APPLY AUTOMATICALLY.
-- This migration is intentionally unapplied by the Decision #064
-- Draft PR. Applying it to Supabase requires a separate Founder/CPO
-- authorization, catalog verification, and authenticated smoke plan.
--
-- Scope:
--   * additive nullable lineage/snapshot columns on bet_legs;
--   * legacy/default representation: unresolved / legacy / version 0;
--   * ON DELETE RESTRICT identity foreign keys;
--   * fail-closed shape and live-link validation;
--   * immutable lineage fields after INSERT;
--   * new create_tracked_bet_v2() RPC with server-derived snapshots;
--   * existing create_tracked_bet(), callers, RLS, provider runtime,
--     result writes, grading, settlement, and production are unchanged.
-- ============================================================

BEGIN;

-- ── 1. Additive lineage storage ─────────────────────────────
-- Defaults make every existing row, and every future row created by the
-- unchanged v1 RPC, an explicit legacy unresolved row. Identity fields
-- remain NULL. There is no name/time/OCR backfill.
ALTER TABLE public.bet_legs
  ADD COLUMN IF NOT EXISTS canonical_fixture_id uuid,
  ADD COLUMN IF NOT EXISTS fixture_provider_link_id uuid,
  ADD COLUMN IF NOT EXISTS fixture_provider text,
  ADD COLUMN IF NOT EXISTS provider_fixture_id text,
  ADD COLUMN IF NOT EXISTS fixture_kickoff_at_snapshot timestamptz,
  ADD COLUMN IF NOT EXISTS fixture_timezone text,
  ADD COLUMN IF NOT EXISTS lineage_state text NOT NULL DEFAULT 'unresolved',
  ADD COLUMN IF NOT EXISTS lineage_source text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS lineage_contract_version smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mapping_confidence_snapshot text,
  ADD COLUMN IF NOT EXISTS mapping_method_snapshot text,
  ADD COLUMN IF NOT EXISTS lineage_verified_at timestamptz;

ALTER TABLE public.bet_legs
  ADD CONSTRAINT fk_bet_legs_canonical_fixture
    FOREIGN KEY (canonical_fixture_id)
    REFERENCES public.canonical_fixtures(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_bet_legs_fixture_provider_link
    FOREIGN KEY (fixture_provider_link_id)
    REFERENCES public.fixture_provider_links(id)
    ON DELETE RESTRICT;

CREATE INDEX idx_bet_legs_canonical_fixture
  ON public.bet_legs (canonical_fixture_id)
  WHERE canonical_fixture_id IS NOT NULL;

CREATE INDEX idx_bet_legs_fixture_provider_link
  ON public.bet_legs (fixture_provider_link_id)
  WHERE fixture_provider_link_id IS NOT NULL;

-- One constraint owns the state/version/source matrix. In unresolved and
-- needs_review states every authoritative identity/snapshot field is NULL.
-- Version 0 is reserved for legacy/v1 rows. Version 1 is the only v2 shape.
ALTER TABLE public.bet_legs
  ADD CONSTRAINT chk_bet_legs_lineage_shape CHECK (
    (
      lineage_contract_version = 0
      AND lineage_state = 'unresolved'
      AND lineage_source = 'legacy'
      AND canonical_fixture_id IS NULL
      AND fixture_provider_link_id IS NULL
      AND fixture_provider IS NULL
      AND provider_fixture_id IS NULL
      AND fixture_kickoff_at_snapshot IS NULL
      AND fixture_timezone IS NULL
      AND mapping_confidence_snapshot IS NULL
      AND mapping_method_snapshot IS NULL
      AND lineage_verified_at IS NULL
    )
    OR
    (
      lineage_contract_version = 1
      AND (
        (
          lineage_state = 'unresolved'
          AND lineage_source IN ('manual_unresolved', 'scanner_unresolved')
          AND canonical_fixture_id IS NULL
          AND fixture_provider_link_id IS NULL
          AND fixture_provider IS NULL
          AND provider_fixture_id IS NULL
          AND fixture_kickoff_at_snapshot IS NULL
          AND fixture_timezone IS NULL
          AND mapping_confidence_snapshot IS NULL
          AND mapping_method_snapshot IS NULL
          AND lineage_verified_at IS NULL
        )
        OR
        (
          lineage_state = 'needs_review'
          AND lineage_source = 'manual_candidate_review'
          AND canonical_fixture_id IS NULL
          AND fixture_provider_link_id IS NULL
          AND fixture_provider IS NULL
          AND provider_fixture_id IS NULL
          AND fixture_kickoff_at_snapshot IS NULL
          AND fixture_timezone IS NULL
          AND mapping_confidence_snapshot IS NULL
          AND mapping_method_snapshot IS NULL
          AND lineage_verified_at IS NULL
        )
        OR
        (
          lineage_state = 'verified'
          AND lineage_source = 'fixture_picker_exact'
          AND sport IN ('soccer', 'tennis')
          AND canonical_fixture_id IS NOT NULL
          AND fixture_provider_link_id IS NOT NULL
          AND NULLIF(trim(fixture_provider), '') IS NOT NULL
          AND NULLIF(trim(provider_fixture_id), '') IS NOT NULL
          AND fixture_kickoff_at_snapshot IS NOT NULL
          AND fixture_timezone = 'UTC'
          AND mapping_confidence_snapshot = 'exact'
          AND NULLIF(trim(mapping_method_snapshot), '') IS NOT NULL
          AND lineage_verified_at IS NOT NULL
        )
      )
    )
  );

COMMENT ON COLUMN public.bet_legs.canonical_fixture_id IS
  'Verified canonical fixture identity. NULL for legacy, unresolved, and needs_review legs. Decision #064.';
COMMENT ON COLUMN public.bet_legs.fixture_provider_link_id IS
  'Exact provider-link identity used to derive immutable snapshots. Decision #064.';
COMMENT ON COLUMN public.bet_legs.lineage_state IS
  'verified | unresolved | needs_review. Existing/v1 rows default to unresolved.';
COMMENT ON COLUMN public.bet_legs.lineage_contract_version IS
  '0 = legacy/v1; 1 = create_tracked_bet_v2 lineage contract.';

-- ── 2. DB-level lineage validation and immutability ─────────
-- This trigger validates direct service-role INSERTs as well as v2 RPC
-- inserts. Authenticated direct DML remains blocked by Decision #048.
CREATE OR REPLACE FUNCTION public.validate_tracked_leg_lineage_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_fixture_sport text;
  v_kickoff_at timestamptz;
  v_provider text;
  v_provider_fixture_id text;
  v_mapping_confidence text;
  v_mapping_method text;
BEGIN
  IF NEW.lineage_state IS DISTINCT FROM 'verified' THEN
    RETURN NEW;
  END IF;

  SELECT
    cf.sport,
    cf.kickoff_at,
    fpl.provider,
    fpl.provider_fixture_id,
    fpl.mapping_confidence,
    fpl.mapping_method
  INTO
    v_fixture_sport,
    v_kickoff_at,
    v_provider,
    v_provider_fixture_id,
    v_mapping_confidence,
    v_mapping_method
  FROM public.canonical_fixtures AS cf
  JOIN public.fixture_provider_links AS fpl
    ON fpl.canonical_fixture_id = cf.id
  WHERE cf.id = NEW.canonical_fixture_id
    AND fpl.id = NEW.fixture_provider_link_id
  FOR SHARE OF cf, fpl;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lineage_fixture_link_mismatch';
  END IF;

  IF v_mapping_confidence IS DISTINCT FROM 'exact' THEN
    RAISE EXCEPTION 'lineage_requires_exact_mapping';
  END IF;

  IF NULLIF(trim(v_mapping_method), '') IS NULL THEN
    RAISE EXCEPTION 'lineage_mapping_method_missing';
  END IF;

  IF ((
    (NEW.sport = 'soccer' AND v_fixture_sport = 'football')
    OR
    (NEW.sport = 'tennis' AND v_fixture_sport = 'tennis')
  )) IS NOT TRUE THEN
    RAISE EXCEPTION 'lineage_sport_mismatch';
  END IF;

  IF NEW.fixture_provider IS DISTINCT FROM v_provider
     OR NEW.provider_fixture_id IS DISTINCT FROM v_provider_fixture_id
     OR NEW.fixture_kickoff_at_snapshot IS DISTINCT FROM v_kickoff_at
     OR NEW.fixture_timezone IS DISTINCT FROM 'UTC'
     OR NEW.mapping_confidence_snapshot IS DISTINCT FROM v_mapping_confidence
     OR NEW.mapping_method_snapshot IS DISTINCT FROM v_mapping_method THEN
    RAISE EXCEPTION 'lineage_snapshot_mismatch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_tracked_leg_lineage_insert
  BEFORE INSERT ON public.bet_legs
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_tracked_leg_lineage_insert();

CREATE OR REPLACE FUNCTION public.prevent_tracked_leg_lineage_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.canonical_fixture_id IS DISTINCT FROM NEW.canonical_fixture_id
     OR OLD.fixture_provider_link_id IS DISTINCT FROM NEW.fixture_provider_link_id
     OR OLD.fixture_provider IS DISTINCT FROM NEW.fixture_provider
     OR OLD.provider_fixture_id IS DISTINCT FROM NEW.provider_fixture_id
     OR OLD.fixture_kickoff_at_snapshot IS DISTINCT FROM NEW.fixture_kickoff_at_snapshot
     OR OLD.fixture_timezone IS DISTINCT FROM NEW.fixture_timezone
     OR OLD.lineage_state IS DISTINCT FROM NEW.lineage_state
     OR OLD.lineage_source IS DISTINCT FROM NEW.lineage_source
     OR OLD.lineage_contract_version IS DISTINCT FROM NEW.lineage_contract_version
     OR OLD.mapping_confidence_snapshot IS DISTINCT FROM NEW.mapping_confidence_snapshot
     OR OLD.mapping_method_snapshot IS DISTINCT FROM NEW.mapping_method_snapshot
     OR OLD.lineage_verified_at IS DISTINCT FROM NEW.lineage_verified_at THEN
    RAISE EXCEPTION 'tracked_leg_lineage_immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_tracked_leg_lineage_update
  BEFORE UPDATE OF
    canonical_fixture_id,
    fixture_provider_link_id,
    fixture_provider,
    provider_fixture_id,
    fixture_kickoff_at_snapshot,
    fixture_timezone,
    lineage_state,
    lineage_source,
    lineage_contract_version,
    mapping_confidence_snapshot,
    mapping_method_snapshot,
    lineage_verified_at
  ON public.bet_legs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tracked_leg_lineage_update();

-- ── 3. create_tracked_bet_v2() ──────────────────────────────
-- The existing create_tracked_bet() signature and grants remain unchanged.
-- v2 accepts only a minimal lineage claim inside each leg:
--
-- "lineage": {
--   "contractVersion": 1,
--   "source": "manual_unresolved" | "scanner_unresolved" |
--             "fixture_picker_exact" | "manual_candidate_review",
--   "canonicalFixtureId": null | UUID string,
--   "fixtureProviderLinkId": null | UUID string
-- }
--
-- The client cannot supply lineage_state or any trusted snapshot.
CREATE OR REPLACE FUNCTION public.create_tracked_bet_v2(
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
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_bankroll_id uuid;
  v_balance numeric;
  v_new_balance numeric;
  v_bet_id uuid;
  v_bet_type text;
  v_total_odds numeric;
  v_leg jsonb;
  v_lineage jsonb;
  v_leg_count integer;
  v_i integer;
  v_key text;
  v_odds numeric;
  v_stake numeric;
  v_bookmaker text;
  v_notes text;
  v_idempotency_key text;
  v_lineage_source text;
  v_canonical_fixture_id uuid;
  v_fixture_provider_link_id uuid;
  v_normalized_legs jsonb := '[]'::jsonb;
  v_insert_legs jsonb := '[]'::jsonb;
  v_request_hash text;
  v_existing record;
  v_fixture_sport text;
  v_fixture_kickoff_at timestamptz;
  v_fixture_provider text;
  v_provider_fixture_id text;
  v_mapping_confidence text;
  v_mapping_method text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
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

  -- Normalize the client-controlled payload first. No table write occurs
  -- in this loop. Unknown top-level or lineage keys fail closed.
  FOR v_i IN 0 .. v_leg_count - 1 LOOP
    v_leg := p_legs -> v_i;

    IF jsonb_typeof(v_leg) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Leg % must be an object', v_i + 1;
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(v_leg) LOOP
      IF v_key NOT IN ('sport', 'event_name', 'market_type', 'selection', 'odds', 'lineage') THEN
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

    IF jsonb_typeof(v_leg -> 'lineage') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Leg % has invalid lineage', v_i + 1;
    END IF;
    v_lineage := v_leg -> 'lineage';

    FOR v_key IN SELECT jsonb_object_keys(v_lineage) LOOP
      IF v_key NOT IN (
        'contractVersion',
        'source',
        'canonicalFixtureId',
        'fixtureProviderLinkId'
      ) THEN
        RAISE EXCEPTION 'Leg % lineage has unknown field %', v_i + 1, v_key;
      END IF;
    END LOOP;

    IF NOT (v_lineage ?& ARRAY[
      'contractVersion',
      'source',
      'canonicalFixtureId',
      'fixtureProviderLinkId'
    ]) THEN
      RAISE EXCEPTION 'Leg % lineage must contain exactly the version, source, canonical fixture, and provider link fields', v_i + 1;
    END IF;

    IF jsonb_typeof(v_lineage -> 'contractVersion') IS DISTINCT FROM 'number'
       OR (v_lineage ->> 'contractVersion')::numeric IS DISTINCT FROM 1::numeric THEN
      RAISE EXCEPTION 'Leg % has unsupported lineage contract version', v_i + 1;
    END IF;

    IF jsonb_typeof(v_lineage -> 'source') IS DISTINCT FROM 'string'
       OR v_lineage ->> 'source' NOT IN (
         'manual_unresolved',
         'scanner_unresolved',
         'fixture_picker_exact',
         'manual_candidate_review'
       ) THEN
      RAISE EXCEPTION 'Leg % has invalid lineage source', v_i + 1;
    END IF;
    v_lineage_source := v_lineage ->> 'source';

    IF jsonb_typeof(v_lineage -> 'canonicalFixtureId') NOT IN ('string', 'null')
       OR jsonb_typeof(v_lineage -> 'fixtureProviderLinkId') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'Leg % has invalid lineage identifiers', v_i + 1;
    END IF;

    v_canonical_fixture_id := NULL;
    v_fixture_provider_link_id := NULL;

    IF jsonb_typeof(v_lineage -> 'canonicalFixtureId') = 'string' THEN
      IF v_lineage ->> 'canonicalFixtureId'
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Leg % has invalid canonical fixture id', v_i + 1;
      END IF;
      v_canonical_fixture_id := (v_lineage ->> 'canonicalFixtureId')::uuid;
    END IF;

    IF jsonb_typeof(v_lineage -> 'fixtureProviderLinkId') = 'string' THEN
      IF v_lineage ->> 'fixtureProviderLinkId'
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Leg % has invalid provider link id', v_i + 1;
      END IF;
      v_fixture_provider_link_id := (v_lineage ->> 'fixtureProviderLinkId')::uuid;
    END IF;

    IF v_lineage_source = 'fixture_picker_exact' THEN
      IF v_canonical_fixture_id IS NULL OR v_fixture_provider_link_id IS NULL THEN
        RAISE EXCEPTION 'Leg % exact lineage requires both fixture identifiers', v_i + 1;
      END IF;
    ELSIF v_canonical_fixture_id IS NOT NULL OR v_fixture_provider_link_id IS NOT NULL THEN
      RAISE EXCEPTION 'Leg % unresolved/review lineage cannot carry fixture identifiers', v_i + 1;
    END IF;

    IF v_lineage_source = 'manual_unresolved' AND p_source <> 'manual' THEN
      RAISE EXCEPTION 'Leg % manual lineage requires manual source', v_i + 1;
    END IF;
    IF v_lineage_source = 'scanner_unresolved' AND p_source <> 'scanner' THEN
      RAISE EXCEPTION 'Leg % scanner lineage requires scanner source', v_i + 1;
    END IF;
    IF v_lineage_source = 'manual_candidate_review' AND p_source <> 'manual' THEN
      RAISE EXCEPTION 'Leg % manual review lineage requires manual source', v_i + 1;
    END IF;

    v_normalized_legs := v_normalized_legs || jsonb_build_object(
      'sport',       v_leg ->> 'sport',
      'event_name',  trim(v_leg ->> 'event_name'),
      'market_type', trim(v_leg ->> 'market_type'),
      'selection',   NULLIF(trim(v_leg ->> 'selection'), ''),
      'odds',        v_odds,
      'lineage', jsonb_build_object(
        'contractVersion', 1,
        'source', v_lineage_source,
        'canonicalFixtureId', v_canonical_fixture_id,
        'fixtureProviderLinkId', v_fixture_provider_link_id
      )
    );
  END LOOP;

  IF v_leg_count = 1 THEN
    v_bet_type := 'single';
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

  -- Hash only the normalized client authority, including ordered lineage
  -- references. Server-derived snapshots are intentionally excluded so an
  -- exact replay after a canonical/provider row update returns the original
  -- stored snapshots instead of creating an idempotency conflict.
  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'rpc_contract', 'create_tracked_bet_v2',
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

  -- Validate and lock every requested exact tuple before the first write.
  -- The locks are held through the atomic bet/leg/bankroll transaction.
  FOR v_i IN 0 .. v_leg_count - 1 LOOP
    v_leg := v_normalized_legs -> v_i;
    v_lineage := v_leg -> 'lineage';
    v_lineage_source := v_lineage ->> 'source';

    IF v_lineage_source = 'fixture_picker_exact' THEN
      v_canonical_fixture_id := (v_lineage ->> 'canonicalFixtureId')::uuid;
      v_fixture_provider_link_id := (v_lineage ->> 'fixtureProviderLinkId')::uuid;

      SELECT
        cf.sport,
        cf.kickoff_at,
        fpl.provider,
        fpl.provider_fixture_id,
        fpl.mapping_confidence,
        fpl.mapping_method
      INTO
        v_fixture_sport,
        v_fixture_kickoff_at,
        v_fixture_provider,
        v_provider_fixture_id,
        v_mapping_confidence,
        v_mapping_method
      FROM public.canonical_fixtures AS cf
      JOIN public.fixture_provider_links AS fpl
        ON fpl.canonical_fixture_id = cf.id
      WHERE cf.id = v_canonical_fixture_id
        AND fpl.id = v_fixture_provider_link_id
      FOR SHARE OF cf, fpl;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Leg % fixture/provider link mismatch', v_i + 1;
      END IF;
      IF v_mapping_confidence IS DISTINCT FROM 'exact' THEN
        RAISE EXCEPTION 'Leg % requires exact mapping confidence', v_i + 1;
      END IF;
      IF NULLIF(trim(v_mapping_method), '') IS NULL THEN
        RAISE EXCEPTION 'Leg % exact mapping method is missing', v_i + 1;
      END IF;
      IF NOT (
        (v_leg ->> 'sport' = 'soccer' AND v_fixture_sport = 'football')
        OR
        (v_leg ->> 'sport' = 'tennis' AND v_fixture_sport = 'tennis')
      ) THEN
        RAISE EXCEPTION 'Leg % sport does not match canonical fixture', v_i + 1;
      END IF;

      v_insert_legs := v_insert_legs || jsonb_build_object(
        'sport', v_leg ->> 'sport',
        'event_name', v_leg ->> 'event_name',
        'market_type', v_leg ->> 'market_type',
        'selection', v_leg -> 'selection',
        'odds', (v_leg ->> 'odds')::numeric,
        'canonical_fixture_id', v_canonical_fixture_id,
        'fixture_provider_link_id', v_fixture_provider_link_id,
        'fixture_provider', v_fixture_provider,
        'provider_fixture_id', v_provider_fixture_id,
        'fixture_kickoff_at_snapshot', v_fixture_kickoff_at,
        'fixture_timezone', 'UTC',
        'lineage_state', 'verified',
        'lineage_source', v_lineage_source,
        'lineage_contract_version', 1,
        'mapping_confidence_snapshot', v_mapping_confidence,
        'mapping_method_snapshot', v_mapping_method,
        'lineage_verified_at', now()
      );
    ELSE
      v_insert_legs := v_insert_legs || jsonb_build_object(
        'sport', v_leg ->> 'sport',
        'event_name', v_leg ->> 'event_name',
        'market_type', v_leg ->> 'market_type',
        'selection', v_leg -> 'selection',
        'odds', (v_leg ->> 'odds')::numeric,
        'canonical_fixture_id', NULL,
        'fixture_provider_link_id', NULL,
        'fixture_provider', NULL,
        'provider_fixture_id', NULL,
        'fixture_kickoff_at_snapshot', NULL,
        'fixture_timezone', NULL,
        'lineage_state', CASE
          WHEN v_lineage_source = 'manual_candidate_review' THEN 'needs_review'
          ELSE 'unresolved'
        END,
        'lineage_source', v_lineage_source,
        'lineage_contract_version', 1,
        'mapping_confidence_snapshot', NULL,
        'mapping_method_snapshot', NULL,
        'lineage_verified_at', NULL
      );
    END IF;
  END LOOP;

  INSERT INTO public.bets (
    user_id,
    bankroll_id,
    bet_type,
    stake,
    total_odds,
    potential_payout,
    status,
    bookmaker,
    source,
    notes
  ) VALUES (
    v_user_id,
    v_bankroll_id,
    v_bet_type,
    v_stake,
    v_total_odds,
    v_stake * v_total_odds,
    'pending',
    v_bookmaker,
    p_source,
    v_notes
  )
  RETURNING id INTO v_bet_id;

  FOR v_i IN 0 .. v_leg_count - 1 LOOP
    v_leg := v_insert_legs -> v_i;

    INSERT INTO public.bet_legs (
      bet_id,
      sport,
      event_name,
      market_type,
      selection,
      odds,
      leg_status,
      leg_index,
      canonical_fixture_id,
      fixture_provider_link_id,
      fixture_provider,
      provider_fixture_id,
      fixture_kickoff_at_snapshot,
      fixture_timezone,
      lineage_state,
      lineage_source,
      lineage_contract_version,
      mapping_confidence_snapshot,
      mapping_method_snapshot,
      lineage_verified_at
    ) VALUES (
      v_bet_id,
      v_leg ->> 'sport',
      v_leg ->> 'event_name',
      v_leg ->> 'market_type',
      v_leg ->> 'selection',
      (v_leg ->> 'odds')::numeric,
      'pending',
      v_i + 1,
      (v_leg ->> 'canonical_fixture_id')::uuid,
      (v_leg ->> 'fixture_provider_link_id')::uuid,
      v_leg ->> 'fixture_provider',
      v_leg ->> 'provider_fixture_id',
      (v_leg ->> 'fixture_kickoff_at_snapshot')::timestamptz,
      v_leg ->> 'fixture_timezone',
      v_leg ->> 'lineage_state',
      v_leg ->> 'lineage_source',
      (v_leg ->> 'lineage_contract_version')::smallint,
      v_leg ->> 'mapping_confidence_snapshot',
      v_leg ->> 'mapping_method_snapshot',
      (v_leg ->> 'lineage_verified_at')::timestamptz
    );
  END LOOP;

  v_new_balance := v_balance - v_stake;

  UPDATE public.bankrolls
  SET balance = v_new_balance
  WHERE id = v_bankroll_id
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
    v_bankroll_id,
    v_bet_id,
    'stake',
    -v_stake,
    v_new_balance,
    jsonb_build_object(
      'request_hash', v_request_hash,
      'source', p_source,
      'leg_count', v_leg_count
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

REVOKE EXECUTE ON FUNCTION public.create_tracked_bet_v2(
  jsonb,
  numeric,
  numeric,
  text,
  text,
  text,
  text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_tracked_bet_v2(
  jsonb,
  numeric,
  numeric,
  text,
  text,
  text,
  text
) TO authenticated, service_role;

-- Catalog verification and authenticated smoke are intentionally excluded
-- from this review-only migration. They require the next separately approved
-- apply gate. Emergency rollback: docs/decision-064-rollback.sql.

COMMIT;
