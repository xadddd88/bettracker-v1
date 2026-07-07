# Scout Web Search Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden `POST /api/scout` with Anthropic error taxonomy, web-search fallback, AbortController timeout, rate-limit analytics, and type-safety — one PR, no DB changes.

**Architecture:** All changes in two files: `lib/analytics/events.ts` (two new event constants) and `app/api/scout/route.ts` (error classifier, timeout helper, fallback logic, rate-limit analytics, typed params). No new routes, no schema changes, no new dependencies.

**Tech Stack:** Anthropic SDK error classes (`RateLimitError`, `APIStatusError`, `APIConnectionTimeoutError`, `APIConnectionError`, `APIError`), `AbortController` (Node.js built-in), PostHog via existing `trackServerEvent`.

## Global Constraints

- PR name: `hotfix: harden Scout web search and provider errors`
- Branch: `hotfix/scout-web-search-hardening`
- No DB/schema changes
- No new npm dependencies
- No raw provider error messages forwarded to the client
- Do NOT merge before CPO review
- Validation: `npm run lint` then `npm run build` must both pass before pushing

---

### Task 1: Branch + add new analytics events

**Files:**
- Modify: `lib/analytics/events.ts:36-42` (Scout section)

**Interfaces:**
- Produces: `EVENTS.SCOUT_WEB_SEARCH_FALLBACK` and `EVENTS.SCOUT_RATE_LIMITED` — both consumed by Task 2

- [ ] **Step 1: Create the feature branch**

```bash
git checkout main
git pull origin main
git checkout -b hotfix/scout-web-search-hardening
```

Expected: `Switched to a new branch 'hotfix/scout-web-search-hardening'`

- [ ] **Step 2: Add the two new event constants**

Open `lib/analytics/events.ts`. The Scout section currently ends at line 42. Add the two new events immediately after `OPPORTUNITY_DISMISSED`:

```typescript
  // Scout
  SCOUT_STARTED:              'scout_started',
  SCOUT_COMPLETED:            'scout_completed',
  SCOUT_FAILED:               'scout_failed',
  SCOUT_PAGE_VIEWED:          'scout_page_viewed',
  SCOUT_WEB_SEARCH_FALLBACK:  'scout_web_search_fallback',
  SCOUT_RATE_LIMITED:         'scout_rate_limited',
  OPPORTUNITY_ANALYSED:       'opportunity_analysed',
  OPPORTUNITY_WATCHLISTED:    'opportunity_watchlisted',
  OPPORTUNITY_DISMISSED:      'opportunity_dismissed',
```

- [ ] **Step 3: Verify TypeScript picks up the new constants**

```bash
npx tsc --noEmit --strict 2>&1 | head -20
```

Expected: zero errors (or only pre-existing errors unrelated to events.ts).

- [ ] **Step 4: Commit**

```bash
git add lib/analytics/events.ts
git commit -m "feat: add scout_web_search_fallback and scout_rate_limited events"
```

---

### Task 2: Harden app/api/scout/route.ts

**Files:**
- Modify: `app/api/scout/route.ts` — all five hardening changes in one file

**Interfaces:**
- Consumes: `EVENTS.SCOUT_WEB_SEARCH_FALLBACK`, `EVENTS.SCOUT_RATE_LIMITED` from Task 1
- Produces: hardened POST /api/scout with taxonomy, timeout, fallback, analytics, typed params

#### 2a — Add timeout constants and error taxonomy

- [ ] **Step 1: Add timeout constants after the existing rate-limit constants (after line 13)**

Insert immediately after the `const RATE_LIMIT_PER_DAY = 15` line:

```typescript
const TIMEOUT_WITH_WEB_SEARCH_MS    = 45_000
const TIMEOUT_WITHOUT_WEB_SEARCH_MS = 25_000
```

- [ ] **Step 2: Add the error taxonomy types and classifier function**

Insert the following block immediately before the `// ─── Zod schemas` comment (currently around line 41):

