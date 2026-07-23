# CSP Report-Only Observation Receipt — Decision #065

Date: 2026-07-23
Environment: Vercel Preview
Decision: #065
PR: #202
Observed commit: `de67618abac485a2c568aa4c5a3c2073771ac888`
Deployment: `dpl_Brx94WGSi1HvfoJjDZpsnJVwR2PX` (`READY`)

## Scope

This receipt classifies the authenticated Preview observations for
`/dashboard`, `/ai`, and `/bets/new`. It records evidence only. It does not
authorize CSP enforcement, production deployment, a production smoke,
Supabase/DB writes, provider/AI calls, or any telemetry configuration change.

The authenticated pass used one Founder-entered password login in a visible
browser. Credentials, cookies, tokens, request headers, request bodies, and
credential-field values were not read, extracted, retained, or logged.

## Observed result

All three authenticated routes returned HTTP 200 and rendered successfully.
Each route had one `main`, zero overlay residue, zero horizontal overflow, zero
duplicate IDs, zero unlabeled controls, and zero page errors.

The guarded network observation recorded:

- one password login and zero refreshes;
- zero product DB/RPC attempts or deliveries;
- zero provider/AI attempts or deliveries;
- 29 blocked telemetry attempts and zero telemetry deliveries;
- zero external WebSocket attempts or connections;
- four blocked non-auth mutations and zero deliveries.

Read-only classification without a second login identified all four mutations
as automatic `POST /api/csp-report` requests. Two Report-Only events were
attributable to the Vercel Preview Toolbar and two to additional PostHog
scripts. They were not product DB/RPC, provider, AI, settlement, grading, or
financial writes.

The ten console errors observed on each route were attributable to the
intentionally blocked telemetry/CSP request set. No page exception was
recorded, and the inspected Vercel runtime logs contained no application
runtime error for this observation.

## Hardening disposition

The hermetic Web acceptance harness now:

- fails closed on every application `console.error`;
- reruns axe, duplicate-ID, document-overflow, and authenticated
  shell-scroll-container overflow checks after interactive states;
- directly proves bracketed IPv6 loopback (`[::1]`) normalization before
  applying its network allowlist.

The local harness retains fail-closed assertions requiring zero external
requests, zero unexpected external WebSockets, and zero stubbed Supabase
writes. GitHub CI and Vercel Preview must validate the new harness on the exact
published head before PR #202 can leave Draft.

## Decision boundary

This evidence does not justify CSP enforcement. Decision #054 Phase B,
nonce/hash work, and `strict-dynamic` remain NOT APPROVED. Decision #065 and PR
#202 remain ACTIVE / Draft / HOLD until the new exact head passes review and all
remote gates.
