# Beta Access — Operational Runbook

BetTracker AI is invite-only. New accounts require pre-approval in the `beta_access` table.

---

## Add a beta user

Run in the Supabase SQL Editor:

```sql
INSERT INTO beta_access (email, email_normalized)
VALUES ('user@example.com', lower(trim('user@example.com')));
```

---

## Revoke access

```sql
UPDATE beta_access
SET status = 'revoked', updated_at = now()
WHERE email_normalized = lower(trim('user@example.com'));
```

---

## Re-approve after revoke

```sql
UPDATE beta_access
SET status = 'approved', updated_at = now()
WHERE email_normalized = lower(trim('user@example.com'));
```

---

## View all approved users

```sql
SELECT email, status, used_at, created_at FROM beta_access ORDER BY created_at DESC;
```

---

## Environment variables required

| Variable | Where | Notes |
|----------|-------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` (local) + Vercel server-only env var | Never expose client-side. Find in Supabase → Project Settings → API → service_role secret. |

If this variable is missing, `POST /api/auth/register` returns `503` and logs a warning. No crash, no secret leak.

---

## Manual step required after migration 006

**Who:** Dima  
**When:** After migration 006 is applied and `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel

1. Go to Supabase dashboard → Authentication → Providers → Email
2. Disable **"Enable email signups"**

This is the hard enforcement layer. Without it, a determined user can bypass the UI by calling the Supabase Auth REST API directly.

---

## How the gate works

1. Register tab POSTs email + password to `POST /api/auth/register`
2. Server normalizes email: `email.toLowerCase().trim()`
3. Server queries `beta_access` via service role client (bypasses RLS)
4. If not found or not `approved` → `403` with closed beta message; no account created
5. If approved → creates user via `auth.admin.createUser`, marks entry as `used`
6. Client shows success message and switches to Sign In tab

---

## Residual risk

If Dima does not disable public Supabase email signup, a user who calls `POST https://<project>.supabase.co/auth/v1/signup` directly can still register. The manual dashboard step above is the hard gate. A future hardening sprint can add a Supabase Auth Hook (Edge Function) for fully automated enforcement.
