# Execution Record — Registration Invite Flow (Decision #050)

## Status

EXECUTED / VERIFIED / CLOSED 2026-07-26 — migration applied, merged, routes verified,
founder-controlled email round-trip confirmed, negative non-allowlisted path verified, and
Supabase Invite template/signup controls verified. Rides under Decision #050.

## Sequence executed

1. **Migration 021 applied** via Supabase migration tooling
   (`beta_access_invite_flow_021`) and verified: `invited_at` column present; status CHECK =
   `('approved','invited','used','revoked')`; the 3 existing rows untouched
   (1 approved, 2 used).
2. **PR #133 merged** (squash → `60cb28c`).
3. **Production READY** (deploy of `60cb28c`).
4. **Live route verification (HTTP + DB):**

   | Check | Result |
   |-------|--------|
   | `POST /api/auth/register` non-allowlisted email | 200, neutral message ("an invite link is on its way") ✓ |
   | `POST /api/auth/register` with a `password` in the body | 200 neutral — password ignored (email-only schema) ✓ |
   | `POST /api/auth/register` invalid email | 400 ✓ |
   | `POST /api/auth/complete-invite` unauthenticated | 401 ✓ |
   | `GET /auth/set-password` | 200 reachable ✓ |
   | DB after non-allowlisted attempts | 0 stray `beta_access` rows, 0 stray `auth.users` — no side effects, no enumeration ✓ |

## Founder round-trip and production verification — completed 2026-07-26

| Check | Evidence |
|-------|----------|
| Controlled invite delivery | Founder confirmed the production invite email arrived |
| Action link and session | Link opened the callback/set-password flow |
| Password and destination | Password was set and dashboard reached |
| Lifecycle | Read-only state showed `invited_at`, `used_at`, `used_by_user_id`, status `used`, and a matching Auth user |
| Non-allowlisted request | Neutral response; 0 `beta_access` rows; 0 `auth.users`; no invite-send log for the unique test address |
| Invite template | Supabase Invite template uses `{{ .ConfirmationURL }}`; runtime supplies `/auth/callback?next=/auth/set-password` |
| Signup control | "Allow new users to sign up" is OFF |

The verified delivery uses the current Supabase email service. Custom SMTP is not configured
and remains a separate scale/readiness follow-up before wider beta; it is not part of this
closure and does not reopen Decision #050.

## Security properties confirmed server-side## Security properties confirmed server-side

- The password path (`createUser({ email_confirm: true, password })`) is gone — no account is
  created from a caller-supplied password.
- Allowlist enumeration is closed — every register branch returns one neutral response and a
  non-allowlisted attempt creates no row and no user.
- `complete-invite` is authenticated and binds consumption to `auth.uid()`'s email, not the
  request body.
- The founder-confirmed mailbox path and matching `used` lifecycle verify email ownership
  through the deployed flow.

## Holds unchanged

Football enrichment, odds work, new provider calls, and new betting-signal surfaces remain
on HOLD.