```typescript
// ─── Error taxonomy ───────────────────────────────────────────
type ScoutErrorType =
  | 'anthropic_rate_limited'
  | 'anthropic_overloaded'
  | 'anthropic_timeout'
  | 'anthropic_network'
  | 'anthropic_invalid_json'
  | 'anthropic_schema_mismatch'
  | 'anthropic_provider_error'
  | 'persist'
  | 'unknown'

type ClassifiedError = { type: ScoutErrorType; status: number; message: string }

function classifyAnthropicError(err: unknown): ClassifiedError {
  if (err instanceof Anthropic.RateLimitError) {
    return {
      type: 'anthropic_rate_limited',
      status: 429,
      message: 'Scout is temporarily unavailable due to high demand. Please try again in a few minutes.',
    }
  }
  if (err instanceof Anthropic.APIStatusError && err.status === 529) {
    return {
      type: 'anthropic_overloaded',
      status: 503,
      message: 'Scout is temporarily unavailable. Please try again shortly.',
    }
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError || (err instanceof Error && err.name === 'AbortError')) {
    return {
      type: 'anthropic_timeout',
      status: 504,
      message: 'Scout took too long to respond. Please try again.',
    }
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return {
      type: 'anthropic_network',
      status: 503,
      message: 'Unable to reach Scout provider. Please try again.',
    }
  }
  if (err instanceof Anthropic.APIError) {
    return {
      type: 'anthropic_provider_error',
      status: 502,
      message: 'Scout is temporarily unavailable. Please try again.',
    }
  }
  return { type: 'unknown', status: 500, message: 'Internal error' }
}
```

- [ ] **Step 3: Add the timeout helper function**

Insert immediately after `classifyAnthropicError`, still before the Zod schemas:

```typescript
// ─── Claude call with AbortController timeout ─────────────────
async function callClaudeWithTimeout(
  fn: (signal: AbortSignal) => Promise<Anthropic.Message>,
  timeoutMs: number,
): Promise<Anthropic.Message> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fn(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}
```

#### 2b — Fix type safety: remove `createParams: any` and `(b as any)` casts

The existing Claude call (lines 215–238) uses two `any` casts. Replace the entire section from `// 5. Claude call` through `const webSearchActuallyUsed = ...` with the following:

- [ ] **Step 4: Replace the Claude call section**

Remove this block (lines 215–238):
```typescript
    // 5. Claude call
    const model = process.env.ANTHROPIC_MODEL_SCOUT ?? process.env.ANTHROPIC_MODEL_ANALYST ?? 'claude-sonnet-4-6'
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams: any = {
      model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    }
    if (webSearchEnabled) {
      createParams.tools = [{ type: 'web_search_20250305', name: 'web_search' }]
    }

    const message = await anthropic.messages.create(createParams)

    // Extract last text block (web search may produce multiple content blocks)
    const rawText = message.content
      .filter(b => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map(b => (b as any).text as string)
      .at(-1) ?? ''
    const webSearchActuallyUsed = webSearchEnabled && message.content.some(b => b.type !== 'text')
```

Replace with:

