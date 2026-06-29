# Closed Beta Access Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate new account creation behind an email allowlist stored in Supabase, enforced server-side, so only pre-approved emails can register during closed beta.

**Architecture:** A new `POST /api/auth/register` route checks `beta_access` table via service role client before calling `supabase.auth.admin.createUser()`. The login page Register tab posts to this route instead of calling Supabase directly. Supabase public email signup is disabled manually in the dashboard to close the direct-API bypass.

**Tech Stack:** Next.js 15 App Router · Supabase (`@supabase/supabase-js` v2 admin API) · Zod · PostHog server-side analytics

## Global Constraints

- `SUPABASE_SERVICE_ROLE_KEY` must never be committed, printed, or logged — add to `.env.local` locally and Vercel server env only
- No invite codes, no onboarding, no feedback system in this PR
- No changes to Sign In tab, Magic Link tab, middleware, auth callback, or any product route
- Migration number is **006** (001–005 are in use)
- Branch: `feat/closed-beta-allowlist`
- PR title: `feat: add closed beta email allowlist`
- Do not merge before CPO review
- `npm run lint` and `npm run build` must pass before pushing

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/006_beta_access.sql` | Create | `beta_access` table + RLS |
| `lib/analytics/events.ts` | Modify | 4 new beta signup event constants |
| `lib/supabase/admin.ts` | Create | Service role Supabase client |
| `app/api/auth/register/route.ts` | Create | Allowlist check + admin user creation |
| `app/(auth)/login/page.tsx` | Modify | Register tab posts to server route; success state |
| `docs/product/beta-access.md` | Create | Operational runbook for Dima |

---

### Task 1: Branch + migration 006

**Files:**
- Create: `supabase/migrations/006_beta_access.sql`

**Interfaces:**
- Produces: `beta_access` table with columns consumed by Task 4's register route

- [ ] **Step 1: Create branch**

```bash
git checkout main
git pull origin main
git checkout -b feat/closed-beta-allowlist
```

Expected: `Switched to a new branch 'feat/closed-beta-allowlist'`

- [ ] **Step 2: Write migration 006**

Create `supabase/migrations/006_beta_access.sql` with this exact content:

```sql
-- 006_beta_access.sql
-- Closed beta email allowlist.
-- Apply in Supabase SQL Editor, then disable public email signup in
-- Authentication → Providers → Email → "Enable email signups" → OFF

