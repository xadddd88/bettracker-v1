# Protocol: reproducible AI performance, quality, and cost baseline

Protocol version: `ai-baseline-v1`

Runtime commit:
`83e92616e2a485b351c41317e4034394bf0eee0b`

Status: offline baseline evidence only; **NOT SCALE READY**

## 1. Purpose and boundary

This protocol establishes a repeatable first measurement for the four current
AI flows without changing their runtime behavior:

- Scanner;
- Analyst;
- Scout;
- Coach.

The harness executes the compiled Next.js Route Handler functions and preserves
their current parsing, schema validation, quality gates, fallback rules, error
classification, and persistence call sites. It replaces only the external
boundaries:

- Anthropic SDK and Scanner REST transport;
- authenticated Supabase reads;
- service-role persistence RPCs;
- durable rate-limit RPC result;
- PostHog server events.

Every replacement is an in-process fake. `ANTHROPIC_API_KEY` is replaced by a
non-token placeholder before a route module is loaded. Global `fetch`,
`http`, `https`, `net`, and `tls` outbound paths are guarded. An unexpected
network call is a hard failure.

The harness does **not**:

- call a live AI or sports-data provider;
- read or write Supabase;
- inspect or use production environment values;
- send Telegram messages;
- generate a bet, decision, coaching session, or Scout record outside memory;
- exercise Vercel, production, mobile runtime, migrations, queues, or caches;
- infer live-model quality from mock text.

## 2. Proven current flow contracts

The versioned machine contract is
[`fixtures/v1/contracts.json`](fixtures/v1/contracts.json).

| Flow | Current entry | Attempts and boundary | Persistence |
| --- | --- | --- | --- |
| Scanner | Web AI and new-bet pages, plus mobile Scanner → [`POST /api/ai/scanner`](../../app/api/ai/scanner/route.ts) | `claude-sonnet-4-6`; `max_tokens=1200`; 60-second default per call; maximum 2 calls, where call 2 is only a missing-legs normalization fallback | None |
| Analyst | Web AI page → [`POST /api/ai/analyst`](../../app/api/ai/analyst/route.ts) | configured Analyst model or Sonnet 4.6; `max_tokens=5000`; 60-second turn timeout; initial call plus at most two [`pause_turn` continuations](../../lib/ai/analyst-research.ts) | One [`persist_analysis_decision`](../../supabase/migrations/017_prepare_domain_write_boundaries.sql) RPC after all gates |
| Scout | Web Scout → [`POST /api/scout`](../../app/api/scout/route.ts) | configured Scout/Analyst model or Sonnet 4.6; `max_tokens=2000`; 55 seconds per attempt; maximum 2 calls only when a failed web-search call falls back to limited-data mode | One [`persist_market_opportunities`](../../supabase/migrations/019_prepare_agent_write_boundaries.sql) RPC after schema and pricing quarantine |
| Coach | Web Coach → [`POST /api/coach`](../../app/api/coach/route.ts) | configured Coach/Analyst model or Sonnet 4.6; `max_tokens=2000`; 1 call; no explicit route-level provider timeout | One [`persist_coaching_session`](../../supabase/migrations/019_prepare_agent_write_boundaries.sql) RPC after the history and schema gates |

The harness statically rechecks these anchors before executing a fixture. Contract
drift fails the run.

## 3. Dataset contract

The anonymized synthetic dataset is versioned as `ai-baseline-v1`.

Each fixture records:

- unique fixture ID;
- flow, sport, and language;
- success, error, or boundary class;
- sanitized input or synthetic image identifier;
- deterministic fake-output template;
- expected HTTP status;
- expected provider-attempt count;
- expected persistence-attempt count;
- expected schema result;
- flow-specific hard conditions.

Coverage includes:

- football and tennis inputs;
- Ukrainian and English Scanner OCR;
- all eight explicit Analyst and Scout locale modes:
  `auto`, `uk`, `ru`, `en`, `es`, `fr`, `de`, `ar`;
- seven representative Coach focus-note languages, while documenting that Coach
  has no finite locale enum or output-language schema;
- valid outputs, malformed outputs, input boundaries, fallback paths, and
  current-research citation binding.

Scanner uses a one-pixel synthetic PNG transport fixture. The OCR text is supplied
by the fake provider and is not an assertion about real vision quality.

### Objective hard failures

A fixture hard-fails only on deterministic facts:

- route HTTP status differs from the pinned expectation;
- provider attempts differ from the actual route contract;
- persistence is missing, repeated within a request, or occurs on an error path;
- a successful route rejects its own output schema;
- malformed output is accepted;
- Scanner fields differ from the versioned expected values;
- current-research citation binding or Scout fallback disposition differs;
- a real network boundary is attempted.

Language consistency is recorded from the final route response. It is not treated
as proof of model quality. In particular, the Analyst request schema accepts eight
locale modes, while the FP-001 protected trust view currently implements only
`uk` and `en`
([`AnalystTrustLocale`](../../lib/ai/analysis-quality-gate.ts)). The baseline
records that mismatch instead of changing it.