```typescript
    // 5. Claude call (with timeout + web search fallback)
    const model = process.env.ANTHROPIC_MODEL_SCOUT ?? process.env.ANTHROPIC_MODEL_ANALYST ?? 'claude-sonnet-4-6'
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const buildCallParams = (withWebSearch: boolean) => {
      const tools = withWebSearch
        ? ([{ type: 'web_search_20250305', name: 'web_search' }] as Anthropic.Tool[])
        : []
      return {
        model,
        max_tokens: 2_000,
        system: buildScoutSystemPrompt(input.sport, input.output_language, withWebSearch),
        messages: [{ role: 'user' as const, content: userMessage }],
        ...(tools.length > 0 && { tools }),
      }
    }

    let message: Anthropic.Message
    let webSearchActuallyUsed = false
    let fallbackUsed = false

    try {
      message = await callClaudeWithTimeout(
        (signal) => anthropic.messages.create(buildCallParams(webSearchEnabled), { signal }),
        webSearchEnabled ? TIMEOUT_WITH_WEB_SEARCH_MS : TIMEOUT_WITHOUT_WEB_SEARCH_MS,
      )
      webSearchActuallyUsed = webSearchEnabled && message.content.some(b => b.type !== 'text')
    } catch (err) {
      if (webSearchEnabled) {
        const firstError = classifyAnthropicError(err)
        console.warn('[scout] web-search call failed, attempting fallback without web search:', firstError.type)

        try {
          message = await callClaudeWithTimeout(
            (signal) => anthropic.messages.create(buildCallParams(false), { signal }),
            TIMEOUT_WITHOUT_WEB_SEARCH_MS,
          )
          webSearchActuallyUsed = false
          fallbackUsed = true

          await trackServerEvent(user.id, EVENTS.SCOUT_WEB_SEARCH_FALLBACK, {
            sport:          input.sport,
            original_error: firstError.type,
          })
        } catch (fallbackErr) {
          const fallbackError = classifyAnthropicError(fallbackErr)
          console.error('[scout] fallback also failed:', fallbackError.type)
          await trackServerEvent(user.id, EVENTS.SCOUT_FAILED, {
            sport:      input.sport,
            error_type: fallbackError.type,
          })
          return NextResponse.json(
            { success: false, error: 'Scout is temporarily unavailable. Please try again.' },
            { status: fallbackError.status },
          )
        }
      } else {
        const classified = classifyAnthropicError(err)
        console.error('[scout] call failed:', classified.type, err)
        await trackServerEvent(user.id, EVENTS.SCOUT_FAILED, {
          sport:      input.sport,
          error_type: classified.type,
        })
        return NextResponse.json(
          { success: false, error: classified.message },
          { status: classified.status },
        )
      }
    }

    // Extract last text block (web search may produce multiple content blocks)
    const rawText = message.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .at(-1) ?? ''
```

**Note:** TypeScript may complain that `message` is used before assignment. If so, initialise with `let message!: Anthropic.Message` (definite assignment assertion) — this is safe because every code path either assigns `message` or returns early before reaching the code that uses it.

#### 2c — Rate-limit analytics + input parse reorder

Currently the route parses input AFTER the rate-limit check, so `sport` is not available when the rate-limit fires. We need to move parse before rate-limit to include sport in the analytics event.

- [ ] **Step 5: Reorder parse and rate-limit in the handler**

Current order (lines 162–197):
```
1. Auth
2. Rate limit  (← sport unavailable here)
3. Parse input
```

Replace to:
```
1. Auth
2. Parse input
3. Rate limit  (← sport now available)
```

The new handler opening (replacing lines 159–197) becomes:

```typescript
export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse + validate input (before rate-limit so sport is available for analytics)
    const body = await req.json()
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const input = parsed.data

    // 3. Rate limit
    const rl = checkRateLimit(user.id)
    if (!rl.allowed) {
      await trackServerEvent(user.id, EVENTS.SCOUT_RATE_LIMITED, {
        sport:       input.sport,
        retry_after: rl.retryAfter,
      })
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }
```

The original `// 3. Parse + validate input` block (lines 177–186) can be deleted since it's now done above. The `const input = parsed.data` line is already in the new block above — do not duplicate it.

#### 2d — Fix outer catch to not leak raw errors

The current outer catch at lines 328–332 leaks raw error messages. Fix it:

- [ ] **Step 6: Fix the outer catch**

Replace:
```typescript
  } catch (err: unknown) {
    console.error('[scout]', err)
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
```

With:
```typescript
  } catch (err: unknown) {
    console.error('[scout] unhandled error', err)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
```

#### 2e — Add `fallback_used` to scout_completed and response

- [ ] **Step 7: Update scout_completed event and response payload**

Find the `trackServerEvent(user.id, EVENTS.SCOUT_COMPLETED, {...})` call (currently around line 312). Add `fallback_used`:

```typescript
    await trackServerEvent(user.id, EVENTS.SCOUT_COMPLETED, {
      sport:           input.sport,
      candidate_count: inserted?.length ?? 0,
      web_search_used: webSearchActuallyUsed,
      fallback_used:   fallbackUsed,
      score_buckets:   rows.map(r => bucketScoutScore(r.scout_score ?? 0)),
    })
```

