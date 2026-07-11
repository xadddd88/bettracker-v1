# CSP Report Hardening & Security Headers — Decision #054 Phase A

## Status

PHASE A IMPLEMENTED / AWAITING CPO REVIEW.

Implementation PR: #141.

CSP remains **Report-Only**. This decision does not enable enforcement, remove `unsafe-inline`, or introduce a nonce/hash strategy.

Last updated: 2026-07-11

## Scope Guard

- no migration
- no Supabase write
- no provider call
- no production environment change
- no enrichment or odds work
- no Scout/Analyst/UI pricing change
- no betting-signal change
- FP-001 unchanged

## Current CSP Inventory

Production currently sends `Content-Security-Policy-Report-Only` with:

```txt
default-src 'self'
script-src 'self' 'unsafe-inline'
style-src 'self' 'unsafe-inline'
font-src 'self'
img-src 'self' data: blob:
connect-src 'self' <Supabase https> <Supabase wss> <PostHog origin>
frame-ancestors 'none'
base-uri 'self'
form-action 'self'
object-src 'none'
report-uri /api/csp-report
```

Source audit findings:

- Next.js App Router uses inline hydration/streaming scripts; removing `unsafe-inline` without a reviewed nonce/hash design can render HTML but break hydration.
- Tailwind/Next.js may emit inline critical styles.
- Supabase requires its configured HTTPS origin and matching WSS origin.
- PostHog uses the configured public host; secondary asset/replay hosts must be learned from real reports before enforcement.
- Sentry is tunnelled through same-origin `/monitoring`.
- `next/font` fonts are self-hosted.
- Browser-extension reports are expected noise and must be classified before Phase B.

## Phase A Changes

### CSP report endpoint

`POST /api/csp-report` now:

- accepts `application/csp-report`, `application/reports+json`, and structurally valid `application/json`;
- enforces a 32 KB cap using both `Content-Length` and bounded stream reading;
- supports legacy `report-uri` and Reporting API payloads;
- accepts at most 20 Reporting API CSP entries per request;
- logs only a bounded allowlist of sanitized fields;
- strips URL query strings and fragments;
- maps inline/eval/data/blob and malformed URLs to safe sentinels;
- discards `script-sample` completely;
- never logs the raw payload, cookies, headers, credentials, or tokens;
- returns the reviewed `204 / 400 / 413 / 415 / 429 / 503` contract.

### Durable rate limit

The endpoint uses Decision #052 infrastructure:

```txt
60 reports / minute / canonical client IP
500 reports / hour / canonical client IP
```

The shared helper hashes the key before storage. Limiter failure is fail-closed: the route returns `503` and performs no parsing/logging.

### Baseline response headers

Phase A adds:

```txt
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

Existing HSTS remains platform-managed. CSP already contains `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, and `form-action 'self'`.

COOP, COEP, and CORP are intentionally not added without a compatibility audit.

## Tests

`npm run test:csp-security` covers:

- both report formats;
- script-sample removal;
- URL redaction and malformed URL handling;
- field truncation;
- bounded body reading;
- media type and status contracts;
- durable fail-closed rate limiting;
- absence of raw-body logging/in-memory counters;
- baseline headers;
- CSP remains Report-Only and keeps `unsafe-inline` in Phase A.

A dedicated CSP Security GitHub Actions workflow runs this suite on the PR; all existing Preview Tests trust, safety, typecheck/lint, and smoke jobs continue unchanged.

## Phase B — Not Implemented

Enforced CSP requires a separate CPO approval after:

1. collecting real Report-Only violations in production;
2. classifying required application sources versus extensions/noise;
3. confirming PostHog, Supabase, Sentry, images, fonts, and auth flows;
4. designing and testing a Next.js-compatible nonce/hash strategy;
5. proving hydration and authenticated flows on preview;
6. confirming that no required source needs an unjustified wildcard.

Only then may a later PR consider `Content-Security-Policy`, removal of `unsafe-inline`, or `strict-dynamic`.
