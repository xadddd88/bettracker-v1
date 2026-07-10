-- ============================================================
-- Migration 023: Global (durable) rate limits (Decision #052)
--
-- The scanner / analyst / scout / coach / register routes rate-limit
-- with an in-memory Map. On Vercel serverless that is per-instance:
-- each Lambda has its own counter, a cold start resets it, and
-- horizontal scaling multiplies the effective limit — so the caps
-- (Anthropic spend control + register enumeration guard) are not
-- actually enforced. This moves the counters into Postgres so they
-- are shared across every instance.
--
-- Fixed-window atomic counter. One RPC checks all of a route's
-- windows (e.g. per-minute AND per-day) in a single transaction and
-- increments them together — service_role only.
-- ============================================================

CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket     text PRIMARY KEY,     -- key|window_seconds|window_index
  count      integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_expires ON api_rate_limits (expires_at);

ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (which bypasses RLS) touches this.
REVOKE ALL ON api_rate_limits FROM PUBLIC, anon, authenticated;

-- rate_limit_check(key, windows) — windows is a JSON array of
-- {"limit": <int>, "seconds": <int>}. Increments every window's fixed
-- bucket atomically and denies if ANY is over its limit. retry_after is
-- the seconds until the longest-blocked window resets.
CREATE OR REPLACE FUNCTION rate_limit_check(
  p_key     text,
  p_windows jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w           jsonb;
  v_limit     integer;
  v_seconds   integer;
  v_bucket    text;
  v_count     integer;
  v_now       bigint := extract(epoch FROM now())::bigint;
  v_window_end bigint;
  v_denied    boolean := false;
  v_retry     integer := 0;
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 OR length(p_key) > 200 THEN
    RAISE EXCEPTION 'invalid key';
  END IF;
  IF jsonb_typeof(p_windows) <> 'array' OR jsonb_array_length(p_windows) = 0 OR jsonb_array_length(p_windows) > 5 THEN
    RAISE EXCEPTION 'invalid windows';
  END IF;

  -- Opportunistic cleanup of expired buckets (bounded cost — ~1% of calls).
  IF random() < 0.01 THEN
    DELETE FROM api_rate_limits WHERE expires_at < now();
  END IF;

  FOR w IN SELECT * FROM jsonb_array_elements(p_windows)
  LOOP
    v_limit   := (w->>'limit')::integer;
    v_seconds := (w->>'seconds')::integer;
    IF v_limit IS NULL OR v_limit <= 0 OR v_seconds IS NULL OR v_seconds <= 0 THEN
      RAISE EXCEPTION 'invalid window entry';
    END IF;

    v_bucket     := p_key || '|' || v_seconds || '|' || (v_now / v_seconds);
    v_window_end := ((v_now / v_seconds) + 1) * v_seconds;

    INSERT INTO api_rate_limits (bucket, count, expires_at)
    VALUES (v_bucket, 1, to_timestamp(v_window_end))
    ON CONFLICT (bucket) DO UPDATE SET count = api_rate_limits.count + 1
    RETURNING count INTO v_count;

    IF v_count > v_limit THEN
      v_denied := true;
      v_retry  := GREATEST(v_retry, (v_window_end - v_now)::integer);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('allowed', NOT v_denied, 'retry_after', v_retry);
END;
$$;

REVOKE EXECUTE ON FUNCTION rate_limit_check(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION rate_limit_check(text, jsonb) TO service_role;
