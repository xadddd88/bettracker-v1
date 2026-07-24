# ADR-011 — Scale Readiness & AI Economics

Status: Proposed — mandatory pre-scale architecture gate;
no runtime implementation approved

Date: 2026-07-24

Evidence base:

- Commit: `4b71c753d14ec41b40929ec6d245130ccdeec77a`
- Tree: `da27615eabc5a1986b08ecbadc97e18f56b191c6`
- Canonical roadmap: [`PRODUCT_VISION_GAP.md`](../../PRODUCT_VISION_GAP.md)

## Context

BetTracker has working web and mobile product surfaces, four user-facing AI flows,
durable per-route rate limiting, server-side persistence boundaries, Sentry
instrumentation, and PostHog product events. Those controls are valuable, but they
do not by themselves prove that the product can serve 1000+ concurrent sessions
or a simultaneous AI burst within a controlled budget.

This ADR records only capabilities evidenced in the commit above. It does not
declare the system scale-ready and does not authorize a provider, API, database,
mobile, production, or dependency change. All load, capacity, pricing, budget, and
retention values not established by code or measured tests remain `TBD`.

## Evidence method and scope

The audit covered tracked application code, migrations, workflows, and runtime
configuration. No production setting, provider account, Vercel plan, Supabase plan,
or external alert configuration was changed or assumed.

The repository contains no tracked `AGENTS.md`. No `use server` directive or
application server action was found; the user-facing AI boundary is implemented
with Next.js Route Handlers called by web/mobile clients.

## Proven current architecture

### AI entry points and execution paths

| Surface | Entry point | Provider/model | Persistence/failure |
| --- | --- | --- | --- |
| Web coupon Scanner | [`app/(app)/ai/page.tsx`](<../../app/(app)/ai/page.tsx>) and [`app/(app)/bets/new/page.tsx`](<../../app/(app)/bets/new/page.tsx>) → [`POST /api/ai/scanner`](../../app/api/ai/scanner/route.ts) | Direct Anthropic Messages REST call; hard-coded `claude-sonnet-4-6`; `max_tokens=1200`; 60-second default upstream timeout | The app does not persist the image or Scanner result. A missing-leg normalization failure can trigger one second OCR call. Other failures return sanitized HTTP errors, although the provider's non-2xx response text is written to the server console. |
| Mobile coupon Scanner | [`scanner-client.ts`](../../apps/mobile/src/ai/scanner-client.ts) and [`ai/index.tsx`](<../../apps/mobile/src/app/(app)/ai/index.tsx>) → the same Scanner route | Same server-side Anthropic call as web. The mobile app keeps a prepared image in a local temporary cache until it is replaced or cleared. | Coupon extraction is review-only and is not automatically saved as a bet. “Event” analysis is explicitly not connected. A stale UI generation is ignored locally, but the already-issued HTTP/provider request is not cancelled. |
| Web Analyst | [`app/(app)/ai/page.tsx`](<../../app/(app)/ai/page.tsx>) → [`POST /api/ai/analyst`](../../app/api/ai/analyst/route.ts) | Anthropic SDK; `ANTHROPIC_MODEL_ANALYST` or `claude-sonnet-4-6`; `max_tokens=5000`; optional Anthropic web-search server tool; 60-second route-level abort | Persists one `decisions` row and one `ai_analysis_runs` row through the service-role-only [`persist_analysis_decision`](../../supabase/migrations/017_prepare_domain_write_boundaries.sql) RPC after schema and quality gates. A paused server-tool turn may make a bounded continuation call. The route does not silently fall back when required current research is unavailable. |
| Web Scout | [`ScoutForm.tsx`](<../../app/(app)/scout/ScoutForm.tsx>) → [`POST /api/scout`](../../app/api/scout/route.ts) | Anthropic SDK; `ANTHROPIC_MODEL_SCOUT`, then Analyst model, then `claude-sonnet-4-6`; `max_tokens=2000`; optional web search; 55-second timeout per attempt | Persists up to five `market_opportunities` through the service-role-only [`persist_market_opportunities`](../../supabase/migrations/019_prepare_agent_write_boundaries.sql) RPC. If the web-search attempt fails, one fallback call without web search is allowed and explicitly labelled as limited-data mode. |
| Web Coach | [`CoachView.tsx`](<../../app/(app)/coach/CoachView.tsx>) → [`POST /api/coach`](../../app/api/coach/route.ts) | Anthropic SDK; `ANTHROPIC_MODEL_COACH`, then Analyst model, then `claude-sonnet-4-6`; `max_tokens=2000` | Reads the user's bets, decisions, and Scout records, then persists a `coaching_sessions` row through the service-role-only [`persist_coaching_session`](../../supabase/migrations/019_prepare_agent_write_boundaries.sql) RPC. There is no explicit Coach abort/timeout around the Anthropic call. |

