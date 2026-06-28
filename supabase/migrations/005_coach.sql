-- Migration 005: Coaching Sessions (Coach agent)
-- Run manually in Supabase SQL Editor

CREATE TABLE coaching_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_days          integer NOT NULL,   -- 7, 30, 90, 0 = all-time
  period_start         date,
  period_end           date,
  bets_analysed        integer NOT NULL DEFAULT 0,
  decisions_analysed   integer NOT NULL DEFAULT 0,
  summary              text NOT NULL,
  calibration_grade    text CHECK (calibration_grade IN ('excellent','good','fair','poor')),
  strengths            jsonb NOT NULL DEFAULT '[]',  -- string[]
  weaknesses           jsonb NOT NULL DEFAULT '[]',  -- string[]
  recommendations      jsonb NOT NULL DEFAULT '[]',  -- CoachRecommendation[]
  patterns             jsonb,                         -- identified patterns snapshot
  metrics_snapshot     jsonb,                         -- aggregated stats at session time
  focus_notes          text,
  model_name           text,
  disclaimer           text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own sessions"
  ON coaching_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_coaching_sessions_user
  ON coaching_sessions (user_id, created_at DESC);
