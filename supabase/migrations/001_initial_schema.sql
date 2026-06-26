-- ============================================================
-- BetTracker AI — Schema v1.1
-- Decision-first architecture
-- Apply in Supabase SQL Editor (new project, clean slate)
-- Safe to re-run: drops everything first, then recreates clean.
-- ============================================================

-- ─── RESET (safe to re-run) ──────────────────────────────────
-- Drop triggers first
DROP TRIGGER IF EXISTS on_auth_user_created    ON auth.users;
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS trg_bankrolls_updated_at ON bankrolls;
DROP TRIGGER IF EXISTS trg_decisions_updated_at ON decisions;
DROP TRIGGER IF EXISTS trg_bets_updated_at      ON bets;
DROP TRIGGER IF EXISTS trg_bet_legs_updated_at  ON bet_legs;

-- Drop functions
DROP FUNCTION IF EXISTS handle_new_user()    CASCADE;
DROP FUNCTION IF EXISTS set_updated_at()     CASCADE;
DROP FUNCTION IF EXISTS create_quick_bet     CASCADE;

-- Drop tables in reverse-dependency order
DROP TABLE IF EXISTS bankroll_transactions CASCADE;
DROP TABLE IF EXISTS bet_legs              CASCADE;
DROP TABLE IF EXISTS ai_analysis_runs      CASCADE;
DROP TABLE IF EXISTS bets                  CASCADE;
DROP TABLE IF EXISTS decisions             CASCADE;
DROP TABLE IF EXISTS bankrolls             CASCADE;
DROP TABLE IF EXISTS global_config         CASCADE;
DROP TABLE IF EXISTS profiles              CASCADE;

-- ─── EXTENSIONS ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
  model_probability   numeric,  -- our estimate 0–100
  implied_probability numeric,  -- 1/odds * 100
  edge_percent        numeric,  -- model_prob - implied_prob

  -- Assessment
  confidence_score    numeric   CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100)),
  risk_level          text      CHECK (risk_level IS NULL OR risk_level IN ('low', 'medium', 'high')),
  recommendation      text      CHECK (recommendation IS NULL OR recommendation IN ('bet', 'skip', 'watch', 'no_value')),

  -- Outcome
  final_action        text      NOT NULL DEFAULT 'pending'
                                CHECK (final_action IN ('pending', 'placed', 'skipped', 'watchlisted', 'ignored')),

  -- Source
  source              text      NOT NULL DEFAULT 'manual'
                                CHECK (source IN ('ai_analyst', 'scanner', 'scout', 'quick_entry', 'manual', 'import')),

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

  agent_type       text NOT NULL
                   CHECK (agent_type IN ('analyst', 'scout', 'scanner', 'risk_manager', 'coach', 'portfolio')),

  model_name       text,
  input_snapshot   jsonb,
  output_summary   text,
  output_json      jsonb,
  confidence_score numeric CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100)),
  web_search_used  boolean DEFAULT false,

  created_at       timestamptz DEFAULT now()
);

-- ─── BETS ───────────────────────────────────────────────────
-- Financial execution. One ticket / coupon.
CREATE TABLE bets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  bankroll_id      uuid REFERENCES bankrolls(id) ON DELETE SET NULL,

  bet_type         text NOT NULL DEFAULT 'single'
                   CHECK (bet_type IN ('single', 'parlay', 'system')),

  stake            numeric NOT NULL CHECK (stake > 0),
  total_odds       numeric         CHECK (total_odds IS NULL OR total_odds > 0),
  potential_payout numeric,

  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'won', 'lost', 'void', 'push', 'cashed_out', 'partial')),

  pnl              numeric,      -- settled profit/loss

  placed_at        timestamptz DEFAULT now(),
  settled_at       timestamptz,

  bookmaker        text,
  source           text DEFAULT 'manual'
                   CHECK (source IS NULL OR source IN ('manual', 'scanner', 'import', 'quick_entry')),

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
  odds         numeric NOT NULL CHECK (odds > 0),

  leg_status   text NOT NULL DEFAULT 'pending'
               CHECK (leg_status IN ('pending', 'won', 'lost', 'void', 'push')),

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

  type          text NOT NULL
                CHECK (type IN ('deposit', 'withdrawal', 'stake', 'payout', 'adjustment', 'bonus')),

  amount        numeric NOT NULL,
  balance_after numeric NOT NULL, -- mandatory: always track running balance
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