Only Anthropic is integrated as an AI model provider in the production dependency
and call graph ([`package.json`](../../package.json)). No OpenAI, Gemini, Mistral,
Cohere, Bedrock, or other model integration is present.

All paid AI execution is synchronous inside a user HTTP request. There is no
durable AI job table, queue consumer, worker, priority scheduler, backpressure
controller, or background AI process. The tracked Vercel file only selects the
Next.js framework and does not set function regions, memory, concurrency, or
durations ([`vercel.json`](../../vercel.json)). The AI routes do not declare an
explicit Next.js runtime or `maxDuration`; their effective production boundaries
therefore depend on Vercel project/plan settings that are outside this repository
and are `TBD`.

### Sports-data providers and background work

The repository contains API-Football, API-Tennis, and SportMonks adapters under
[`lib/providers`](../../lib/providers). Shared
[`providerFetch`](../../lib/providers/http.ts) applies an 8-second default timeout,
blocks redirects that could forward credentials, and maps errors through
[`sanitizeProviderError`](../../lib/providers/errors.ts). It does not retry.

Tracked sports-data operations are authenticated admin Route Handlers, including
[`fixture sync`](../../app/api/admin/sports/fixtures/sync/route.ts), odds discovery,
mapping, and enrichment dry runs. No Vercel Cron definition, queue, scheduler, or
other background caller is tracked. The current user-facing Analyst, Scout,
Scanner, and Coach paths do not consume the canonical sports-provider adapter
layer. Consequently:

- a sports-provider outage fails the invoked admin operation with a classified
  response;
- there is no automatic retry or stale-cache fallback for that operation;
- there is no current sports-provider outage path to degrade inside a user AI
  request, because those systems are not yet connected.

This separation is a current-state fact, not a claim of resilience.

### Request limiting, retries, timeout, and cancellation

[`lib/rate-limit.ts`](../../lib/rate-limit.ts) and
[`023_global_rate_limits.sql`](../../supabase/migrations/023_global_rate_limits.sql)
implement an atomic, cross-instance, fixed-window limiter in Postgres. Keys are
SHA-256 hashed before storage and the routes fail closed if the limiter is
unavailable.

Current default per-user request caps are:

| Flow | Default windows |
| --- | --- |
| Scanner | 5/minute and 30/day |
| Analyst | 10/minute and 200/day |
| Scout | 3/minute and 50/day |
| Coach | 20/day |

These are request counters, not token or money budgets. One admitted request can
produce more than one provider call through Scanner's parse fallback, Scout's
web-search fallback, or Analyst server-tool continuation. There is no cross-route
global AI cap, per-plan policy, monthly financial cap, provider-concurrency cap,
or reservation of estimated spend before a call.

Retry behavior is route-specific rather than centrally governed:

- Scanner allows one second call only for a missing-leg normalization failure.
- Scout allows one second call without web search after any failed web-search call.
- Analyst can continue an Anthropic `pause_turn`, but rejects unavailable required
  research instead of generating an unverified fallback.
- Coach has no explicit timeout or retry policy.
- Sports-provider HTTP calls have a timeout and no retry.

The web clients do not propagate user cancellation to these server calls. Local
UI loading locks reduce accidental double clicks, but they are not server-side
idempotency.

### Token and cost accounting

The Analyst records prompt/output **character counts**, model name, input snapshot,
and output JSON in `ai_analysis_runs`
([`001_initial_schema.sql`](../../supabase/migrations/001_initial_schema.sql),
[`002_sprint2_schema.sql`](../../supabase/migrations/002_sprint2_schema.sql)).
Character counts are not provider token usage and cannot support accurate billing.

The current routes do not persist:

