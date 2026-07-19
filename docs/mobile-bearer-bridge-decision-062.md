# Decision #062 — Mobile Phase 1A Bearer Bridge

Status: IMPLEMENTED IN DRAFT REVIEW; no production runtime or smoke authorized by this implementation.

## Purpose

Allow the native Founder client to authenticate the two existing core Next routes with its verified Supabase access token while preserving the existing browser cookie flow:

- `POST /api/ai/scanner`
- `POST /api/bets/tracked`

This phase changes server authentication and scanner timeout handling only. It does not wire the mobile UI to either route, publish an EAS Update, call Anthropic, or perform a financial write.

## Authentication contract

`authenticateRequest(req)` is the single request-scoped adapter.

- If `Authorization` is absent, the existing cookie client and `auth.getUser()` flow are used.
- If `Authorization` is present, the request is token-only. A malformed scheme, empty token, invalid token, or failed validation returns `401`; cookie fallback is forbidden.
- A Bearer client uses only the public Supabase URL and anon/publishable credential, forwards the same token, and disables persistence, refresh, and redirect-session detection.
- Identity comes only from `auth.getUser(token)`. Unverified JWT payload claims are never accepted as identity.
- The configured service-role credential and a JWT-shaped token declaring `role=service_role` are rejected before Supabase client creation or network validation.
- The authenticated user-scoped client is passed to `create_tracked_bet`; the financial RPC still runs as the verified user. The service role remains limited to the existing durable rate limiter.

## Scanner timeout contract

Every Anthropic request receives `AbortSignal.timeout`. The default is 60 seconds and can be tuned with a positive `SCANNER_UPSTREAM_TIMEOUT_MS` value.

An upstream timeout returns the sanitized response `504 Scanner timed out — please try again`. It is handled before parse-retry decisions, so an ambiguous timeout never triggers an automatic second provider request. The existing successful-response normalization fallback remains unchanged.

## Validation and boundaries

- Financial safety: 72/72, including cookie coexistence, valid/invalid Bearer, verified identity, service credential pre-network rejection, native rate-limit identity, and scanner timeout/no-retry behavior.
- Existing strict Zod, rate-limit, idempotency, RPC, and sanitized-error contracts are unchanged.
- Migrations, schemas, RLS policies, RPC definitions, provider prompts, and `apps/mobile/**` are unchanged.
- Production, Supabase, Anthropic/provider, Vercel runtime calls and writes: 0.
- Native UI wiring, real-device network smoke, production deployment, and EAS Update remain separate reviewed steps.
