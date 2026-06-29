# Sprint 5.1 — Scout Web Search Hardening

**Date:** 2026-06-29  
**Status:** CPO review pending  
**PR:** `hotfix: harden Scout web search and provider errors`  
**Scope:** `app/api/scout/route.ts` only — no schema changes, no new routes, no product scope expansion

---

## Goal

Make Market Scout reliable, honest, and production-safe. The primary risk is not quota abuse — it is returning raw 500s or silently degrading quality without telling users. Scout must be honest when live/web-search context is unavailable.

---

## What is NOT in scope

- New Scout features
- Changes to Scout product flow
- DB schema changes
- Redis / Upstash / heavy shared infra
- Risk Manager
- Real-time odds feed

---

## 1. Anthropic Error Taxonomy

**Problem:** All Anthropic errors currently fall into a single `catch (err)` block that returns the raw error message in a 500.

**Solution:** Classify errors from the Anthropic SDK before returning to the client. The SDK exposes typed error classes.

| Error class | Cause | Client response |
|-------------|-------|----------------|
| `Anthropic.RateLimitError` | Anthropic quota hit (429) | 429 + "AI provider rate limit reached. Please try again in a few minutes." |
| `Anthropic.APIStatusError` (status 529) | Anthropic overloaded | 503 + "AI provider is temporarily overloaded. Please try again shortly." |
| `Anthropic.APIConnectionTimeoutError` | Request timed out | 504 + "Scout timed out. Please try again." |
| `Anthropic.APIConnectionError` | Network failure | 503 + "Unable to reach AI provider. Please check your connection." |
| `Anthropic.APIError` (other 4xx/5xx) | Other provider error | 502 + "AI provider returned an error. Please try again." |
| Fallthrough | Unknown | 500 + "Internal error" (no raw message) |

No raw provider error messages are ever forwarded to the client.

---

## 2. Web Search Fallback

**Problem:** If web search is enabled but fails (Anthropic quota, tool error, timeout), the entire Scout run fails.

**Flow:**

```
web_search_enabled = true
        │
        ▼
  Anthropic call (with web_search tool)
        │
   ┌────┴────┐
 success   failure
   │           │
   ▼           ▼
persist     retry once WITHOUT web_search tool
web_search_used=true     │
                    ┌────┴────┐
                  success   failure
                    │           │
                    ▼           ▼
             persist         return safe error
             web_search_used=false   (scout_failed)
             include limitation disclaimer
             track scout_web_search_fallback
```

**Key rules:**
- Fallback succeeds → Scout run succeeds. `web_search_used = false`. Limitation disclaimer appended to response.
- Fallback fails too → Safe error returned. `scout_failed` tracked.
- `web_search_used` in DB always reflects what actually happened, not what was attempted.
- The system prompt already handles the `webSearchEnabled = false` data limitation disclaimer — fallback reuses this path.

---

## 3. Timeout / Abort Signal

**Problem:** Web search calls can take 30–60s. No abort signal is set, so a stalled call holds the Vercel function slot indefinitely.

**Solution:** Wrap the Anthropic call in an `AbortController` with a configurable timeout.

- **Web search enabled:** 45s timeout (longer to allow search + reasoning)
- **Web search disabled:** 25s timeout (pure reasoning, no fetch)
- On timeout: attempt fallback if web search was involved; return 504 if not
- The `AbortController` signal is passed via `anthropic.messages.create({ signal })`

Timeout values are constants at the top of the file, not magic numbers inline.

---

## 4. Rate Limit Hardening

**Problem:** In-memory store resets on cold start; multiple Vercel instances each maintain separate counters, allowing users to exceed quota.

**Constraint:** No Redis / Upstash unless already configured. No heavy infra.

**Solution for Sprint 5.1:**
- Keep the existing in-memory limiter (it still works correctly within a single instance)
- Add a `scout_rate_limited` PostHog event so rate-limit hits are visible in analytics
- Add a `Retry-After` header (already present) and a clear client error message (already present)
- Document the known limitation: multi-instance bypass is a known gap, deferred to a future sprint when a shared store (Supabase-backed rate limit table) is evaluated

No Supabase rate-limit table in this sprint — the marginal complexity is not justified given Fluid Compute's instance reuse behaviour on Vercel.

---

## 5. Type Safety

**Problem:** `createParams: any` is used to conditionally add the `web_search` tool to the Anthropic call.

**Solution:** Use a typed union instead of `any`. The Anthropic SDK exposes `MessageCreateParamsNonStreaming`. The tools array can be typed as `Anthropic.Tool[]` and conditionally spread.

```ts
const tools: Anthropic.Messages.Tool[] = webSearchEnabled
  ? [{ type: 'web_search_20250305', name: 'web_search' } as Anthropic.Messages.Tool]
  : []

const message = await anthropic.messages.create({
  model,
  max_tokens: 2000,
  system: systemPrompt,
  messages: [{ role: 'user', content: userMessage }],
  ...(tools.length > 0 && { tools }),
  signal: controller.signal,
})
```

If the SDK does not yet type `web_search_20250305` as a valid tool type, a narrowly scoped `as` cast on that one line is acceptable — not a whole-object `any`.

---

## Analytics Events

| Event | When |
|-------|------|
| `scout_started` | Already exists — no change |
| `scout_completed` | Already exists — add `fallback_used: boolean` property |
| `scout_failed` | Already exists — add `error_type` values: `anthropic_rate_limit`, `anthropic_overload`, `anthropic_timeout`, `anthropic_network`, `anthropic_error`, `ai_parse`, `ai_schema`, `persist` |
| `scout_web_search_fallback` | **New** — fired when web search fails but fallback succeeds |
| `scout_rate_limited` | **New** — fired when in-memory rate limit is hit |

---

## Acceptance Criteria

- [ ] Web search failure does not kill Scout if fallback can run
- [ ] User sees honest limitation message when fallback / no-web-search mode is used
- [ ] Provider quota / overload / timeout errors do not produce raw 500s
- [ ] All five analytics events fire correctly with correct properties
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] No product scope expansion
- [ ] No Risk Manager, no odds feed

---

## Files Changed

| File | Change |
|------|--------|
| `app/api/scout/route.ts` | All changes contained here |

No other files need to change.
