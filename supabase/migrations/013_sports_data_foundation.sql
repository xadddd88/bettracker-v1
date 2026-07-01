-- ============================================================
-- Migration 013: Sports Data Foundation (Phase 1 M1.1)
--
-- REVIEW ONLY — do NOT apply automatically.
-- Apply manually in Supabase SQL Editor after CPO accept + merge.
--
-- Adds the canonical, provider-agnostic sports data model defined in
-- PHASE_1_TECHNICAL_PLAN.md: canonical_fixtures, fixture_provider_links,
-- odds_snapshots, fixture_results, football_enrichment, market_catalog.
--
-- These are PROVIDER-SOURCED SYSTEM TABLES, not user-owned rows — there
-- is no user_id column and no per-user RLS policy. RLS posture follows
-- the global_config precedent from migration 001: RLS enabled, NO write
-- policy anywhere (all writes happen via the service-role client in future
-- sync/cron routes, which bypasses RLS). An authenticated read policy is
-- granted ONLY on the two tables that carry no raw_provider_payload
-- (canonical_fixtures, market_catalog). Every table that carries
-- raw_provider_payload (fixture_provider_links, odds_snapshots,
-- fixture_results, football_enrichment) is service-role-only, per §9 —
-- raw payload is debug/internal metadata, and RLS cannot hide columns.
--
-- No settlement logic, no auto-settlement. market_catalog seeds the
-- full known market taxonomy (including deferred whole-line/Asian
-- markets) purely as reference metadata per §8 — this does not build
-- the settlement engine (§2/§8 explicitly out of scope for M1).
--
-- No data backfill. No changes to any existing table.
-- ============================================================

BEGIN;

-- ── market_catalog ────────────────────────────────────────────
CREATE TABLE market_catalog (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_market_type  text NOT NULL UNIQUE,
  sport                  text NOT NULL CHECK (sport IN ('football','tennis')),
  -- Reference-only classification per §8. No settlement logic reads or
  -- enforces this column in M1 — it exists so the data model does not
  -- foreclose the future settlement engine.
  settlement_eligibility text NOT NULL DEFAULT 'not_implemented'
                           CHECK (settlement_eligibility IN
                             ('safe_v1','conditional','deferred','not_implemented')),
  eligibility_notes      text,
  -- Lookup used by the market-normalization resolver (M1.5) to map a
  -- raw provider market name to this canonical type. Not itself a
  -- source of truth for any individual odds row — raw_market_name is
  -- always stored directly on odds_snapshots too.
  provider_market_names  jsonb NOT NULL DEFAULT '{}'::jsonb,
  description            text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

INSERT INTO market_catalog
  (canonical_market_type, sport, settlement_eligibility, eligibility_notes, provider_market_names)
VALUES
  ('football_1x2', 'football', 'safe_v1', NULL,
    '{"api_football": ["Match Winner"], "sportmonks": ["Fulltime Result"]}'::jsonb),
  ('football_double_chance', 'football', 'conditional',
    'Safe only with explicit selection-to-outcome mapping; no implicit inference (§8).',
    '{"api_football": ["Double Chance"]}'::jsonb),
  ('football_draw_no_bet', 'football', 'conditional',
    'Safe only if draw maps to void/stake-returned as an explicit rule (§8).',
    '{"api_football": ["Draw No Bet"]}'::jsonb),
  ('football_over_under_half', 'football', 'safe_v1',
    'Half-goal lines only (2.5 / 3.5 etc). Whole lines are a separate deferred market type.',
    '{"api_football": ["Goals Over/Under"]}'::jsonb),
  ('football_over_under_whole', 'football', 'deferred',
    'Whole-line totals excluded from v1 until push support is explicit (§8).',
    '{}'::jsonb),
  ('football_asian_totals', 'football', 'deferred',
    'Deferred until push support is explicit (§8).',
    '{}'::jsonb),
  ('football_asian_handicap', 'football', 'deferred',
    'Deferred until push support is explicit (§8).',
    '{}'::jsonb),
  ('tennis_moneyline', 'tennis', 'conditional',
    'Safe only for normally completed matches; retired/walkover/abandoned must be needs_manual_review, never auto-settled (§8, §14).',
    '{"api_tennis": ["Home/Away"]}'::jsonb);

-- ── canonical_fixtures ───────────────────────────────────────
CREATE TABLE canonical_fixtures (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport               text NOT NULL CHECK (sport IN ('football','tennis')),
  competition_name    text NOT NULL,
  competition_country text,
  season              text,
  round               text,
  kickoff_at          timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN
                          ('scheduled','live','finished','postponed',
                           'cancelled','abandoned','retired','walkover')),
  -- Football-shaped home/away — populated only when sport = 'football'.
  home_ref            text,
  away_ref            text,
  -- Neutral, sport-agnostic participant model (§10) — populated only
  -- when sport = 'tennis'. Never use home/away for tennis.
  participant_a_ref   text,
  participant_b_ref   text,
  venue               text,
  metadata            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- CPO fix (§10): field-family exclusivity, NOT mandatory participants.
  -- Football uses home/away, tennis uses participant_a/b — never mixed.
  -- Participants MAY be NULL for TBD fixtures (cup draws, qualifiers,
  -- unfilled World Cup slots, tennis draws). "Participants known" is
  -- enforced later at the betting/settlement/analysis eligibility layer,
  -- not at insert time.
  CONSTRAINT chk_fixture_participant_naming CHECK (
    (sport = 'football' AND participant_a_ref IS NULL AND participant_b_ref IS NULL)
    OR
    (sport = 'tennis' AND home_ref IS NULL AND away_ref IS NULL)
  )
);

