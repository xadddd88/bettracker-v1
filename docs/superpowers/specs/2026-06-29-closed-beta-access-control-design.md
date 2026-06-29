# Sprint 8 — Closed Beta Access Control

**Date:** 2026-06-29
**Status:** Approved
**PR:** `feat: add closed beta email allowlist`
**Scope:** `app/api/auth/register`, `lib/supabase/admin.ts`, `lib/analytics/events.ts`, `app/(auth)/login/page.tsx`, migration 006

---

## Goal

Close public registration for BetTracker AI. Only emails pre-approved in a `beta_access` table can create accounts. Existing users sign in normally without any change to their flow.

---

## What is NOT in scope

- Invite codes
- Onboarding flow
- Feedback loop
- Any product feature changes
- Changes to Sign In or Magic Link tabs
- Changes to settlement math, Scout, Coach, Analyst, Bankroll, or any other product flow

---

## Architecture

Registration is intercepted server-side before it reaches Supabase. The client-side `supabase.auth.signUp()` call on the Register tab is replaced with a POST to a new server route that owns the gate.

```
Login page (Register tab)
  │
  POST /api/auth/register
  │
  ├── 1. Zod: validate email (valid format) + password (min 8 chars)
  ├── 2. Normalise: email.toLowerCase().trim()
  ├── 3. Query beta_access WHERE lower(trim(email)) = normalised AND status = 'approved'
  │         uses service role client → bypasses RLS → safe server-only read
  │
  ├── 4a. Not found / revoked
  │         → track beta_signup_blocked { reason, source }
  │         → return 403 { error: 'not_allowlisted' | 'revoked' }
  │         → UI shows: "BetTracker AI is currently in closed beta. Ask for access to join."
  │
  └── 4b. Found (status = 'approved')
            → track beta_signup_allowed { source }
            → supabase.auth.admin.createUser({ email, password, email_confirm: false })
            → UPDATE beta_access SET used_at = now(), status = 'used' WHERE id = ...
            → track beta_signup_completed { source }
            → return 200 { message: 'Check your email to confirm your account.' }
```

**Hard enforcement:** Supabase public email signup is disabled in the Supabase dashboard after migration 006 is applied. This blocks direct API calls that bypass the UI.

---

## Database — migration 006

File: `supabase/migrations/006_beta_access.sql`

```sql
create table if not exists beta_access (
  id          uuid        primary key default gen_random_uuid(),
  email       text        not null,
  status      text        not null default 'approved'
                          check (status in ('approved', 'used', 'revoked')),
  used_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- case-insensitive uniqueness enforced at index level
create unique index if not exists beta_access_email_lower_idx
  on beta_access (lower(trim(email)));

create index if not exists beta_access_status_idx
  on beta_access (status);

alter table beta_access enable row level security;

-- No public SELECT, INSERT, UPDATE, or DELETE policies.
-- All access goes through the service role client in the server route.
```

### How to add a beta user (SQL Editor in Supabase)

```sql
INSERT INTO beta_access (email) VALUES ('user@example.com');
```

### How to revoke access

```sql
UPDATE beta_access SET status = 'revoked', updated_at = now()
WHERE lower(trim(email)) = lower(trim('user@example.com'));
```

### How to re-approve after revoke

```sql
UPDATE beta_access SET status = 'approved', updated_at = now()
WHERE lower(trim(email)) = lower(trim('user@example.com'));
```

---

## Service Role Key

`SUPABASE_SERVICE_ROLE_KEY` is required for the register route to call `supabase.auth.admin.createUser()`.

**This key must never be committed or exposed client-side.**

### Where to add it

| Environment | How |
|-------------|-----|
| Local dev | `.env.local` → `SUPABASE_SERVICE_ROLE_KEY=<value>` (already in .gitignore) |
| Vercel production | Vercel dashboard → Settings → Environment Variables → add as server-only (not `NEXT_PUBLIC_`) |

