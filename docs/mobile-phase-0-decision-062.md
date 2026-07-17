# Decision #062 — Mobile Phase 0

Status: IMPLEMENTATION IN REVIEW

Date: 2026-07-17

Approval: Founder (`APPROVE #062 MOBILE PHASE 0`)

## Outcome

Create the first safe Founder iPhone/Android product slice without widening any financial or provider boundary. The mobile app authenticates directly with Supabase using a public key and reads only the signed-in user's bankroll currency, bets, and ordered bet legs under existing RLS.

## Approved Phase 0 surface

1. Password sign-in only; no invite, magic-link, registration, or account deletion flow.
2. Encrypted persisted session through chunked Expo SecureStore storage. The chunking avoids relying on one oversized Keychain value; alternating slots make replacement fail closed.
3. Session restoration at cold start, automatic refresh only while the app is active, expired-session handling through Supabase auth state, and local logout.
4. Protected Expo Router groups: signed-out users see sign-in; signed-in users see `/bets` and `/bets/<id>`.
5. Explicit read DTOs; no wildcard selection. `bet_legs.leg_index` is included and client-sorted as a second fail-safe. Nullable/empty selection maps to `null`; unknown statuses render as Unknown rather than a settlement outcome.
6. Currency-aware stake/payout/P&L and loading, empty, offline, generic error, and not-found states.
7. Deep-link scheme `xaddd://bets/<id>`.

## Security and write boundary

- Expo-visible configuration is limited to `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (legacy public anon variable accepted for compatibility). These values are public by design; authorization remains in RLS.
- `service_role`, secret keys, operator tokens, and provider credentials are prohibited.
- Mobile source contains no `.insert()`, `.update()`, `.upsert()`, `.delete()`, `.rpc()`, tracked-bet API, scanner API, settlement, or deposit call.
- Direct reads include a user-id predicate and remain owner-scoped by production RLS. No migration, grant, policy, function, or server route changes are part of #062 Phase 0.
- Analytics, PostHog, Sentry, camera/gallery, and screenshots are not added.

## Validation

- TypeScript: application and test configs pass.
- Unit/boundary suite: 10/10 — large encrypted-session storage round-trip/replacement/removal; leg ordering; nullable selection; number/status/currency mapping; sanitized auth/read errors; foreground refresh policy; static prohibition of writes/RPC/API/privileged secrets; explicit ordered read contract.
- Expo lint: clean.
- `expo config --type public`: SDK 57, EAS project, owner, identifiers, update URL, and SecureStore plugin resolve.
- Android production JS export: succeeds using synthetic public environment values; no Supabase/provider runtime call is made.

## Build boundary and next gate

The already installed Android development build proves EAS/Metro connectivity but predates `expo-secure-store`. A replacement Android development build requires a separate explicit build approval after review. iOS remains blocked until Apple Developer membership is Active, device registration succeeds, and a separate iOS build is approved.

No EAS Update is published by this implementation. Real-device auth/readback acceptance is a post-build step and must use the Founder's existing account; it creates no data.

## Non-use

Production calls/writes during implementation: 0. Supabase runtime calls: 0. Provider calls: 0. EAS builds/updates: 0. Scanner/create/settlement/deposit: 0. Migrations/RPC/policies: 0. Decision #056 runtime remains NOT APPROVED / NOT RUN; results and automated settlement remain HOLD; FP-001 remains ACTIVE; external beta remains PAUSED.