CREATE INDEX idx_canonical_fixtures_kickoff     ON canonical_fixtures (kickoff_at);
CREATE INDEX idx_canonical_fixtures_sport_status ON canonical_fixtures (sport, status);

-- ── fixture_provider_links ───────────────────────────────────
-- One row per (canonical fixture, provider) pair — normalized rather
-- than three ID columns on one row, so each provider's own
-- raw_provider_payload / provider_updated_at / sync_run_id (§4) can be
-- tracked independently, and adding a future provider needs no schema
-- change.
CREATE TABLE fixture_provider_links (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_fixture_id  uuid NOT NULL REFERENCES canonical_fixtures(id) ON DELETE CASCADE,
  provider              text NOT NULL CHECK (provider IN ('api_football','sportmonks','api_tennis')),
  provider_fixture_id   text NOT NULL,
  mapping_confidence    text NOT NULL CHECK (mapping_confidence IN
                           ('exact','high','medium','low','needs_review')),
  -- e.g. 'exact_id', 'name_time_match', 'manual'
  mapping_method        text,
  raw_provider_payload  jsonb,
  provider_updated_at   timestamptz,
  ingested_at           timestamptz NOT NULL DEFAULT now(),
  sync_run_id           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_fixture_id),
  UNIQUE (canonical_fixture_id, provider)
);

CREATE INDEX idx_fixture_links_confidence ON fixture_provider_links (mapping_confidence);
CREATE INDEX idx_fixture_links_fixture    ON fixture_provider_links (canonical_fixture_id);

-- ── odds_snapshots ───────────────────────────────────────────
-- Append-only: a pull is a new row, never an update (§6). No
-- updated_at column by design.
CREATE TABLE odds_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_fixture_id  uuid NOT NULL REFERENCES canonical_fixtures(id) ON DELETE CASCADE,
  provider              text NOT NULL CHECK (provider IN ('api_football','sportmonks','api_tennis')),
  -- Nullable: unmapped raw market names are stored (not dropped) and
  -- flagged for a later market_catalog addition rather than lost.
  market_catalog_id     uuid REFERENCES market_catalog(id),
  raw_market_name       text NOT NULL,
  selection             text NOT NULL,
  line                  numeric,
  price                 numeric NOT NULL CHECK (price > 1),
  bookmaker             text,
  raw_provider_payload  jsonb,
  provider_updated_at   timestamptz,
  ingested_at           timestamptz NOT NULL DEFAULT now(),
  sync_run_id           text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_odds_snapshots_fixture_time ON odds_snapshots (canonical_fixture_id, ingested_at DESC);
CREATE INDEX idx_odds_snapshots_market       ON odds_snapshots (canonical_fixture_id, market_catalog_id, ingested_at DESC);

-- ── fixture_results ──────────────────────────────────────────
-- One row per (canonical fixture, provider) — this is what makes the
-- SportMonks "cross-check mapped marquee fixtures" flow (§6) possible:
-- the cross-check is literally comparing two providers' rows for the
-- same canonical_fixture_id.
CREATE TABLE fixture_results (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_fixture_id  uuid NOT NULL REFERENCES canonical_fixtures(id) ON DELETE CASCADE,
  provider              text NOT NULL CHECK (provider IN ('api_football','sportmonks','api_tennis')),
  status                text NOT NULL CHECK (status IN
                           ('scheduled','live','finished','postponed',
                            'cancelled','abandoned','retired','walkover')),
  outcome_data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner_ref            text,
  -- Always true for tennis retired/walkover/abandoned (§8, §14 decision
  -- #5). Also set true by a future cross-check on provider disagreement.
  needs_manual_review   boolean NOT NULL DEFAULT false,
  raw_provider_payload  jsonb,
  provider_updated_at   timestamptz,
  ingested_at           timestamptz NOT NULL DEFAULT now(),
  sync_run_id           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_fixture_id, provider)
);

CREATE INDEX idx_fixture_results_review ON fixture_results (needs_manual_review) WHERE needs_manual_review = true;

