# Security S2.2 — Active Membership Enforcement

Date: 2026-08-11
Baseline: `main@63b1c8668eafbea610a6bfedca3f4126ce11d514`
Mode: repository-only detached working tree; no branch, commit, PR, deployment, or live write

## Security invariant

An authenticated Web or user API request is authorized only when a live
`beta_access` lookup returns exactly one row with both:

- `status = 'used'`;
- `used_by_user_id = <verified Supabase Auth user id>`.

Missing, approved, invited, revoked, or foreign membership is inactive. A
missing service configuration, query error, timeout, malformed row, or duplicate
response is unavailable. Inactive and unavailable states always fail closed.
No authorization decision uses email, caller-supplied identity, JWT metadata, or
`user_metadata`.

## Enforcement map

- `lib/supabase/active-membership.ts` is the sole server-only TypeScript
  membership predicate. Its admin client performs only the membership lookup.
- `middleware.ts` gates protected non-API navigation before protected React
  Server Components execute. `/login`, `/auth/*`, `/access-denied`,
  `/service-unavailable`, and `/api/*` remain outside this Web redirect gate.
- `app/(app)/layout.tsx` repeats the same primitive as defense in depth.
- `authenticateActiveMemberRequest()` preserves the existing cookie/Bearer
  authentication contract and adds live membership with `401`, `403`, and `503`
  outcomes.
- Domain reads and writes continue through the verified user's Supabase client.
  The service-role client is never reused for product data.
- `POST /api/auth/complete-invite` performs one service-only
  `consume_beta_access_invite` RPC call. `consumed` and `already_used` return
  `200`, `not_eligible` returns `403`, and errors or unknown outcomes return
  `503`. Analytics is emitted only for `consumed`.

## Exact API inventory

The inventory contains 28 routes and no unclassified entry point:

- 18 user routes: Analyst, Scanner, bankroll deposit, bet cancel/settle/tracked,
  Coach, feedback, onboarding completion, risk evaluation, Scout list/detail,
  settings, tennis 40:40, and four tennis-series commands;
- 7 `/api/admin/*` machine routes with their existing OIDC/service boundary;
- 2 Auth bootstrap routes: register and complete-invite;
- 1 CSP report-ingestion route.

The four tennis-series routes delegate through `lib/tennis/server-write.ts`,
which owns their one shared membership gate. Existing ownership checks and all
user-scoped RPC identity derivation remain unchanged.

## Cookie and CSP compatibility delta

Supabase may refresh cookies during `auth.getUser()`. Every membership redirect
copies all cookies from the current Supabase response to the redirect response;
the pass response is unchanged. The CSP policy remains
`Content-Security-Policy-Report-Only` with the existing sources and
`'unsafe-inline'`. S2.2 adds no nonce, enforcement header, `strict-dynamic`, or
wildcard source.

## Residual S2.3 boundary

S2.2 is Web/server enforcement only. Direct Data API access and the eight
authenticated `SECURITY DEFINER` RPCs still rely on their current RLS and
ownership contracts. S2.3 must add restrictive membership policies and an
active-membership assertion to all eight RPCs without replacing any ownership
predicate. S2.2 alone must not be described as complete revocation enforcement.

## Verification record

The final local audit records these independently:

- focused S2.2 contract and exact route inventory;
- Auth/invite, financial, domain, tennis, analysis-quality, CSP, S2.1, typecheck,
  lint, build, and diff-scope regressions;
- hermetic browser acceptance, or a local Chromium blocker without installation;
- AI baseline diagnostic and the pre-existing hardcoded baseline pin, without
  changing that pin.

No test in this slice may call production, Supabase, Vercel, PostHog, a provider,
or an AI service.

### Local result — 2026-08-11

- Focused S2.2 enforcement and inventory: `10/10` passed; all 28 API routes
  are classified and all 18 user routes are covered by the shared membership
  primitive, directly or through the tennis server-write delegate.
- Auth/invite: `17/17`; financial safety: `91/91`; domain safety: `14/14`;
  tennis write: `33/33`; tennis 40:40: `6/6`; analysis quality: `54/54`.
- CSP security: `21/21`; CSP rollout readiness: `7/7`; S2.1 foundation:
  `12/12`; Advisor baseline: `10/10`; agent write boundaries: `12/12`;
  rate limiting: `12/12`.
- FP-001 quarantine: `5/5`; place-bet quarantine: `7/7`; provider safety:
  `104/104`; Decision OIDC: the approved case plus 22 negative cases passed.
- Tennis core: `92/92`; access: `54/54`; authority: `10/10`; UI: `13/13`;
  analytics: `7/7`; corrective PR-H: 6 checks passed.
- Broadcast Noir shell, Home, Scanner, Tracker, Stats, and rollout suites passed.
- TypeScript, production build, and diff whitespace checks passed. Lint passed
  with four pre-existing unused-parameter warnings in provider adapters.
- The hermetic build used synthetic environment values and a network-deny guard;
  it made no live external call.
- Local Chromium is absent. Browser acceptance is recorded as the permitted
  local blocker; no browser was installed and the remaining checks continued.
- The offline AI-baseline diagnostic reproduced `604 passed, 1 failed` across
  38 fixtures with zero live Anthropic, Supabase, or Telegram sends. Its only
  failure is the pre-existing hardcoded runtime pin
  `83e92616e2a485b351c41317e4034394bf0eee0b`; that stale pin is intentionally
  unchanged.

## Rollback

Revert the S2.2 application change and deployment as one unit. Do not partially
restore the old two-call invite flow, add a permissive bypass, drop S2.1 objects,
change membership rows, alter Auth sessions, or change user data. A production
rollback reopens Web/server access for any valid session, so it requires a fresh
authorization-risk decision. Prefer a narrow forward fix when possible.

## Explicit exclusions

No SQL, migration, RLS, grant, RPC definition, lockfile, Auth, secret, external
configuration, live data, GitHub, Vercel, Supabase, PostHog, or production change
belongs to S2.2.
