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
-- {"limit": <int>, "seconds": <int>}. Two-phase check-then-consume under a
-- per-key transaction advisory lock:
--   * pg_advisory_xact_lock(hashtextextended(p_key, 0)) fully serializes
--     every call for a key, so the read-check-consume is atomic even across
--     the key's different window buckets (no interleaving between the check
--     and the increment).
--   * Phase 1 reads every window's current count (no consume).
--   * Phase 2 consumes one token from EVERY window only if ALL are under
--     limit — a denied request consumes NOTHING, so a burst blocked by a
--     short window can never drain a longer window's budget.
-- retry_after = seconds until the longest-blocked window resets. Validation
-- is strictly fail-closed: any malformed input raises (the helper maps a
-- raised RPC to a 503, never an open door). p_key is expected to already be
-- a hash (the helper sha256s it) so no raw IP/UUID is stored.
CREATE OR REPLACE FUNCTION rate_limit_check(
  p_key     text,
  p_windows jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w            jsonb;
  v_limit      integer;
  v_seconds    integer;
  v_bucket     text;
  v_count      integer;
  v_now        bigint := extract(epoch FROM now())::bigint;
  v_window_end bigint;
  v_denied     boolean := false;
  v_retry      integer := 0;
  v_buckets    text[] := '{}';
  v_seen_secs  integer[] := '{}';
BEGIN
  -- Fail-closed input validation. NULL is handled explicitly: SQL
  -- three-valued logic would let a NULL p_windows slip past a bare
  -- `jsonb_typeof(...) <> 'array'` check and return allowed on an empty loop.
  IF p_key IS NULL OR length(p_key) = 0 OR length(p_key) > 200 THEN
    RAISE EXCEPTION 'invalid key';
  END IF;
  IF p_windows IS NULL OR jsonb_typeof(p_windows) <> 'array' THEN
    RAISE EXCEPTION 'invalid windows: not an array';
  END IF;
  IF jsonb_array_length(p_windows) = 0 OR jsonb_array_length(p_windows) > 5 THEN
    RAISE EXCEPTION 'invalid windows: count';
  END IF;

  -- Serialize the whole check-then-consume for this key.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_key, 0));

  -- Bounded opportunistic cleanup of expired buckets (~1% of calls, max 500).
  IF random() < 0.01 THEN
    DELETE FROM api_rate_limits
    WHERE bucket IN (SELECT bucket FROM api_rate_limits WHERE expires_at < now() LIMIT 500);
  END IF;

  -- Phase 1: read every window's current count (no consume).
  FOR w IN SELECT * FROM jsonb_array_elements(p_windows)
  LOOP
    IF jsonb_typeof(w) <> 'object' THEN
      RAISE EXCEPTION 'invalid window entry: not an object';
    END IF;
    IF jsonb_typeof(w->'limit') <> 'number' OR jsonb_typeof(w->'seconds') <> 'number' THEN
      RAISE EXCEPTION 'invalid window entry: limit/seconds not numbers';
    END IF;
    v_limit   := (w->>'limit')::integer;
    v_seconds := (w->>'seconds')::integer;
    IF v_limit <= 0 OR v_limit > 1000000 OR v_seconds <= 0 OR v_seconds > 2592000 THEN
      RAISE EXCEPTION 'invalid window entry: out of range';
    END IF;
    IF v_seconds = ANY(v_seen_secs) THEN
      RAISE EXCEPTION 'invalid windows: duplicate seconds';
    END IF;
    v_seen_secs := array_append(v_seen_secs, v_seconds);

    v_bucket     := p_key || '|' || v_seconds || '|' || (v_now / v_seconds);
    v_window_end := ((v_now / v_seconds) + 1) * v_seconds;

    INSERT INTO api_rate_limits (bucket, count, expires_at)
    VALUES (v_bucket, 0, to_timestamp(v_window_end))
    ON CONFLICT (bucket) DO UPDATE SET count = api_rate_limits.count
    RETURNING count INTO v_count;

    v_buckets := array_append(v_buckets, v_bucket);

    -- count is the number already consumed this window; deny at the limit.
    IF v_count >= v_limit THEN
      v_denied := true;
      v_retry  := GREATEST(v_retry, (v_window_end - v_now)::integer);
    END IF;
  END LOOP;

  -- Phase 2: consume a token from every window ONLY if all passed.
  IF NOT v_denied THEN
    UPDATE api_rate_limits SET count = count + 1 WHERE bucket = ANY(v_buckets);
  END IF;

  RETURN jsonb_build_object('allowed', NOT v_denied, 'retry_after', v_retry);
END;
$$;

REVOKE EXECUTE ON FUNCTION rate_limit_check(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION rate_limit_check(text, jsonb) TO service_role;