-- ─── ATOMIC QUICK BET RPC ───────────────────────────────────
-- All four inserts (decision, bet, bet_leg, bankroll_transaction) + balance
-- update happen in one DB transaction. Partial failure = full rollback.
CREATE OR REPLACE FUNCTION create_quick_bet(
  p_user_id       uuid,
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
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_decision_id uuid;
  v_bet_id      uuid;
  v_new_balance numeric;
BEGIN
  -- Validate ownership: bankroll must belong to this user
  IF p_bankroll_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM bankrolls
      WHERE id = p_bankroll_id AND user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'Bankroll not found or does not belong to user';
    END IF;
  END IF;

  -- Validate inputs
  IF p_stake <= 0 THEN
    RAISE EXCEPTION 'Stake must be positive';
  END IF;
  IF p_offered_odds <= 1 THEN
    RAISE EXCEPTION 'Odds must be greater than 1';
  END IF;

  -- 1. Create Decision
  INSERT INTO decisions (
    user_id, event_name, sport, market_type, selection,
    offered_odds, bookmaker, source, final_action
  )
  VALUES (
    p_user_id, p_event_name, p_sport, p_market_type, p_selection,
    p_offered_odds, p_bookmaker, 'quick_entry', 'placed'
  )
  RETURNING id INTO v_decision_id;

  -- 2. Create Bet
  INSERT INTO bets (
    user_id, bankroll_id, bet_type, stake, total_odds,
    potential_payout, status, bookmaker, source, notes
  )
  VALUES (
    p_user_id, p_bankroll_id, 'single', p_stake, p_offered_odds,
    p_stake * p_offered_odds, 'pending', p_bookmaker, 'quick_entry', p_notes
  )
  RETURNING id INTO v_bet_id;

  -- 3. Create BetLeg (linked to decision)
  INSERT INTO bet_legs (
    bet_id, decision_id, sport, event_name, market_type, selection, odds, leg_status
  )
  VALUES (
    v_bet_id, v_decision_id, p_sport, p_event_name, p_market_type, p_selection, p_offered_odds, 'pending'
  );

  -- 4. Deduct stake from bankroll balance (cached, authoritative)
  IF p_bankroll_id IS NOT NULL THEN
    UPDATE bankrolls
    SET balance = balance - p_stake
    WHERE id = p_bankroll_id AND user_id = p_user_id
    RETURNING balance INTO v_new_balance;
  ELSE
    v_new_balance := 0;
  END IF;

  -- 5. Record transaction with running balance snapshot
  INSERT INTO bankroll_transactions (
    user_id, bankroll_id, bet_id, type, amount, balance_after
  )
  VALUES (
    p_user_id, p_bankroll_id, v_bet_id, 'stake', -p_stake, v_new_balance
  );

  RETURN jsonb_build_object(
    'decision_id', v_decision_id,
    'bet_id',      v_bet_id
  );
END;
$$;

-- Grant RPC access to authenticated users
GRANT EXECUTE ON FUNCTION create_quick_bet TO authenticated;

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
-- Cross-user protection: bet must belong to same user. Enforced here + via create_quick_bet RPC.
CREATE POLICY "own bet_legs" ON bet_legs FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM bets WHERE bets.id = bet_legs.bet_id AND bets.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM bets WHERE bets.id = bet_legs.bet_id AND bets.user_id = auth.uid())
  );