- Anthropic input/output token counts;
- cache-write or cache-read token counts;
- provider request IDs;
- price-card version;
- estimated or actual currency cost;
- fallback/continuation cost as separate attempts;
- budget reservation, release, or overage state.

Coach stores its model name with the generated session. Scout stores generated
opportunities and whether web search was used. Scanner stores no analysis run.
There is no unified AI usage ledger.

### Caching, prompt caching, deduplication, and idempotency

No AI route uses a Next.js response cache, a distributed result cache, Anthropic
`cache_control`, or another prompt-caching primitive. The mobile
[`image-cache-lifecycle.ts`](../../apps/mobile/src/ai/image-cache-lifecycle.ts)
is only temporary device-file lifecycle management; it is not an AI cache.

No AI request accepts or derives an idempotency key, canonical input fingerprint,
or deduplication key. Repeating an Analyst, Scout, or Coach request can repeat
provider spend and create another persistent record. Financial write paths have
strong idempotency, but those controls are not connected to AI generation and must
not be counted as AI idempotency.

### Supabase access and connection readiness

Server-rendered pages and user routes create request-scoped Supabase clients
through [`lib/supabase/server.ts`](../../lib/supabase/server.ts). Privileged
persistence and the durable limiter create service-role clients through
[`lib/supabase/admin.ts`](../../lib/supabase/admin.ts). Bearer-authenticated mobile
requests use a request-scoped client with refresh and persistence disabled
([`request-auth.ts`](../../lib/supabase/request-auth.ts)); the mobile application
keeps one client singleton ([`apps/mobile/src/lib/supabase.ts`](../../apps/mobile/src/lib/supabase.ts)).

The application uses Supabase's JavaScript HTTP client and has no direct `pg` pool
or `DATABASE_URL` connection in tracked runtime code. That avoids a per-function
Node connection pool, but it does not prove end-to-end database capacity: Supabase
PostgREST/Auth/RPC quotas, internal connection-pool limits, database size, plan,
region, and connection headroom are external and `TBD`.

The Coach route currently reads all matching bets for the requested period before
aggregating in application memory. The limiter performs a database transaction
before every protected request. Both patterns need measured query and connection
impact under load.

### Observability and alerts

Current controls:

- Sentry initializes for browser, Node, and Edge runtimes with a 100% tracing
  sample rate and request error capture
  ([`instrumentation.ts`](../../instrumentation.ts),
  [`instrumentation-client.ts`](../../instrumentation-client.ts),
  [`sentry.server.config.ts`](../../sentry.server.config.ts),
  [`sentry.edge.config.ts`](../../sentry.edge.config.ts)).
- [`next.config.ts`](../../next.config.ts) enables Sentry source-map handling,
  tunnelling, and automatic Vercel monitor integration.
- PostHog emits feature-level started/completed/failed events from
  [`lib/analytics/events.ts`](../../lib/analytics/events.ts) through
  [`server.ts`](../../lib/analytics/server.ts).
- [`sanitize.ts`](../../lib/analytics/sanitize.ts) removes a defined set of
  top-level prompt, identity, AI-output, and financial properties before PostHog
  capture.
- Preview and production smoke workflows have bounded CI timeouts
  ([`preview-tests.yml`](../../.github/workflows/preview-tests.yml),
  [`production-smoke.yml`](../../.github/workflows/production-smoke.yml)).

Not evidenced in tracked code or configuration:

- route/provider latency histograms or RPS metrics;
- queue depth or job-age metrics (there is no queue);
- actual token, cost, cache-hit, or retry-attempt metrics;
- Supabase active/waiting connection and saturation metrics;
- a shared correlation/request ID across browser, API, ledger, provider, and DB;
- alert thresholds, paging ownership, or an AI-spend alert runbook;
- provider-tier or budget dashboards.

External Sentry, PostHog, Vercel, Supabase, and provider dashboards may contain
additional configuration, but this audit did not assume it.

### Privacy, security, and retention

Current strengths:

- user-owned rows are protected by RLS;
- AI persistence is through service-role-only RPCs with user identity derived from
  the authenticated session;
- rate-limit keys are hashed;
- provider URL secrets are redacted;
- PostHog properties are filtered before capture;
- Scanner images are sent to Anthropic but are not persisted by the BetTracker
  route.

