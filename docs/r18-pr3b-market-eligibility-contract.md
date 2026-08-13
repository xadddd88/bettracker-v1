# R18 PR3B Market Eligibility Contract

Status: REPOSITORY CONTRACT — runtime activation disabled.
Date: 2026-08-13
Product source: [`docs/product.md`](product.md), sections 4, 14, 15, and acceptance criteria 43/46/50/59.

## Scope

PR3B defines the first deterministic, server-owned market policy contract before any persistence or UI work:

- one configured profile, `GB_EW_SC_PROFILE_V1`, for England, Wales, and Scotland;
- exact `storefront_country=GB` mapping, with storefront treated only as evidence;
- minimum age contract `18`;
- all R18 eligibility states, including legal-terms update required;
- fail-closed handling for disabled configuration, missing evidence, unknown profiles, conflicts, travel, and blocked policy;
- a monotonic recheck rule: routine rechecks may preserve or remove access, while a denied → eligible transition requires explicit `server_policy` authority;
- a server-only activation flag whose sole enabling value is the exact string `true`.

The profile status is `configured`, not `enabled`. The policy module has no runtime caller in this slice.

## Invariants

1. `GB_EW_SC` means England, Wales, and Scotland only. Northern Ireland returns `unsupported` when the policy is evaluated.
2. `storefront_country=GB` never establishes residency or eligibility by itself.
3. Locale, timezone, display currency, and odds format are not policy inputs. Extra locale-like fields cannot alter a decision.
4. Only `eligible` grants access. Unknown, malformed, incomplete, or unavailable policy evidence fails closed.
5. The market flag defaults off and accepts only the exact server-side value `MARKET_PROFILE_GB_EW_SC_ENABLED=true`.
6. Client/user assertions cannot promote a stored denial through the routine recheck path.

## Decision precedence

The evaluator applies the narrowest safe outcome in this order:

1. unknown market → `unsupported`;
2. market not enabled or policy block unavailable → `blocked`;
3. Northern Ireland or another unsupported residence → `unsupported`;
4. storefront/evidence conflict → `signal_conflict`;
5. unresolved residence/signals/current location → `verification_required`;
6. current location outside the eligible territories → `travel_limited`;
7. stale legal terms → `legal_terms_update_required`;
8. pending/required verification → the corresponding verification state;
9. only complete, consistent, verified server evidence → `eligible`.

## Explicit exclusions

- no Supabase migration, schema, table, RLS, RPC, backfill, or catalog change;
- no production data write or historical-row rewrite;
- no market enablement, legal approval, storefront publication, or user entitlement;
- no environment change and no Vercel/Supabase configuration mutation;
- no Settings, onboarding, auth, route, middleware, or UI integration;
- no provider, AI, payment, billing, or external service call;
- no consent persistence or legal-document version activation.

Those remain separate PR3 gates. A later migration requires an exact fresh read-only preflight and explicit migration approval; market activation requires its own legal/market readiness decision.

## Verification

`npm run test:market-eligibility-contract` compiles the server contract and proves:

- exact profile/status/territory values and immutable configuration;
- disabled-by-default flag behavior;
- England/Wales/Scotland eligibility and Northern Ireland exclusion;
- storefront-only and malformed inputs cannot grant access;
- locale independence across supported and legacy-like values;
- conflict, travel, legal, verification, blocked, and unknown-market outcomes;
- routine elevation rejection, server-policy elevation, and routine downgrade;
- absence of Supabase dependencies and runtime imports from `app/` or `components/`.
