# CSP Phase B Compatibility Inventory — Slice S2B

Date: 2026-08-08
Baseline: `main@e76901d913034f8bfeb2370e2ce318c41b30f13e`
Status: readiness inventory only — **Phase B is not approved**

## Purpose and limits

This is a repository-only inventory of the compatibility work that must be
understood before any future CSP Phase B proposal. It does not change runtime
code, CSP headers, middleware, Supabase settings, Vercel settings, PostHog
settings, or production.

The active policy remains `Content-Security-Policy-Report-Only` and keeps
`'unsafe-inline'`. This slice does not add CSP enforcement, a nonce,
`'strict-dynamic'`, or a wildcard source.

## Middleware and Supabase response topology

`middleware.ts` has a request-bound authentication path with the following
observed sites:

| Concern | Count | Evidence |
| --- | ---: | --- |
| `NextResponse.next({ request })` | 2 | initial response and replacement after cookie writes |
| Redirect response factory | 1 | one helper creates every redirect response |
| Logical redirect outcomes | 4 | `/login`, `/dashboard`, `/access-denied`, `/service-unavailable` |
| Request-cookie write | 1 | `request.cookies.set(...)` in Supabase `setAll` |
| Response-cookie write | 1 | `supabaseResponse.cookies.set(...)` in Supabase `setAll` |
| Redirect-cookie copy | 1 | the helper copies refreshed Supabase cookies to every redirect |
| `supabase.auth.getUser()` | 1 | auth decision before redirects |

Any future nonce design must preserve the request/response relation through
both `NextResponse.next(...)` sites and all four logical redirect outcomes. It
must not lose the explicit refreshed-cookie copy or introduce a different
header policy for a redirect response.

## App Router rendering inventory

There are 20 `page.tsx` or `layout.tsx` entrypoints after S2.2 adds the two
non-protected fail-closed destination pages.

- 12 directly import `@/lib/supabase/server`:
  `analytics`, `bankroll`, `bets/[id]`, `bets`, `coach`, `dashboard`, both
  decision pages, the `(app)` layout, `scout`, `settings`, and
  `tennis-calculator`.
- `/ai` and `/bets/new` do not directly import the server helper, but inherit
  a request-bound dependency through the `(app)` layout.
- `/`, `/login`, `/auth/set-password`, `/access-denied`, and
  `/service-unavailable` are current static candidates. This is source-level
  evidence only; a future implementation must revalidate the actual
  build/rendering result.

The direct helper calls use `next/headers` cookies. A Phase B design must treat
the authenticated application shell as dynamic unless a new, tested rendering
strategy establishes otherwise.

## Inline execution and style inventory

The source inventory contains five JSX inline-style sites:

| File | Count | Current use |
| --- | ---: | --- |
| `app/(app)/ai/page.tsx` | 2 | score and confidence widths |
| `app/(app)/decisions/[id]/page.tsx` | 2 | visual decision state and confidence width |
| `components/ui/MobileNav.tsx` | 1 | safe-area padding |

No `dangerouslySetInnerHTML`, `next/script`, or `<Script>` use was found in
`app/` or `components/` TSX sources. Removing `'unsafe-inline'` would still be
incompatible with the five JSX style sites until an explicitly reviewed style
strategy is selected.

## Phase B readiness conditions

Before a future implementation proposal can be approved, it must at minimum:

1. demonstrate compatible nonce propagation for normal, cookie-refresh, and
   redirect middleware responses;
2. prove the App Router dynamic/static behavior for every affected route;
3. resolve the five inline-style sites without silently weakening the policy;
4. collect and classify CSP reports from natural production traffic; and
5. retain a narrow source list: no wildcard, no `strict-dynamic`, and no
   enforcement in a readiness-only change.

S2B closes the repository documentation and regression-proof gap only. It
does not implement any of those conditions.