### Not objective in this offline run

The following are always `NOT MEASURED` unless a separately authorized live-model
evaluation supplies human-reviewed evidence:

- factual correctness;
- real OCR accuracy;
- usefulness or writing quality;
- semantic completeness and internal consistency;
- hallucination/fabrication rate;
- real language fluency;
- Analyst research recency beyond deterministic citation binding;
- no-regression/non-inferiority against a live control model.

Mock outputs may exercise a guard, but they never create a live-model quality
`PASS`.

## 4. Execution matrix

### Fixture and fault execution

All versioned fixtures run once. A separate injected fault matrix runs every flow
against:

- timeout/abort;
- provider 429;
- provider 5xx/overload;
- malformed response.

The observed HTTP classification is recorded as current behavior. The harness
does not normalize differences. For example, current Coach provider exceptions
fall through its generic `500` handler because Coach has no dedicated provider
error taxonomy.

### Local mocked concurrency

For every flow, the same compiled route executes 50 intentional requests at each
concurrency:

- 1;
- 5;
- 10;
- 25.

The fake provider adds a fixed 3 ms asynchronous delay. Supabase, rate-limit,
analytics, and persistence fakes run in memory. Reported metrics are:

- request, success, error, and timeout counts;
- p50, p95, and p99 route latency;
- wall-clock throughput;
- provider attempts;
- duplicate persistence calls within one request;
- serialized provider input/output bytes;
- estimated input/output tokens;
- estimated list-price cost.

These metrics answer “is the local route harness deterministic under concurrent
execution?” They do not answer “how much production load can the system serve?”

### Replay probe

Each flow receives the same admitted payload twice. The probe records provider
attempts and persistence calls. It is expected to demonstrate the current gap:
there is no AI request idempotency or result deduplication, so replay repeats
provider work and, for Analyst/Scout/Coach, persistence.

## 5. Metric definitions

| Metric | Definition |
| --- | --- |
| Latency | `performance.now()` around the Route Handler call and in-memory response creation |
| p50/p95/p99 | nearest-rank percentile of request latency for one flow/concurrency cell |
| Throughput | completed requests divided by cell wall-clock seconds |
| Provider attempts | every fake Anthropic SDK `messages.create` or Scanner REST invocation |
| Duplicate persistence | persistence calls above the route's one-call success contract within the same request |
| Input/output size | UTF-8 bytes of the serialized fake provider request and text response |
| Estimated tokens | `ceil(UTF-8 bytes / 4)`; a deterministic approximation, not provider usage |
| Estimated cost | estimated input/output tokens × the pinned list-price card |
| Actual usage/cost | provider usage export and invoice reconciliation; not derivable from this harness |

The price snapshot is
[`anthropic-sonnet-4-6-2026-07-24.json`](price-cards/anthropic-sonnet-4-6-2026-07-24.json),
sourced from the official
[Anthropic Sonnet page](https://www.anthropic.com/claude/sonnet): USD 3/MTok
base input and USD 15/MTok output for standard global usage as observed on
2026-07-24.

The cost estimate excludes prompt-cache categories, batch/contract discounts,
long-context premiums, web-search fees, tax, and invoice adjustments. Scanner
image tokenization is not represented by serialized base64 bytes, so Scanner's
estimate is explicitly a low-confidence serialization proxy.

`ACTUAL` usage and cost are `BLOCKED / NOT MEASURED` until an authorized,
privacy-reviewed provider usage and invoice export is supplied.

## 6. Reproduction

Prerequisites are the repository's existing Node dependencies. No dependency was
added for this harness.

Non-writing validation:

```powershell
npm ci
npm run test:ai-baseline
```

Explicit artifact generation:

```powershell
npm run build:provider-scripts
node scripts/ai-baseline-harness.mjs `
  --output scratch/ai-baseline-result.json `
  --report scratch/ai-baseline-report.md
```

Relevant existing gates:

```powershell
npm run test:analysis-quality-gate
npm run test:rate-limit
npm run test:domain-write-boundaries
npm run test:agent-write-boundaries
npm run lint
npx tsc --noEmit
```

## 7. Interpretation and future gate

The committed result is a control artifact for future changes. It is not an
approval threshold. The following remain:

- live-model quality control scores and non-inferiority tolerance: `TBD`;
- production-like web/mobile mix and 1000+ session duration: `TBD`;
- simultaneous AI burst size and soak duration: `TBD`;
- Vercel/Supabase/Anthropic latency and error SLOs: `TBD`;
- provider tier, capacity, and rate-limit headroom: `TBD`;
- per-request, per-user, per-plan, daily, monthly, and global budgets: `TBD`;
- actual provider usage/invoice reconciliation: `BLOCKED / NOT MEASURED`;
- Scanner vision-token estimator and Anthropic web-search fee treatment: `TBD`.

Until future production-like load, live-model evaluation, provider reconciliation,
and all ADR-011 operational gates pass, BetTracker remains **NOT SCALE READY**.