Current gaps:

- Analyst stores an input snapshot and output JSON; Scout stores request context
  and generated reasoning; Coach stores focus notes, metrics snapshots, and
  generated output;
- no application retention period, expiry column, purge job, legal hold, or
  user-visible deletion policy is defined for these AI records;
- third-party provider retention and training settings are not represented in
  code;
- PostHog sanitization is shallow rather than recursive;
- no data-classification field distinguishes raw content from derived metrics in
  a future ledger/cache.

Retention periods, deletion service levels, cache content policy, and provider data
processing terms are `TBD` and require privacy/security approval.

## Constraints and gaps

The current architecture implements the controlled-beta flows above, but the code
does not prove readiness for large simultaneous demand:

1. paid AI work executes inside synchronous serverless requests;
2. there is no durable admission queue, priority, or backpressure;
3. rate limits count requests rather than attempts, tokens, or money;
4. no AI idempotency or result deduplication prevents duplicate spend;
5. no response cache or Anthropic prompt caching is enabled;
6. model selection is per-route environment configuration, not a governed router;
7. retry/fallback semantics are inconsistent and can create a second paid call;
8. token/cost accounting is incomplete and not reconcilable;
9. database, Vercel, Anthropic, and sports-provider capacity have not been load-tested;
10. metrics and alerting do not cover the scale/economics signals needed for safe
    rollout;
11. AI content retention and provider data-processing policy are not defined.

## Decision: target architecture

Adopt the following architecture incrementally before mass marketing:

```text
Web / Mobile
    |
    v
Authenticated AI admission API
    |-- validate + normalize
    |-- per-user / per-plan / global policy
    |-- idempotency + dedup lookup
    |-- estimated-token/cost reservation
    v
Durable AI job + usage-ledger intent
    |
    v
Priority queue ---- backpressure / provider concurrency ---- dead-letter review
    |
    v
Versioned worker -> model router -> bounded provider attempt(s)
    |                   |
    |                   +-> Anthropic prompt cache for approved stable blocks
    v
Validated result + actual usage/cost + terminal outbox event
    |
    v
Status/poll/subscription response to the originating user
```

Sports-data ingestion uses a separate provider queue and freshness-aware canonical
cache. User AI jobs reference a versioned sports-data snapshot rather than making
unbounded live provider calls. This keeps provider quotas, data freshness, and AI
spend independently observable.

### Request deduplication and idempotency

Every AI admission request must carry a client-generated idempotency key. The
server also derives a canonical fingerprint from:

- authenticated user and feature;
- prompt/schema version;
- normalized, privacy-reviewed inputs;
- selected model-policy version;
- relevant sports-data snapshot/freshness version.

A unique constraint binds the user, feature, and idempotency key to one payload.
Exact replay returns the existing job/result; a conflicting payload returns a
conflict without provider work. A short, policy-specific deduplication window may
reuse an eligible result for the same fingerprint. Dedup TTLs are `TBD` and must
respect data freshness and user isolation.

Worker attempts use a durable lease and compare-and-set terminal transition.
Provider completion and result publication use an outbox/transactional boundary
so that a crash cannot create two terminal results or lose an accepted job.

### Caching and Anthropic prompt caching

Use two distinct mechanisms:

1. **Result cache:** only for inputs whose freshness and privacy class allow reuse.
   Keys include prompt/schema/model policy and data-snapshot versions. Coach output
   remains user-scoped; no user-specific result is shared across users.
2. **Anthropic prompt caching:** mark only reviewed, stable system instructions
   and large stable sports/domain context blocks with Anthropic `cache_control`.
   User inputs, rapidly changing odds/news, and secrets are excluded.

Record cache creation/read tokens, cache age, cache key version, and hit/miss reason
in the usage ledger. Cache TTLs, invalidation events, minimum reusable prompt size,
and expected savings are `TBD` pending baseline measurements and current Anthropic
commercial terms.

### Priority queue, backpressure, and rate limits

Define explicit classes:

1. interactive user analysis;
2. interactive Scanner extraction;
3. user-requested Scout/Coach;
4. internal refresh/recompute;
5. bulk/backfill.

