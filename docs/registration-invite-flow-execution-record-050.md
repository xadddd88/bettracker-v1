# Execution Record — Registration Invite Flow (Decision #050)

## Status

PARTIALLY EXECUTED 2026-07-10 — migration applied, merged, server-side verified. **The
SMTP email round-trip is PENDING a founder test** (cannot be verified from the automation
environment). Rides under Decision #050.

## Sequence executed (server-verifiable portion)

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

## PENDING — founder email round-trip (SMTP-dependent, cannot automate)

`inviteUserByEmail` sends a real email; the automation environment cannot receive it. Before
this flow is trusted in production the founder must confirm:

1. Approve a real test email in `beta_access` (status `approved`).
2. On the login page, Register tab → enter that email → "Send Invite Link" → neutral message.
3. Receive the invite email; the action link should open `/auth/callback?next=/auth/set-password`.
4. Land on `/auth/set-password` (authenticated), set a password, reach the dashboard.
5. Verify the `beta_access` row moved `approved → invited → used` with `used_by_user_id` set.
6. Verify a NON-allowlisted email gets the neutral message and **no email arrives**.

Supabase dashboard checks (founder):
- Auth → Email Templates → **Invite**: action link points at the site `/auth/callback`.
- Auth → Providers → Email → **"Enable email signups" OFF** (allowlist is enforced
  server-side; the invite path uses the service role).

Once the founder confirms the round-trip, this record is updated to EXECUTED.

## Security properties confirmed server-side

- The password path (`createUser({ email_confirm: true, password })`) is gone — no account is
  created from a caller-supplied password.
- Allowlist enumeration is closed — every register branch returns one neutral response and a
  non-allowlisted attempt creates no row and no user.
- `complete-invite` is authenticated and binds consumption to `auth.uid()`'s email, not the
  request body.

## Holds unchanged

Football enrichment, odds work, new provider calls, and new betting-signal surfaces remain
on HOLD.
