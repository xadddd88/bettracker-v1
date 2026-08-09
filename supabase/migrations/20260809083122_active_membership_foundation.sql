-- ============================================================
-- Security S2.1: Active Membership Foundation
--
-- REVIEW ONLY — do not apply automatically.
--
-- Adds the database primitives required by later Web and RLS
-- enforcement. This migration does not backfill beta_access,
-- change Auth sessions, or make membership enforcement active.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Keep membership lookup outside the exposed public Data API schema.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE FUNCTION private.is_active_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH caller AS (
    SELECT auth.uid() AS user_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM caller
    JOIN public.beta_access AS membership
      ON membership.used_by_user_id = caller.user_id
    WHERE caller.user_id IS NOT NULL
      AND membership.status = 'used'
  );
$function$;

REVOKE EXECUTE ON FUNCTION private.is_active_member()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_active_member()
  TO authenticated, service_role;

-- Existing non-unique indexes are intentionally retained. This exact partial
-- unique index makes one Auth user map to at most one membership row.
CREATE UNIQUE INDEX beta_access_used_by_user_unique
  ON public.beta_access (used_by_user_id)
  WHERE used_by_user_id IS NOT NULL;

-- Status membership remains governed by beta_access_status_check. This second
-- constraint governs the associated lifecycle fields without rewriting data.
ALTER TABLE public.beta_access
  ADD CONSTRAINT beta_access_lifecycle_shape_check
  CHECK (
    (
      status = 'used'
      AND used_by_user_id IS NOT NULL
      AND used_at IS NOT NULL
    )
    OR (
      status IN ('approved', 'invited')
      AND used_by_user_id IS NULL
      AND used_at IS NULL
    )
    OR status = 'revoked'
  ) NOT VALID;

ALTER TABLE public.beta_access
  VALIDATE CONSTRAINT beta_access_lifecycle_shape_check;

-- Atomic service-only invite consumption. Row locking closes the old
-- read-then-update race with a concurrent revoke. The unique index remains the
-- final guard against two different invite rows being consumed by one user.
CREATE FUNCTION public.consume_beta_access_invite(
  p_user_id uuid,
  p_email text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email text;
  v_auth_email text;
  v_invite_id uuid;
  v_status text;
  v_used_by_user_id uuid;
  v_used_at timestamptz;
  v_now timestamptz;
BEGIN
  v_email := lower(btrim(p_email));
  IF p_user_id IS NULL OR v_email IS NULL OR v_email = '' THEN
    RETURN 'not_eligible';
  END IF;

  SELECT lower(btrim(auth_user.email))
    INTO v_auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_user_id
  FOR KEY SHARE;

  IF v_auth_email IS NULL OR v_auth_email <> v_email THEN
    RETURN 'not_eligible';
  END IF;

  SELECT access.id, access.status, access.used_by_user_id, access.used_at
    INTO v_invite_id, v_status, v_used_by_user_id, v_used_at
  FROM public.beta_access AS access
  WHERE access.email_normalized = v_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_eligible';
  END IF;

  IF v_status = 'used' THEN
    IF v_used_by_user_id = p_user_id AND v_used_at IS NOT NULL THEN
      RETURN 'already_used';
    END IF;
    RETURN 'not_eligible';
  END IF;

  IF v_status NOT IN ('approved', 'invited')
     OR v_used_by_user_id IS NOT NULL
     OR v_used_at IS NOT NULL THEN
    RETURN 'not_eligible';
  END IF;

  v_now := clock_timestamp();
  BEGIN
    UPDATE public.beta_access
    SET status = 'used',
        used_at = v_now,
        used_by_user_id = p_user_id,
        updated_at = v_now
    WHERE id = v_invite_id
      AND status IN ('approved', 'invited')
      AND used_by_user_id IS NULL
      AND used_at IS NULL;

    IF NOT FOUND THEN
      RETURN 'not_eligible';
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN 'not_eligible';
  END;

  RETURN 'consumed';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.consume_beta_access_invite(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_beta_access_invite(uuid, text)
  TO service_role;

COMMIT;
