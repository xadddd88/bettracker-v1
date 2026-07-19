# Decision #062 — mobile Coupon Scanner wiring

## Scope

This stage connects the prepared mobile Coupon image to the authenticated BetTracker scanner route while preserving the existing founder safety boundary.

- The mobile client sends only the prepared JPEG Base64 and `media_type: image/jpeg` to `POST /api/ai/scanner`.
- The request uses the current Supabase access token as a Bearer credential. The server-side Phase 1A bridge validates that token; no identity is accepted from the request body.
- A `401` may refresh the Supabase session once and replay the identical scanner body. This is safe because authentication happens before rate limiting and before a provider call.
- Network failures, timeouts, `429`, and server failures are not retried automatically. A scanner attempt may have reached the upstream provider, so ambiguous retries require an explicit Founder action.
- Server and provider error bodies are never rendered. Mobile messages are fixed and sanitized.
- The response parser accepts only the normalized public scanner contract, bounds text, limits Express legs to 20, and ignores OCR/provider diagnostics such as `rawText`.

## Payload and configuration

The exact mobile request body is:

```json
{
  "image": "<prepared JPEG Base64>",
  "media_type": "image/jpeg"
}
```

The complete serialized body is measured again immediately before the request and must remain strictly below 4,400,000 UTF-8 bytes. A body of exactly 4,400,000 bytes is rejected locally.

The API origin defaults to `https://btdk.app`. Development may override it with `EXPO_PUBLIC_API_BASE_URL`; HTTPS is mandatory except for loopback. Credentials, query parameters, and fragments are rejected in the configured base URL.

## User flow

1. Founder chooses Coupon, captures or selects an image, and reviews the locally prepared JPEG.
2. Analyze is disabled while offline and while another capture/analyze operation owns the synchronous lock.
3. Analyze sends one authenticated request and presents ordered extracted legs, odds, total odds, stake, and bookmaker when available.
4. The result remains review-only. It does not invoke `create_tracked_bet`, save a bet, settle a bet, or perform any financial write.
5. Event mode remains explicit and local-only; it does not send a coupon-shaped request.

Generated JPEG files are limited to Expo's cache directory. Rejected compression-profile outputs are deleted immediately. The retained preview is deleted after successful replacement, Remove, successful Coupon analysis, or screen unmount; a cancelled or failed replacement keeps the current preview.

## Dependencies and deferred work

- Depends on Decision #062 Phase 1A Bearer support for `/api/ai/scanner`.
- Declares the SDK-compatible `expo-file-system` module already present transitively in the Expo dependency graph, using its current `File`/`Paths` API for cache-only deletion. No permission change is introduced.
- Editable correction, conversion into the Tracker draft, idempotent secure saving, Event analysis, and provider-quality evaluation remain separate approved stages.

Validation for this change uses injected fetch responses only. No production, Supabase, Vercel, AI, or provider call is part of the test run.
