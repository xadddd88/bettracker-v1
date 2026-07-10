-- ============================================================
-- Migration 021: beta_access invite lifecycle (Decision #050)
--
-- Closes the registration pre-hijack: the old flow created a
-- user with email_confirm:true and a caller-supplied password
-- WITHOUT proving the registrant owns the email, so anyone who
-- knew an allowlisted address could claim the account first.
--
-- New lifecycle: approved → invited → used
--   approved : founder-approved, no invite sent yet
--   invited  : an invite email was sent (Supabase inviteUserByEmail);
--              the account exists but has no usable password until
--              the real mailbox owner clicks the link and sets one
--   used     : the invitee proved ownership (clicked the emailed
--              link) AND set a password — invite consumed
--   revoked  : access withdrawn
--
-- Additive: widens the status CHECK and adds invited_at. No data
-- backfill — existing 'approved'/'used'/'revoked' rows are valid.
-- ============================================================

ALTER TABLE beta_access
  ADD COLUMN IF NOT EXISTS invited_at timestamptz;

ALTER TABLE beta_access DROP CONSTRAINT IF EXISTS beta_access_status_check;
ALTER TABLE beta_access
  ADD CONSTRAINT beta_access_status_check
  CHECK (status IN ('approved', 'invited', 'used', 'revoked'));