Find the final `NextResponse.json` success response. Add `fallback_used` and a `limitation_disclaimer` when fallback was used:

```typescript
    return NextResponse.json({
      success: true,
      data: {
        opportunities:   inserted ?? [],
        web_search_used: webSearchActuallyUsed,
        fallback_used:   fallbackUsed,
        disclaimer:      validated.data.disclaimer,
        ...(fallbackUsed && {
          limitation_disclaimer:
            'Live web-search context was unavailable, so Scout used limited-data mode. Results are based on general knowledge only.',
        }),
      },
    })
```

- [ ] **Step 8: Commit the route.ts changes**

```bash
git add app/api/scout/route.ts
git commit -m "feat: harden Scout — error taxonomy, timeout, web-search fallback, rate-limit analytics, type safety"
```

---

### Task 3: Lint, build, push, open PR

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: zero errors. If ESLint flags anything in `route.ts`, fix it before proceeding. Common fix: remove any remaining `// eslint-disable-next-line` comments that no longer apply.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: build completes with no TypeScript errors and no Next.js compilation errors. If TypeScript complains that `message` is used before assignment, change `let message: Anthropic.Message` to `let message!: Anthropic.Message`.

If TypeScript complains that `anthropic.messages.create(buildCallParams(...))` has a type mismatch, add a type assertion at the call site:
```typescript
anthropic.messages.create(buildCallParams(webSearchEnabled) as Parameters<typeof anthropic.messages.create>[0], { signal })
```

- [ ] **Step 3: Push branch**

```bash
git push -u origin hotfix/scout-web-search-hardening
```

- [ ] **Step 4: Open PR**

```bash
gh pr create \
  --title "hotfix: harden Scout web search and provider errors" \
  --body "$(cat <<'EOF'
## Summary

- Anthropic error taxonomy: classifies 5 SDK error types into safe user-facing messages (rate limit, overload, timeout, network, provider error)
- Web search fallback: if the web-search Claude call fails, retries once without web search and discloses the limitation to the user
- AbortController timeout: 45 s with web search, 25 s without — clears Vercel function slot on stall
- Rate-limit analytics: fires \`scout_rate_limited\` PostHog event with \`sport\` and \`retry_after\`
- Type safety: removes \`createParams: any\` and \`(b as any).text\` — narrow \`as\` cast only on the web-search tool type that the SDK doesn't yet type
- Outer catch no longer leaks raw provider error messages

## No-scope items

- No DB/schema changes
- No new routes
- No Risk Manager, no odds feed
- No new npm dependencies

## Test plan

- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Manual smoke: POST /api/scout with valid body → 200, `web_search_used` and `fallback_used` in response
- [ ] Rate-limit smoke: call /api/scout 4× rapidly → 4th returns 429 with `Retry-After` header

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. **Do not merge.** Share the URL with the CPO for review.

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Error taxonomy (8 types) — Task 2a
- ✅ Web search fallback with disclosure — Task 2b
- ✅ AbortController 25–30 s timeout — Task 2b (25 s no-WS, 45 s with-WS per spec)
- ✅ `scout_rate_limited` event with `sport` — Task 2c
- ✅ `createParams: any` removed — Task 2b
- ✅ `(b as any)` removed — Task 2b
- ✅ Raw errors not forwarded to client — Task 2d
- ✅ `scout_web_search_fallback` event with `original_error` — Task 2b
- ✅ `fallback_used` in `scout_completed` and response — Task 2e
- ✅ `lint` + `build` gate — Task 3
- ✅ Push + open PR, do not merge — Task 3

**Type consistency:**
- `callClaudeWithTimeout` defined in Task 2a, called in Task 2b ✓
- `classifyAnthropicError` defined in Task 2a, called in Task 2b ✓
- `EVENTS.SCOUT_WEB_SEARCH_FALLBACK` added in Task 1, used in Task 2b ✓
- `EVENTS.SCOUT_RATE_LIMITED` added in Task 1, used in Task 2c ✓
- `fallbackUsed` declared in Task 2b, used in Task 2e ✓
