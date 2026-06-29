-- Migration 004: Market Opportunities (Scout agent)
-- Run manually in Supabase SQL Editor

CREATE TABLE market_opportunities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport_code          text NOT NULL,
  event_name          text NOT NULL,
  market_type         text NOT NULL,
  selection           text,
  line                numeric,
  offered_odds        numeric,
  bookmaker           text,
  opportunity_type    text NOT NULL DEFAULT 'general'
                        CHECK (opportunity_type IN ('value','contrarian','pattern','general')),
  scout_score         integer CHECK (scout_score BETWEEN 0 AND 100),
  model_probability   numeric CHECK (model_probability BETWEEN 0 AND 100),
  implied_probability numeric CHECK (implied_probability BETWEEN 0 AND 100),
  edge_percent        numeric,
  confidence_score    integer CHECK (confidence_score BETWEEN 0 AND 100),
  data_quality_score  integer CHECK (data_quality_score BETWEEN 0 AND 100),
  risk_level          text CHECK (risk_level IN ('low','medium','high')),
  status              text NOT NULL DEFAULT 'discovered'
                        CHECK (status IN (
                          'discovered','research_needed','watchlisted',
                          'converted_to_decision','dismissed','expired'
                        )),
  reasoning           text NOT NULL,
  required_checks     jsonb,
  linked_decision_id  uuid REFERENCES decisions(id) ON DELETE SET NULL,
  web_search_used     boolean NOT NULL DEFAULT false,
  scout_run_input     jsonb,
  metadata            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE market_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own opportunities"
  ON market_opportunities FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_market_opp_user_status
  ON market_opportunities (user_id, status, created_at DESC);

CREATE TRIGGER trg_market_opp_updated_at
  BEFORE UPDATE ON market_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