Exact weights and concurrency are `TBD`. Interactive work may receive higher
priority, but no plan may bypass global financial or provider-safety limits.
Admission must reject or defer before provider spend when:

- the user's or plan's concurrency/usage limit is reached;
- queue age/depth crosses an approved threshold;
- provider rate-limit headroom is exhausted;
- global daily/monthly spend is reserved or consumed;
- required sports data is too stale;
- database/runtime health is below its gate.

Responses must distinguish `queued`, `rate_limited`, `budget_exhausted`,
`provider_degraded`, and `data_stale` with a safe retry policy.

### Model router and fallback

Replace route-local model selection with a versioned policy that considers feature,
modality, quality tier, data availability, latency target, token estimate, user
plan, and remaining budget. Each ledger attempt records the policy and model
selected.

Fallback is bounded and feature-specific:

- maximum automatic attempts: `TBD`, but never unbounded;
- no fallback may weaken an Analyst current-research requirement silently;
- a lower-cost model is allowed only after quality evaluation for that feature;
- provider overload and transport failure are distinct from invalid model output;
- retryable failures use jittered backoff in the queue, not an open server request;
- fallback reservations count against the same global and user budgets.

The default and fallback model matrix, quality thresholds, and alternate AI
provider decision remain `TBD`.

### AI usage ledger and cost accounting

Create an append-safe ledger whose lifecycle is:

```text
admitted -> reserved -> running -> succeeded | failed | cancelled | expired
```

At minimum record:

- internal request/job/attempt IDs and hashed idempotency/fingerprint references;
- user/plan/feature and prompt/model-policy versions;
- provider, model, provider request ID, region, and timestamps;
- estimated input/output tokens and estimated cost;
- actual uncached input, cache-write, cache-read, and output tokens;
- versioned price-card ID, currency, actual cost, and reconciliation status;
- queue wait, provider latency, total latency, retry/fallback reason;
- result/cache outcome and terminal error class.

Raw prompts, images, and generated text do not belong in the economic ledger.
Content storage remains separately access-controlled and retention-governed.
Provider usage must be reconciled to provider billing exports. Price-card source,
currency, rounding, tax treatment, and reconciliation tolerance are `TBD`.

### Budget guardrails

Use reserve-before-run and settle-after-run accounting for:

- maximum tokens and cost per request;
- per-user daily and monthly limits;
- per-plan daily and monthly limits;
- global daily and monthly hard stops;
- provider/model-specific concurrency and spend;
- separate experimental/bulk budgets.

Soft thresholds warn and shed low-priority work; hard thresholds stop new paid work
before the provider call. Administratively approved emergency overrides must be
audited, time-bounded, and unable to disable the global hard stop silently.

All currency amounts, token ceilings, plan allocations, warning percentages,
override roles, and reset times are `TBD`.

### Supabase pooling and query capacity

Before scale rollout:

- document the Supabase plan, database compute, PostgREST/Auth quotas, pool mode,
  maximum connections, reserved admin capacity, and region;
- load-test request-scoped HTTP clients and RPC concurrency rather than assuming
  “no direct `pg` pool” means unlimited capacity;
- move large Coach aggregation to bounded/indexed SQL or precomputed aggregates;
- batch ledger writes and queue claims safely;
- bound rate-limit cleanup and hot-key contention;
- measure active/waiting connections, transaction latency, locks, cache hit ratio,
  CPU, I/O, and storage growth;
- preserve headroom for auth, financial writes, incident access, and rollback.

Connection ceilings, pool allocation, query p95/p99, headroom percentage, and
scale-up trigger are `TBD` after plan verification and load testing.

### Graceful degradation

If AI is unavailable:

- retain read-only access to existing bets, decisions, reports, and analytics;
- stop new paid work at admission when the provider or budget is unhealthy;
- show explicit queued/degraded status and safe retry timing;
- never silently substitute an unqualified model or uncited Analyst result;
- allow a labelled Scout limited-data mode only under its approved quality policy.

If a sports-data provider is unavailable:

- serve the last validated canonical snapshot only within an approved freshness
  TTL;
- display source timestamp and degraded/stale status;
- block pricing, auto-settlement, or “current” claims when freshness is insufficient;
- queue provider refresh with bounded retry and circuit breaking;
- isolate one provider's outage from unrelated product reads and financial writes.