create table if not exists beta_access (
  id                uuid        primary key default gen_random_uuid(),
  email             text        not null,
  email_normalized  text        not null unique,
  status            text        not null default 'approved'
                                check (status in ('approved', 'used', 'revoked')),
  used_at           timestamptz,
  used_by_user_id   uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists beta_access_status_idx
  on beta_access (status);

alter table beta_access enable row level security;

-- No SELECT / INSERT / UPDATE / DELETE policies for anon or authenticated roles.
-- All reads and writes go through the service role client in /api/auth/register.
```

- [ ] **Step 3: Verify migration file is correct**

```bash
cat supabase/migrations/006_beta_access.sql
```

Expected: file prints cleanly, no typos in column names.

- [ ] **Step 4: Commit migration**

```bash
git add supabase/migrations/006_beta_access.sql
git commit -m "feat: add beta_access migration 006"
```

> **Manual step for Dima (after this PR is merged and deployed):**
> 1. Open Supabase SQL Editor
> 2. Run `supabase/migrations/006_beta_access.sql`
> 3. Go to Authentication → Providers → Email → disable **"Enable email signups"**
> 4. Add approved beta emails: `INSERT INTO beta_access (email, email_normalized) VALUES ('user@example.com', 'user@example.com');`

---

### Task 2: Add analytics event constants

**Files:**
- Modify: `lib/analytics/events.ts:36-43` (after the Scout section)

**Interfaces:**
- Produces: `EVENTS.BETA_SIGNUP_ATTEMPTED`, `EVENTS.BETA_SIGNUP_ALLOWED`, `EVENTS.BETA_SIGNUP_BLOCKED`, `EVENTS.BETA_SIGNUP_COMPLETED` — consumed by Task 4

- [ ] **Step 1: Add the four new events to the EVENTS object**

Open `lib/analytics/events.ts`. Find the Scout section (ends around line 44). Add a new `// Beta signup` section immediately after `OPPORTUNITY_DISMISSED`:

```typescript
  // Beta signup
  BETA_SIGNUP_ATTEMPTED: 'beta_signup_attempted',
  BETA_SIGNUP_ALLOWED:   'beta_signup_allowed',
  BETA_SIGNUP_BLOCKED:   'beta_signup_blocked',
  BETA_SIGNUP_COMPLETED: 'beta_signup_completed',
```

The Scout section after the edit looks like:

```typescript
  // Scout
  SCOUT_STARTED:             'scout_started',
  SCOUT_COMPLETED:           'scout_completed',
  SCOUT_FAILED:              'scout_failed',
  SCOUT_PAGE_VIEWED:         'scout_page_viewed',
  SCOUT_WEB_SEARCH_FALLBACK: 'scout_web_search_fallback',
  SCOUT_RATE_LIMITED:        'scout_rate_limited',
  OPPORTUNITY_ANALYSED:      'opportunity_analysed',
  OPPORTUNITY_WATCHLISTED:   'opportunity_watchlisted',
  OPPORTUNITY_DISMISSED:     'opportunity_dismissed',

  // Beta signup
  BETA_SIGNUP_ATTEMPTED: 'beta_signup_attempted',
  BETA_SIGNUP_ALLOWED:   'beta_signup_allowed',
  BETA_SIGNUP_BLOCKED:   'beta_signup_blocked',
  BETA_SIGNUP_COMPLETED: 'beta_signup_completed',
```

- [ ] **Step 2: Commit**

```bash
git add lib/analytics/events.ts
git commit -m "feat: add beta signup analytics events"
```

---

### Task 3: Admin Supabase client

**Files:**
- Create: `lib/supabase/admin.ts`

**Interfaces:**
- Produces: `createAdminClient()` — returns a Supabase client with service role privileges. Consumed by Task 4.
- Throws `Error('SUPABASE_SERVICE_ROLE_KEY is not set')` if the env var is missing.

- [ ] **Step 1: Create lib/supabase/admin.ts**

```typescript
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession:   false,
      },
    }
  )
}
```

**Why `autoRefreshToken: false` and `persistSession: false`:** The admin client is used in a server route with a request-scoped lifetime. It must not attempt to refresh tokens or persist session state to cookies.

- [ ] **Step 2: Verify no secret is in the file**

```bash
grep -i "service_role\|secret\|key" lib/supabase/admin.ts
```

Expected: only the string `'SUPABASE_SERVICE_ROLE_KEY'` (the env var name, not its value).

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/admin.ts
git commit -m "feat: add service role admin client"
```

---

### Task 4: Server-side registration route

**Files:**
- Create: `app/api/auth/register/route.ts`

**Interfaces:**
- Consumes: `createAdminClient()` from `lib/supabase/admin.ts` (Task 3)
- Consumes: `EVENTS.BETA_SIGNUP_*` from `lib/analytics/events.ts` (Task 2)
- Consumes: `beta_access` table (Task 1)
- Produces: `POST /api/auth/register` — returns `{ success: true, message }` or `{ success: false, error }`

**Request shape:**
```json
{ "email": "user@example.com", "password": "minlength8" }
```

**Response shapes:**

| Case | Status | Body |
|------|--------|------|
| Invalid input | 400 | `{ success: false, error: "Invalid email or password." }` |
| Service key missing | 503 | `{ success: false, error: "Beta registration is temporarily unavailable. Try again later." }` |
| DB lookup error | 503 | `{ success: false, error: "Beta registration is temporarily unavailable. Try again later." }` |
| Not in list or used/revoked | 403 | `{ success: false, error: "BetTracker AI is currently in closed beta. Ask for access to join." }` |
| createUser fails | 503 | `{ success: false, error: "Beta registration is temporarily unavailable. Try again later." }` |
| Success | 200 | `{ success: true, message: "Account created. You can now sign in." }` |

- [ ] **Step 1: Create the route file**

Create `app/api/auth/register/route.ts` with this exact content:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { trackServerEvent } from '@/lib/analytics/server'
import { EVENTS } from '@/lib/analytics/events'

const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  // 1. Parse + validate input
  let body: unknown
  try { body = await req.json() } catch { body = null }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid email or password.' },
      { status: 400 },
    )
  }

  const { email, password } = parsed.data
  const emailNormalized = email.toLowerCase().trim()

  // Use a random distinct ID for pre-auth PostHog events (no email sent to PostHog)
  const anonId = randomUUID()

  await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_ATTEMPTED, { source: 'login_page' })

  // 2. Initialise admin client (requires SUPABASE_SERVICE_ROLE_KEY)
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    console.error('[register] SUPABASE_SERVICE_ROLE_KEY is not configured')
    await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_BLOCKED, {
      source: 'login_page',
      reason: 'service_unavailable',
    })
    return NextResponse.json(
      { success: false, error: 'Beta registration is temporarily unavailable. Try again later.' },
      { status: 503 },
    )
  }

  // 3. Check allowlist
  const { data: entry, error: lookupErr } = await admin
    .from('beta_access')
    .select('id, status')
    .eq('email_normalized', emailNormalized)
    .maybeSingle()

  if (lookupErr) {
    console.error('[register] beta_access lookup error:', lookupErr.message)
    await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_BLOCKED, {
      source: 'login_page',
      reason: 'service_unavailable',
    })
    return NextResponse.json(
      { success: false, error: 'Beta registration is temporarily unavailable. Try again later.' },
      { status: 503 },
    )
  }

  if (!entry || entry.status !== 'approved') {
    const reason = !entry ? 'not_allowlisted' : 'revoked_or_used'
    await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_BLOCKED, {
      source: 'login_page',
      reason,
    })
    return NextResponse.json(
      {
        success: false,
        error:   'BetTracker AI is currently in closed beta. Ask for access to join.',
      },
      { status: 403 },
    )
  }

  // 4. Track allowed — email is approved, proceeding to create account
  await trackServerEvent(anonId, EVENTS.BETA_SIGNUP_ALLOWED, { source: 'login_page' })

  // 5. Create user (email_confirm: true — no email confirmation required)
  const { data: authData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createErr || !authData?.user) {
    console.error('[register] createUser failed:', createErr?.message)
    return NextResponse.json(
      { success: false, error: 'Beta registration is temporarily unavailable. Try again later.' },
      { status: 503 },
    )
  }

  // 6. Mark beta_access entry as used (only after user is created successfully)
  await admin
    .from('beta_access')
    .update({
      status:          'used',
      used_at:         new Date().toISOString(),
      used_by_user_id: authData.user.id,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', entry.id)

  // 7. Track completed (now we have the real user ID)
  await trackServerEvent(authData.user.id, EVENTS.BETA_SIGNUP_COMPLETED, {
    source: 'login_page',
    reason: 'success',
  })

  return NextResponse.json({
    success: true,
    message: 'Account created. You can now sign in.',
  })
}
```

- [ ] **Step 2: Verify no secrets in the file**

```bash
grep -i "service_role\|supabase_service\|secret" app/api/auth/register/route.ts
```

Expected: no matches (the file imports `createAdminClient` which handles the key internally).

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/register/route.ts
git commit -m "feat: add server-side closed beta registration route"
```

---

### Task 5: Update login page Register tab

**Files:**
- Modify: `app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/register` (Task 4)
- Change: Replace `supabase.auth.signUp()` in the register branch with a `fetch` to the server route
- Add: `successMsg` state for green success message (separate from red `error` state)

- [ ] **Step 1: Replace the login page with the hardened version**

Replace the entire content of `app/(auth)/login/page.tsx` with:

```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [mode, setMode] = useState<'login' | 'register' | 'magic'>('login')
  const [magicSent, setMagicSent] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccessMsg('')

    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (error) throw error
        setMagicSent(true)
      } else if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email, password }),
        })
        const json = await res.json() as { success: boolean; error?: string; message?: string }
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? 'Something went wrong. Please try again.')
        }
        setSuccessMsg(json.message ?? 'Account created. You can now sign in.')
        setMode('login')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-white mb-1">BetTracker</div>
          <div className="text-sm text-gray-500">Analytical platform for bettors</div>
        </div>

        {/* Card */}
        <div className="card">
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1 mb-6">
            {(['login', 'register', 'magic'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setSuccessMsg(''); setMagicSent(false) }}
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                  mode === m ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Sign In' : m === 'register' ? 'Register' : 'Magic Link'}
              </button>
            ))}
          </div>

          {magicSent ? (
            <div className="text-center py-4">
              <div className="text-2xl mb-2">✉️</div>
              <div className="text-sm text-gray-300">Check your email for a login link.</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="label">Email</label>
                <input
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {mode !== 'magic' && (
                <div>
                  <label className="label">Password</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              )}

              {error && (
                <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              {successMsg && (
                <div className="text-xs text-green-400 bg-green-950/40 border border-green-900 rounded-lg px-3 py-2">
                  {successMsg}
                </div>
              )}

              <button type="submit" className="btn-primary w-full mt-1" disabled={loading}>
                {loading
                  ? 'Loading...'
                  : mode === 'magic'
                    ? 'Send Magic Link'
                    : mode === 'register'
                      ? 'Create Account'
                      : 'Sign In'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify Sign In and Magic Link tabs are untouched**

Confirm the `mode === 'magic'` and `mode === 'login'` branches are identical to the original file. Only the `mode === 'register'` branch changed.

- [ ] **Step 3: Commit**

```bash
git add app/(auth)/login/page.tsx
git commit -m "feat: gate Register tab behind closed beta server route"
```

---

### Task 6: Operational runbook + lint + build + push + PR

**Files:**
- Create: `docs/product/beta-access.md`

- [ ] **Step 1: Create the runbook**

Create `docs/product/beta-access.md` with this exact content:

```markdown
# Beta Access Control — Runbook

**Approach:** Email allowlist via `beta_access` Supabase table. Server-side enforcement via `POST /api/auth/register`.

## How it works

1. User clicks Register on `/login`
2. Client POSTs `{ email, password }` to `/api/auth/register`
3. Server normalises email (`lower(trim(email))`) and queries `beta_access`
4. If `status = 'approved'`: creates account via Supabase Admin API, marks entry as `used`
5. If not found or `status != 'approved'`: returns 403, user sees closed beta message

## Manual step required after migration 006 is applied

> **Without this step, the gate is UI-only — not a hard block.**

1. Supabase Dashboard → **Authentication** → **Providers** → **Email**
2. Disable **"Enable email signups"**

This prevents direct calls to `POST https://<project>.supabase.co/auth/v1/signup`.

## Adding a beta user (SQL Editor in Supabase)

```sql
INSERT INTO beta_access (email, email_normalized)
VALUES ('user@example.com', 'user@example.com');
```

Emails are stored as-entered in `email` and lowercase-trimmed in `email_normalized`.

## Revoking access

```sql
UPDATE beta_access
SET status = 'revoked', updated_at = now()
WHERE email_normalized = 'user@example.com';
```

## Re-approving a revoked email

```sql
UPDATE beta_access
SET status = 'approved', used_at = null, used_by_user_id = null, updated_at = now()
WHERE email_normalized = 'user@example.com';
```

## Environment variables required

| Variable | Where to add | Notes |
|----------|-------------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` (local) + Vercel server env | Never `NEXT_PUBLIC_`. Never commit. |

Find the key: Supabase Dashboard → Project Settings → API → `service_role` secret.

## PostHog events

| Event | When |
|-------|------|
| `beta_signup_attempted` | Every register submit |
| `beta_signup_allowed` | Email approved, proceeding to create account |
| `beta_signup_blocked` | Blocked — see `reason` property |
| `beta_signup_completed` | Account created successfully |

`reason` values on `beta_signup_blocked`: `not_allowlisted` · `revoked_or_used` · `service_unavailable`

## Known risks

- If `SUPABASE_SERVICE_ROLE_KEY` is not set in Vercel, registration returns 503
- If Supabase public signup is not disabled, the gate can be bypassed via direct API calls
- In-flight registrations between adding to allowlist and disabling public signup are not a concern — both are controlled by Dima
```

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: `✔ No ESLint warnings or errors`

If lint fails on `app/api/auth/register/route.ts`: the most common issue is an unused import. Remove it and re-run.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: build completes with no TypeScript errors. All routes compile.

If TypeScript complains about `admin.auth.admin.createUser` — the `@supabase/supabase-js` v2 admin API is typed at `SupabaseClient.auth.admin`. Confirm `createAdminClient()` returns `SupabaseClient` (it does — `createClient` from `@supabase/supabase-js` returns `SupabaseClient`).

- [ ] **Step 4: Commit docs**

```bash
git add docs/product/beta-access.md
git commit -m "docs: closed beta access control runbook"
```

- [ ] **Step 5: Push branch**

```bash
git push -u origin feat/closed-beta-allowlist
```

- [ ] **Step 6: Open PR**

Use Bash tool (not PowerShell) for the heredoc:

```bash
gh pr create \
  --title "feat: add closed beta email allowlist" \
  --body "$(cat <<'EOF'
## Summary

- New `beta_access` Supabase table (migration 006) — email allowlist with `approved / used / revoked` states
- New `POST /api/auth/register` server route — checks allowlist via service role client, creates user via Supabase Admin API
- Register tab on `/login` now posts to the server route instead of calling `supabase.auth.signUp()` directly
- Blocked emails see: *"BetTracker AI is currently in closed beta. Ask for access to join."*
- Approved emails get account created immediately (`email_confirm: true`) and see: *"Account created. You can now sign in."*
- Sign In and Magic Link tabs: unchanged
- 4 new PostHog events: `beta_signup_attempted / allowed / blocked / completed`

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` is server-only, never committed
- `beta_access` RLS: no public policies — only service role can read/write
- Error messages do not distinguish "not in list" from "revoked" — intentional

## Manual steps required after merge (Dima)

1. Apply `supabase/migrations/006_beta_access.sql` in Supabase SQL Editor
2. Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel → Settings → Environment Variables (server-only, not NEXT\_PUBLIC\_)
3. Supabase Dashboard → Authentication → Providers → Email → disable **"Enable email signups"**
4. Seed initial beta users: `INSERT INTO beta_access (email, email_normalized) VALUES ('...', '...');`

## Files changed

- `supabase/migrations/006_beta_access.sql` — new
- `lib/supabase/admin.ts` — new
- `app/api/auth/register/route.ts` — new
- `app/(auth)/login/page.tsx` — Register tab hardened
- `lib/analytics/events.ts` — 4 new events
- `docs/product/beta-access.md` — runbook

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Confirm PR is open and NOT merged**

```bash
gh pr view --json url,state
```

Expected: `"state": "OPEN"`. Do not merge before CPO review.

---

## Self-Review

**Spec coverage:**
- ✅ `beta_access` table with all 7 columns including `email_normalized`, `used_by_user_id` — Task 1
- ✅ `email_normalized` as explicit column (not generated) — Task 1
- ✅ RLS enabled, no public policies — Task 1
- ✅ Service role client — Task 3, never exposes key
- ✅ `POST /api/auth/register` — Task 4, complete flow
- ✅ Normalize email `lower(trim(email))` — Task 4 (`emailNormalized` variable)
- ✅ Block `used` and `revoked` with same generic message — Task 4 (`entry.status !== 'approved'`)
- ✅ Mark `used_at` + `used_by_user_id` only after `createUser` succeeds — Task 4 step 6
- ✅ `email_confirm: true` → success message "Account created. You can now sign in." — Task 4 + Task 5
- ✅ All 4 analytics events with correct `reason` values — Task 2 + Task 4
- ✅ No email sent to PostHog — Task 4 uses `randomUUID()` as `anonId`
- ✅ `503` when service key missing — Task 4
- ✅ Sign In and Magic Link unchanged — Task 5 (only `register` branch touched)
- ✅ `successMsg` state (green) separate from `error` state (red) — Task 5
- ✅ Runbook with add/revoke SQL, manual Supabase step, env var instructions — Task 6
- ✅ lint + build + PR — Task 6

**Type consistency:** `createAdminClient()` defined in Task 3, used in Task 4 ✓ · `EVENTS.BETA_SIGNUP_*` defined in Task 2, used in Task 4 ✓ · `beta_access.email_normalized` column defined in Task 1, queried in Task 4 ✓