-- ── football_enrichment ──────────────────────────────────────
-- Latest-state per fixture (UNIQUE canonical_fixture_id), not an
-- append-only history like odds_snapshots — the doc does not require
-- historical xG snapshots. Flagged as an open question for CPO in the
-- PR description; cheap to change to append-only now, expensive later.
CREATE TABLE football_enrichment (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_fixture_id        uuid NOT NULL REFERENCES canonical_fixtures(id) ON DELETE CASCADE,
  -- CPO fix (§9): trusted-link binding. NOT NULL + the
  -- validate_football_enrichment_link() trigger below guarantee this link
  -- is for the SAME canonical_fixture_id, is a SportMonks link, and had
  -- exact/high mapping confidence at write time. needs_review/medium/low
  -- links can never drive enrichment.
  fixture_provider_link_id    uuid NOT NULL REFERENCES fixture_provider_links(id) ON DELETE CASCADE,
  -- Snapshot of the mapping confidence AT WRITE TIME. Hard DB-level
  -- gate matching §9: only exact/high may ever land here, even if the
  -- link's confidence is later downgraded.
  mapping_confidence_at_write text NOT NULL CHECK (mapping_confidence_at_write IN ('exact','high')),
  xg_home                     numeric,
  xg_away                     numeric,
  predictions                 jsonb,
  match_facts                 jsonb,
  momentum                    jsonb,
  raw_provider_payload        jsonb,
  provider_updated_at         timestamptz,
  ingested_at                 timestamptz NOT NULL DEFAULT now(),
  sync_run_id                 text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_fixture_id)
);

-- ── ENRICHMENT TRUSTED-LINK VALIDATION (CPO fix, §9) ─────────
-- Hard DB-level gate: football_enrichment may only reference a
-- fixture_provider_links row that (a) belongs to the SAME
-- canonical_fixture_id, (b) is a SportMonks link, and (c) had exact/high
-- mapping confidence at write time. Complements mapping_confidence_at_write.
CREATE OR REPLACE FUNCTION validate_football_enrichment_link()
RETURNS trigger LANGUAGE plpgsql AS $func$
DECLARE lnk fixture_provider_links%ROWTYPE;
BEGIN
  SELECT * INTO lnk FROM fixture_provider_links
    WHERE id = NEW.fixture_provider_link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'football_enrichment: provider link % not found', NEW.fixture_provider_link_id;
  END IF;
  IF lnk.provider <> 'sportmonks' THEN
    RAISE EXCEPTION 'football_enrichment: link must be sportmonks, got %', lnk.provider;
  END IF;
  IF lnk.canonical_fixture_id <> NEW.canonical_fixture_id THEN
    RAISE EXCEPTION 'football_enrichment: link fixture % does not match row fixture %',
      lnk.canonical_fixture_id, NEW.canonical_fixture_id;
  END IF;
  IF lnk.mapping_confidence NOT IN ('exact','high') THEN
    RAISE EXCEPTION 'football_enrichment: requires exact/high link confidence, got %', lnk.mapping_confidence;
  END IF;
  RETURN NEW;
END;
$func$;

CREATE TRIGGER trg_validate_football_enrichment_link
  BEFORE INSERT OR UPDATE ON football_enrichment
  FOR EACH ROW EXECUTE FUNCTION validate_football_enrichment_link();

-- ── UPDATED_AT TRIGGERS (reuse set_updated_at() from migration 001) ──
CREATE TRIGGER trg_canonical_fixtures_updated_at     BEFORE UPDATE ON canonical_fixtures     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_fixture_provider_links_updated_at BEFORE UPDATE ON fixture_provider_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_fixture_results_updated_at        BEFORE UPDATE ON fixture_results        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_football_enrichment_updated_at    BEFORE UPDATE ON football_enrichment    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_market_catalog_updated_at         BEFORE UPDATE ON market_catalog         FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
-- "Final truth" tables: readable by all authenticated users (this is
-- product-facing sports data), writable only by service-role (no
-- INSERT/UPDATE/DELETE policy exists for authenticated/anon at all).
ALTER TABLE canonical_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE odds_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_results    ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_catalog     ENABLE ROW LEVEL SECURITY;

-- CPO fix (§9): odds_snapshots and fixture_results carry
-- raw_provider_payload, and Postgres RLS cannot hide columns — an
-- authenticated SELECT would expose raw provider JSON. They are therefore
-- service-role-only in M1.1 (RLS enabled above, NO authenticated policy).
-- Only the two tables that carry NO raw_provider_payload keep an
-- authenticated read policy. Curated, payload-free read views/RPC are a
-- later PR, added when an app path actually needs them.
CREATE POLICY "read canonical_fixtures" ON canonical_fixtures FOR SELECT TO authenticated USING (true);
CREATE POLICY "read market_catalog"     ON market_catalog     FOR SELECT TO authenticated USING (true);

-- Internal/working tables: RLS enabled with NO policies at all for
-- authenticated/anon — per §9, mapping internals (needs_review rows)
-- and enrichment "must not affect user-facing analysis" until
-- promoted. Readable only via the service-role client until a
-- deliberately scoped internal review-queue endpoint exists (M1.7).
ALTER TABLE fixture_provider_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE football_enrichment    ENABLE ROW LEVEL SECURITY;

COMMIT;