Freshness TTLs, circuit-breaker thresholds, maximum retry age, and user messaging
SLAs are `TBD`.

### Observability, alerts, and incident response

Correlate admission, queue, worker, provider, ledger, cache, and persistence with
one non-secret trace/request ID. Instrument at least:

- admitted/completed/failed/cancelled RPS by feature and plan;
- end-to-end, queue-wait, provider, and DB latency percentiles;
- queue depth, oldest-job age, lease expiry, retry, fallback, and dead-letter count;
- active/waiting DB connections, query latency, locks, CPU, I/O, and storage;
- input/output/cache tokens and estimated/actual cost;
- cache hit ratio and invalidation reason;
- provider 429/5xx/timeout and application validation/persistence errors;
- quality score and refusal/degradation rates.

Dashboards must separate user errors from platform/provider errors and avoid
high-cardinality raw IDs. Alerts need an owner, threshold, window, runbook, and
escalation policy. Threshold values, paging service, on-call rotation, SLOs, and
error budgets are `TBD`.

### Privacy, security, and retention target

Before implementation:

- classify prompt, image, sports, model-output, ledger, trace, and cache data;
- define purpose, access, encryption, residency, retention, deletion, and legal-hold
  rules for each class;
- verify Anthropic and every future provider's retention/training controls and DPA;
- recursively sanitize telemetry and prohibit raw content in metrics/ledger;
- keep user-specific cache keys tenant-bound and non-enumerable;
- encrypt or hash sensitive dedup inputs without making equality keys reversible;
- audit service-role use and separate queue/ledger worker privileges;
- test user deletion across primary rows, caches, queues, logs, and provider data.

Exact retention periods, deletion SLA, residency, and approved provider settings
are `TBD`.

## Implementation sequence

The mandatory roadmap milestone is delivered in this order:

1. Measure current performance, quality, token estimates, and provider invoices.
2. Add correlation and observability before changing execution.
3. Add an additive AI usage ledger and dual-write/reconciliation.
4. Add idempotency, deduplication, result caching, and Anthropic prompt caching.
5. Introduce a versioned model router and bounded fallback policy.
6. Add durable queues, priorities, leases, backpressure, and dead-letter handling.
7. Enforce per-user, per-plan, provider, and global budget guardrails.
8. Validate Supabase pooling, query shape, indexes, and connection headroom.
9. Execute representative web/mobile load tests plus a separate simultaneous-AI
   test.
10. Roll out behind flags through 10% → 25% → 50% → 100% cohorts with soak gates.
11. Approve capacity, incident-response, and rollback runbooks before mass marketing.

No stage may infer success from unit tests alone where the gate requires measured
production-like load or provider behavior.

## Scale-readiness gate

### 1000+ concurrent sessions

Required evidence: a production-like mix of authenticated web/mobile reads and
safe non-write interactions at 1000+ concurrent sessions.

Pass condition: no critical runtime/database failure. Latency/error thresholds
and test duration are approved in advance (`TBD`) and met with documented
headroom.

### Simultaneous AI stress

Required evidence: a separate burst/soak test using representative Analyst, Scout,
Coach, and Scanner payload classes with provider-safe fixtures/mocks before any
live-provider run.

Pass condition: every admitted request reaches exactly one terminal state; zero
lost requests; zero duplicate terminal results; the queue drains within `TBD`;
provider/live test volume is separately approved.

### Delivery correctness

Required evidence: fault injection at admission, reservation, queue lease,
provider completion, persistence, and result publication.

Pass condition: zero accepted jobs lost and zero uncontrolled retries. Idempotent
replay does not create another billable attempt unless policy explicitly
authorizes it.

### Runtime and database stability

Required evidence: Vercel and Supabase metrics for the entire test and recovery
window.

Pass condition: no saturation or critical errors. Connection, CPU, I/O, and
latency headroom thresholds are `TBD` and met.

### AI budget

Required evidence: ledger reconciliation against provider usage/invoice plus
guardrail tests.

Pass condition: actual cost stays within approved daily/monthly and per-test
budgets (`TBD`); hard-stop tests prevent unreserved provider spend.

### AI quality

Required evidence: a versioned evaluation set and current-control baseline by
feature, language, and sport.