Find the key in: Supabase dashboard → Project Settings → API → `service_role` secret.

### If the key is missing

The register route returns `503 { error: 'registration_unavailable' }` and logs a server warning. No crash, no secret leak, no user confusion.

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `supabase/migrations/006_beta_access.sql` | New | beta_access table + RLS |
| `lib/supabase/admin.ts` | New | Service role Supabase client |
| `app/api/auth/register/route.ts` | New | Allowlist check + admin user creation |
| `app/(auth)/login/page.tsx` | Modified | Register tab POSTs to server route |
| `lib/analytics/events.ts` | Modified | 4 new beta signup events |
| `docs/product/beta-access.md` | New | Operational runbook |

---

## New Analytics Events

Added to `lib/analytics/events.ts`:

| Event constant | String value | When fired |
|---------------|-------------|------------|
| `BETA_SIGNUP_ATTEMPTED` | `beta_signup_attempted` | Every register submit (before allowlist check) |
| `BETA_SIGNUP_ALLOWED` | `beta_signup_allowed` | Email is on the approved list |
| `BETA_SIGNUP_BLOCKED` | `beta_signup_blocked` | Email is not approved or revoked |
| `BETA_SIGNUP_COMPLETED` | `beta_signup_completed` | Account created successfully |

Properties tracked (no email sent to PostHog):

```typescript
// beta_signup_attempted
{ source: 'login_page' }

// beta_signup_allowed
{ source: 'login_page' }

// beta_signup_blocked
{ source: 'login_page', reason: 'not_allowlisted' | 'revoked' }

// beta_signup_completed
{ source: 'login_page' }
```

---

## UI Behaviour

### Register tab

| State | Message shown |
|-------|--------------|
| Blocked (any reason) | `"BetTracker AI is currently in closed beta. Ask for access to join."` |
| Allowed + account created | `"Check your email to confirm your account."` |
| Service key missing (503) | `"Beta registration is temporarily unavailable. Try again later."` |
| Network / unknown error | `"Something went wrong. Please try again."` |

The error message does **not** distinguish between "not in list" and "revoked" — intentional, avoids enumeration.

### Sign In tab — no change

### Magic Link tab — no change

---

## Manual Step Required After Migration

**Who:** Dima
**When:** After migration 006 is applied and `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel

1. Go to Supabase dashboard
2. Authentication → Providers → Email
3. Disable **"Enable email signups"**

This is the hard gate. Without it, a user who calls `POST https://<project>.supabase.co/auth/v1/signup` directly can still create an account.

---

## Security Notes

- `beta_access` has RLS enabled with no public policies — normal anon/user clients cannot query it
- The service role client (`lib/supabase/admin.ts`) is never imported in client components
- `SUPABASE_SERVICE_ROLE_KEY` is a server-only env var (no `NEXT_PUBLIC_` prefix)
- The register route does not reveal whether an email exists in the list — both "not found" and "revoked" return the same user-facing message
- Disabling Supabase public signup is the enforcement layer; the server route is the product layer

### Known residual risk

If Dima does not disable public Supabase signup, a determined user can bypass the UI by calling the Supabase Auth REST API directly. This is documented and mitigated by the manual dashboard step above. A future hardening sprint could add a Supabase Auth Hook (Edge Function) for fully automated enforcement.

---

## Acceptance Criteria

- [ ] Existing user can sign in with email/password
- [ ] Existing user can sign in with magic link
- [ ] Approved email can register and receives confirmation email
- [ ] Non-approved email receives closed beta message; no account created
- [ ] Revoked email receives closed beta message; no account created
- [ ] `beta_signup_attempted`, `beta_signup_blocked`, `beta_signup_allowed`, `beta_signup_completed` fire correctly in PostHog
- [ ] `beta_access` table is not readable by normal authenticated users
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is not committed to git
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] PR opened, not merged before CPO review
- [ ] Supabase dashboard: public email signup disabled (manual step, post-deploy)
