-- ============================================================
-- BetTracker AI — Schema v1.0
-- Decision-first architecture
-- Apply in Supabase SQL Editor (new project, clean slate)
-- ============================================================

-- ─── EXTENSIONS ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── PROFILES ───────────────────────────────────────────────
CREATE TABLE profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email               text,
  display_name        text,
  currency            text        DEFAULT 'USD',
  default_stake       numeric     DEFAULT 10,
  kelly_fraction      numeric     DEFAULT 0.5,
  web_search_enabled  boolean     DEFAULT true,
  timezone            text        DEFAULT 'UTC',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ─── BANKROLLS ──────────────────────────────────────────────
CREATE TABLE bankrolls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name        text        DEFAULT 'Main',
  currency    text        DEFAULT 'USD',
  balance     numeric     DEFAULT 0,
  is_default  boolean     DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ─── DECISIONS ──────────────────────────────────────────────
-- The primary object. A record of a user evaluating a betting opportunity.
CREATE TABLE decisions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,

  -- Event context
  sport               text,
  league              text,
  event_name          text NOT NULL,

  -- Market
  market_type         text,     -- "П1", "ТБ 2.5", "Ф1 +1", etc.
  selection           text,
  line                numeric,

  -- Odds & value
  offered_odds        numeric,
  bookmaker           text,
  model_probability   numeric,  -- our estimate 0-100
  implied_probability numeric,  -- 1/odds * 100
  edge_percent        numeric,  -- model_prob - implied_prob

  -- Assessment
  confidence_score    numeric,  -- 0-100
  risk_level          text,     -- low / medium / high
  recommendation      text,     -- bet / skip / watch / no_value

  -- Outcome
  final_action        text      DEFAULT 'pending',
  -- pending / placed / skipped / watchlisted / ignored

  -- Source
  source              text      DEFAULT 'manual',
  -- ai_analyst / scanner / scout / quick_entry / manual / import

  -- AI output
  reasoning           text,
  factors             jsonb,
  metadata            jsonb,

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ─── AI ANALYSIS RUNS ───────────────────────────────────────
CREATE TABLE ai_analysis_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  decision_id      uuid REFERENCES decisions(id) ON DELETE SET NULL,

  agent_type       text NOT NULL,
  -- analyst / scout / scanner / risk_manager / coach / portfolio

  model_name       text,
  input_snapshot   jsonb,
  output_summary   text,
  output_json      jsonb,
  confidence_score numeric,
  web_search_used  boolean DEFAULT false,

  created_at       timestamptz DEFAULT now()
);

-- ─── BETS ───────────────────────────────────────────────────
-- Financial execution. One ticket / coupon.
CREATE TABLE bets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  bankroll_id      uuid REFERENCES bankrolls(id) ON DELETE SET NULL,

  bet_type         text NOT NULL DEFAULT 'single',
  -- single / parlay / system

  stake            numeric NOT NULL,
  total_odds       numeric,
  potential_payout numeric,

  status           text NOT NULL DEFAULT 'pending',
  -- pending / won / lost / void / push / cashed_out / partial

  pnl              numeric,      -- settled profit/loss

  placed_at        timestamptz DEFAULT now(),
  settled_at       timestamptz,

  bookmaker        text,
  source           text DEFAULT 'manual',
  -- manual / scanner / import / quick_entry

  notes            text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ─── BET LEGS ───────────────────────────────────────────────
-- Individual events within a bet. Single bet = 1 leg.
CREATE TABLE bet_legs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id       uuid NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
  decision_id  uuid REFERENCES decisions(id) ON DELETE SET NULL,
  -- nullable: allows quick_entry and imports without a decision

  sport        text,
  event_name   text NOT NULL,
  market_type  text,
  selection    text,
  line         numeric,
  odds         numeric NOT NULL,

  leg_status   text NOT NULL DEFAULT 'pending',
  -- pending / won / lost / void / push

  result_notes text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ─── BANKROLL TRANSACTIONS ──────────────────────────────────
CREATE TABLE bankroll_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  bankroll_id   uuid REFERENCES bankrolls(id) ON DELETE SET NULL,
  bet_id        uuid REFERENCES bets(id) ON DELETE SET NULL,

  type          text NOT NULL,
  -- deposit / withdrawal / stake / payout / adjustment / bonus

  amount        numeric NOT NULL,
  balance_after numeric,
  metadata      jsonb,

  created_at    timestamptz DEFAULT now()
);

-- ─── GLOBAL CONFIG ──────────────────────────────────────────
CREATE TABLE global_config (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);

-- ─── INDEXES ────────────────────────────────────────────────
CREATE INDEX idx_decisions_user_id    ON decisions(user_id);
CREATE INDEX idx_decisions_created_at ON decisions(created_at DESC);
CREATE INDEX idx_decisions_sport      ON decisions(sport);
CREATE INDEX idx_decisions_status     ON decisions(final_action);

CREATE INDEX idx_bets_user_id         ON bets(user_id);
CREATE INDEX idx_bets_status          ON bets(status);
CREATE INDEX idx_bets_placed_at       ON bets(placed_at DESC);
CREATE INDEX idx_bets_bankroll_id     ON bets(bankroll_id);

CREATE INDEX idx_bet_legs_bet_id      ON bet_legs(bet_id);
CREATE INDEX idx_bet_legs_decision_id ON bet_legs(decision_id);

CREATE INDEX idx_ai_runs_user_id      ON ai_analysis_runs(user_id);
CREATE INDEX idx_ai_runs_decision_id  ON ai_analysis_runs(decision_id);

CREATE INDEX idx_txn_user_id          ON bankroll_transactions(user_id);
CREATE INDEX idx_txn_bankroll_id      ON bankroll_transactions(bankroll_id);
CREATE INDEX idx_txn_bet_id           ON bankroll_transactions(bet_id);

-- ─── UPDATED_AT TRIGGER ─────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bankrolls_updated_at
  BEFORE UPDATE ON bankrolls
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_decisions_updated_at
  BEFORE UPDATE ON decisions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bets_updated_at
  BEFORE UPDATE ON bets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bet_legs_updated_at
  BEFORE UPDATE ON bet_legs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── AUTO-CREATE PROFILE ON SIGNUP ──────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email);

  INSERT INTO bankrolls (user_id, name, is_default)
  VALUES (NEW.id, 'Main', true);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankrolls             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankroll_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bet_legs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_config         ENABLE ROW LEVEL SECURITY;

-- Users own their data
CREATE POLICY "own profiles"   ON profiles              FOR ALL TO authenticated USING (auth.uid() = id)      WITH CHECK (auth.uid() = id);
CREATE POLICY "own bankrolls"  ON bankrolls             FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own txns"       ON bankroll_transactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own decisions"  ON decisions             FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own ai_runs"    ON ai_analysis_runs      FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own bets"       ON bets                  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "read global"    ON global_config         FOR SELECT TO authenticated USING (true);

-- bet_legs: user owns via parent bet
CREATE POLICY "own bet_legs" ON bet_legs FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM bets WHERE bets.id = bet_legs.bet_id AND bets.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM bets WHERE bets.id = bet_legs.bet_id AND bets.user_id = auth.uid())
  );