Pass condition: quality is not worse than the approved control beyond a
predeclared statistical tolerance (`TBD`).

### AI/provider degradation

Required evidence: forced Anthropic 429/5xx/timeout, malformed output, and
sports-provider outage/staleness tests.

Pass condition: existing reads remain available; new work is queued or rejected
safely; no unverified “current” result or financial side effect is created.

### Operations

Required evidence: alert fire drills, a named incident commander, runbooks,
capacity plan, and rollback rehearsal.

Pass condition: alerts fire within `TBD`; responders complete the runbook and
rollback without lost or duplicate jobs.

Until every row passes with captured evidence, the correct status is **NOT SCALE
READY**.

## Gradual rollout and rollback strategy

Scale features are introduced behind independently reversible flags for ledger
dual-write, idempotent admission, result cache, prompt cache, model router, queue,
and budget enforcement.

Each 10%, 25%, 50%, and 100% cohort requires:

- an approved cohort definition and soak duration (`TBD`);
- quality, latency, error, queue, database, token, and cost gates;
- provider and financial headroom;
- no unresolved severity-1/2 incident;
- a tested rollback owner and command/runbook.

Rollback is forward-compatible and preserves accepted work:

1. stop new admission or route it to the last approved path;
2. pause the affected queue class without deleting jobs;
3. allow compatible in-flight leases to finish or expire deterministically;
4. disable router/cache behavior by versioned flags;
5. continue ledger reconciliation and outbox delivery;
6. revert application behavior while retaining additive schema and audit records;
7. verify zero orphaned, duplicated, or unaccounted requests before reopening.

Destructive schema rollback and deletion of ledger/queue evidence are prohibited
during an incident.

## Alternatives considered

### Keep synchronous routes and only lower rate limits

Rejected as the scale target. It does not create durable admission, backpressure,
global budget control, idempotency, or recoverable delivery.

### Use per-instance memory for queues, limits, or cache

Rejected. Serverless instances scale and restart independently; memory cannot
provide global economics or durable job ownership.

### Route every task to the cheapest model

Rejected. Cost without feature-level quality gates can degrade decision support
and invalidate the control baseline.

### Retry every provider failure automatically

Rejected. Unbounded or ambiguous retries multiply cost and can duplicate
persistence. Retry eligibility must be explicit, budgeted, and idempotent.

### Record only aggregate monthly provider invoices

Rejected. Aggregate invoices cannot enforce per-request/user/plan budgets, explain
fallback cost, or reconcile individual incidents.

### Build every component in-house

Not selected yet. Managed queue/workflow, observability, and billing-export options
may reduce operational risk, but vendor lock-in, data residency, cost, and failure
semantics require a separate decision. Provider selection is `TBD`.

## Consequences

Positive:

- accepted AI work becomes durable, observable, deduplicated, and economically bounded;
- scaling decisions use measured quality/capacity/cost evidence;
- provider and sports-data failures degrade explicitly rather than unpredictably;
- staged rollout and rollback can preserve in-flight work and audit evidence.

Tradeoffs:

- additional queue and ledger latency for interactive requests;
- more storage, reconciliation, and operational ownership;
- model/prompt/cache versioning complexity;
- privacy review for new telemetry and cache classes;
- future migrations and runtime changes, each requiring separate review and rollout.

## Explicit TBD decisions

- Vercel plan, regions, memory, concurrency, and function-duration ceilings;
- Supabase plan, compute, PostgREST/Auth quotas, pool mode, connection ceiling,
  and headroom;
- Anthropic tier/rate limits and any alternate provider;
- queue/workflow technology and worker hosting;
- feature/model/fallback matrix and maximum automatic attempts;
- load-test RPS mix, simultaneous AI burst size, soak durations, and
  latency/error SLOs;
- cache TTLs, invalidation, prompt-cache blocks, and minimum economic benefit;
- per-request/user/plan/provider/global token and currency limits;
- daily/monthly warning and hard-stop amounts;
- price-card source, currency, tax/rounding, and reconciliation tolerance;
- quality evaluation set, control scores, and non-inferiority tolerance;
- sports-data freshness, circuit-breaker, retry, and stale-read thresholds;
- data retention, deletion SLA, residency, and provider privacy settings;
- alert thresholds, paging service, on-call ownership, and incident SLOs.
