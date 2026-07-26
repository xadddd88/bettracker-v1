# Registration Invite Flow (Decision #050)

## Status

EXECUTED / VERIFIED / CLOSED 2026-07-26 — migration 021 applied + verified, PR #133
merged (production `60cb28c`), live routes verified server-side, founder-controlled
email round-trip confirmed, negative non-allowlisted path verified, and Supabase Invite
template/signup controls verified. See
`docs/registration-invite-flow-execution-record-050.md`.

Last updated: 2026-07-26

## Context

CPO audit P1: the registration route created a user with `email_confirm: true` and a
caller-supplied password **without proving the registrant owns the email**. Anyone who knew
an allowlisted address could register it first and set their own password, hijacking the
invited person's account before they signed up (`app/api/auth/register/route.ts`).

**Founder product decision (2026-07-10):** invite + set-password flow (Supabase
`inviteUserByEmail`) — an invite link is emailed to the address; the account becomes usable
only after the real mailbox owner clicks it and sets a password.

## Flow

1. **Request invite — `POST /api/auth/register` (email only, no password):** rate-limited +
   allowlist-checked. Only `approved` or a prior `invited` (resend) proceed. Sends
   `admin.auth.admin.inviteUserByEmail(email, { redirectTo: /auth/callback?next=/auth/set-password })`,
   marks the row `invited` (not `used`). **Every branch returns one NEUTRAL message**
   (`"If your email is approved … an invite link is on its way"`) — non-allowlisted, used,
   revoked, and already-registered all look identical, closing allowlist enumeration.
2. **Ownership proof:** the invite email goes to the real address. An attacker who knows an
   allowlisted email can only cause an invite to be sent to that address's inbox — they never
   receive the link, so they can never reach an authenticated set-password session. Pre-hijack
   closed.
3. **`/auth/callback`** exchanges the code for a session and honours a same-origin `next`
   param (open-redirect-guarded: must start with `/`, reject `//`).
4. **`/auth/set-password`** (new page) is gated on an authenticated session; the invitee sets
   a password via `supabase.auth.updateUser({ password })`, then calls the completion route.
5. **`POST /api/auth/complete-invite`** (authenticated) marks the invitee's `beta_access` row
   `used` (with `used_by_user_id`). Consumed only after ownership + intent are proven.
   Idempotent for the same user; blocks foreign/revoked rows (403).

## beta_access lifecycle (migration 021)

`approved → invited → used` (plus `revoked`). Migration 021 widens the status CHECK to include
`invited` and adds an `invited_at` column. Additive — existing rows stay valid.

## Security properties

- No account is usable without an emailed-link click (email ownership).
- No password is accepted at the request step — the pre-hijack password path is gone
  (`createUser({ email_confirm: true, password })` removed).
- Allowlist enumeration closed by a single neutral response across all branches.
- The invite is consumed (`used`) only on completion, so a spurious request cannot burn an
  invite before the real owner acts (it stays `invited`, re-sendable).
- Rate limited per IP (unchanged: 5/min, 15/hour, env-tunable).

## Tests

New CI suite `npm run test:auth-invite` (17 cases): email-only schema / no `createUser` /
no `email_confirm:true`, allowlist gating with one neutral response, invite sent + row marked
`invited`, resend from `invited`, not-allowlisted/used/revoked send no invite, already-
registered → neutral, invalid email 400, rate-limit 429; complete-invite auth-required,
consume-on-completion, idempotent same-user, 403 for foreign/revoked; callback open-redirect
guard; set-password session gate; migration 021 enum.

## Execution verification (completed 2026-07-26)

1. Founder confirmed a controlled production invite completed the real mailbox path:
   invite received → action link opened → password set → dashboard reached.
2. Read-only production state showed the same lifecycle reached `used`, with
   `invited_at`, `used_at`, `used_by_user_id`, and the matching Auth user present.
3. A unique non-allowlisted address received the neutral production response while creating
   0 `beta_access` rows and 0 `auth.users`; Auth logs showed no invite-send attempt for
   that address.
4. Supabase Auth → Email Templates → Invite uses `{{ .ConfirmationURL }}`; the production
   code supplies `/auth/callback?next=/auth/set-password` as the redirect target.
5. Supabase Auth keeps "Allow new users to sign up" OFF.

The verified delivery uses the current Supabase email service. Custom SMTP is not configured
and remains a separate scale/readiness follow-up before wider beta; it does not block or
reopen Decision #050.

## Non-goals

No change to the password Sign-In or Magic-Link login paths, no change to the allowlist
admin process (founder still approves rows), no programmatic invite-resend beyond re-running
the request (documented), no email-template redesign.
