-- Add match_date to market_opportunities so Scout cards can show when the event takes place.
-- Nullable: older rows and opportunities where Claude cannot determine the date remain null.
alter table market_opportunities
  add column if not exists match_date date;
