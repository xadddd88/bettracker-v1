# CSP PostHog Capability Reduction — Slice S2A

Date: 2026-08-07
Baseline: `0237be2b1328f3055ce22a845131f38867bce04b`
Status: LOCAL IMPLEMENTATION / BROWSER VERIFICATION PENDING

## Scope

This repository-only slice reduces the browser PostHog SDK to the analytics
capabilities BetTracker currently uses. It does not enable CSP enforcement,
remove `unsafe-inline`, add a wildcard source, introduce a nonce or
`strict-dynamic`, change PostHog project settings, or modify Vercel, Supabase,
or production.

## Production evidence

A read-only review of the available Vercel production runtime logs found at
least 21 sanitized `script-src-elem` Report-Only events on `/login`:

- 19 events on 2026-08-02;
- 2 events on 2026-08-05;
- every retrieved event was attributable to one of two PostHog EU asset
  classes: token-specific remote configuration or `surveys.js`.

The retrieved count is a lower bound because some older runtime-log windows
were outside platform retention or timed out. No raw CSP body, credential,
cookie, request header, user identifier, or PostHog project-token value is
recorded in this note.

This evidence proves that enforcing the current policy would block PostHog
runtime assets. It does not prove that PostHog is the only source that must be
classified before Decision #054 Phase B.

## Security boundary

Before S2A, mounting the root `PostHogProvider` initialized the standard
browser SDK with remote flags and external dependency loading left enabled.
The SDK could therefore insert executable remote configuration and optional
product scripts into the BetTracker application origin.

S2A sets the following browser SDK controls to `true`:

- `advanced_disable_flags`;
- `disable_external_dependency_loading`;
- `disable_surveys`;
- `disable_product_tours`;
- `disable_conversations`.

The security invariant is that browser PostHog remains an explicit analytics
sender and cannot load unused remote JavaScript capabilities at runtime.

## Preserved behavior and trade-off

The existing manual `$pageview`, custom `capture`, `identify`, and pageleave
paths remain in place. Server-side `posthog-node` analytics are outside this
slice and unchanged.

The intentional trade-off is that browser feature flags, remote
configuration, surveys, product tours, and conversations are unavailable.
Disabling the flags endpoint also removes the remote capability and
compression negotiation supplied by that endpoint. This is acceptable for
the current application because repository search found no browser caller for
feature flags, surveys, product tours, or conversations; autocapture and
session recording were already disabled.

## Verification contract

The existing `test:csp-security` gate must prove all five controls are enabled,
manual analytics calls remain present, and the policy remains Report-Only with
no `*.posthog.com`, enforced CSP, nonce, or `strict-dynamic` expansion. The
normal TypeScript, lint, build, and hermetic Web gates must remain green.

## Local verification result

- the pre-fix focused regression produced the expected `19 passed / 1 failed`;
  the only failure was that `advanced_disable_flags` was not `true`;
- after S2A, the focused CSP/PostHog suite passes `21/21`;
- a behavioral probe against the lockfile-installed `posthog-js@1.396.3`
  observes zero external scripts and zero remote-config requests or
  applications while preserving the SDK's `capture` and `identify` methods;
- TypeScript (`npx tsc --noEmit`) passes;
- lint passes with four existing unused-variable warnings in provider
  adapters;
- the hermetic production build passes with the repository font mocks and
  outbound-network guard; it retains the existing Supabase Edge Runtime and
  provider-adapter warnings;
- Auth invite tests pass `16/16` and rate-limit tests pass `12/12`;
- `git diff --check` passes.

The security-specific failure no longer reproduces in the locked SDK probe,
and the manual analytics source paths remain covered. Full Web acceptance is
not a PASS in this environment: the repository's expected Playwright browser
is unavailable, and an exact-version temporary Chromium process closed during
navigation after `/login`, `/dashboard`, and `/ai` each returned HTTP 200.
Because no browser assertion result was produced, the strict verification
outcome remains **BLOCKED** until this exact tree passes the hermetic Web
acceptance job in a compatible browser runner.

## Manual rollback

Rollback is a future reviewed code change, never an automatic runtime action:

1. identify the specific PostHog product capability that is newly required;
2. remove only the corresponding disable control, plus
   `advanced_disable_flags` or `disable_external_dependency_loading` only when
   that capability actually depends on it;
3. keep CSP Report-Only and collect a new sanitized Preview observation;
4. classify every new source before considering any CSP allowlist change;
5. do not add `*.posthog.com`, enable CSP enforcement, or enable nonce /
   `strict-dynamic` as part of the rollback.

Decision #054 Phase B remains NOT APPROVED.
