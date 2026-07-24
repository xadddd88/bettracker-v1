# AI baseline report — mocked route execution

Generated: 2026-07-24T07:54:57.784Z

Runtime commit: `83e92616e2a485b351c41317e4034394bf0eee0b`

Dataset: `ai-baseline-v1`

Price card: `anthropic-sonnet-4-6-standard-global-2026-07-24`

Status: **NOT SCALE READY**

## Scope and interpretation

- All provider, Supabase, rate-limit, persistence, and analytics transports were injected fakes.
- Latency and throughput are local mocked route overhead, not Vercel, Supabase, or Anthropic capacity measurements.
- `ESTIMATED` token/cost values use UTF-8 bytes / 4 and the versioned list-price snapshot.
- `ACTUAL` provider usage and invoice cost are `BLOCKED / NOT MEASURED` because no authorized usage export was supplied.
- No live-model semantic quality result is inferred from deterministic mock output.

## Flow results

| Flow | Fixture contracts | Schema expectations | Route-language consistency | Live-model quality |
| --- | ---: | ---: | --- | --- |
| scanner | 5 | 5/5 | NOT_APPLICABLE | NOT MEASURED |
| analyst | 14 | 14/14 | 3/8 | NOT MEASURED |
| scout | 10 | 10/10 | 8/8 | NOT MEASURED |
| coach | 9 | 9/9 | 7/7 | NOT MEASURED |

The Analyst route accepts eight locale modes but the FP-001 trust surface has only `uk` and `en` locale implementations. The deterministic baseline therefore records non-Ukrainian explicit locales as English at the protected route output. This is evidence, not a runtime change.

## Mocked performance

| Flow | C | Requests | Success | p50 ms | p95 ms | p99 ms | req/s | Estimated USD / cell |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| scanner | 1 | 50 | 50 | 15.167 | 17.557 | 18.028 | 73.425 | 0.23876400 |
| scanner | 5 | 50 | 50 | 15.021 | 15.915 | 15.928 | 380.293 | 0.23876400 |
| scanner | 10 | 50 | 50 | 13.173 | 16.052 | 16.233 | 820.12 | 0.23876400 |
| scanner | 25 | 50 | 50 | 15.309 | 17.055 | 17.267 | 1576.571 | 0.23876400 |
| analyst | 1 | 50 | 50 | 14.79 | 17.362 | 18.063 | 78.757 | 0.37762500 |
| analyst | 5 | 50 | 50 | 14.514 | 17.657 | 17.7 | 421.297 | 0.37762500 |
| analyst | 10 | 50 | 50 | 15.516 | 18.241 | 18.271 | 738.024 | 0.37762500 |
| analyst | 25 | 50 | 50 | 8.453 | 10.376 | 10.529 | 2810.757 | 0.37762500 |
| scout | 1 | 50 | 50 | 15.681 | 17.684 | 17.986 | 65.178 | 0.29003400 |
| scout | 5 | 50 | 50 | 14.887 | 16.207 | 16.35 | 373.913 | 0.29003400 |
| scout | 10 | 50 | 50 | 15.428 | 16.139 | 16.268 | 676.289 | 0.29003400 |
| scout | 25 | 50 | 50 | 13.2 | 15.684 | 15.776 | 1740.82 | 0.29003400 |
| coach | 1 | 50 | 50 | 15.25 | 17.701 | 19.702 | 72.238 | 0.27870000 |
| coach | 5 | 50 | 50 | 14.88 | 16.792 | 17.039 | 419.17 | 0.27870000 |
| coach | 10 | 50 | 50 | 15.313 | 18.761 | 18.964 | 621.291 | 0.27870000 |
| coach | 25 | 50 | 50 | 16.523 | 17.767 | 17.893 | 1464.245 | 0.27870000 |

## Fault classification

| Flow | Fault | HTTP | Provider attempts | Persistence |
| --- | --- | ---: | ---: | ---: |
| scanner | timeout | 504 | 1 | 0 |
| scanner | rate_limit | 502 | 1 | 0 |
| scanner | server_error | 502 | 1 | 0 |
| scanner | malformed | 422 | 1 | 0 |
| analyst | timeout | 504 | 1 | 0 |
| analyst | rate_limit | 429 | 1 | 0 |
| analyst | server_error | 500 | 1 | 0 |
| analyst | malformed | 502 | 1 | 0 |
| scout | timeout | 504 | 1 | 0 |
| scout | rate_limit | 429 | 1 | 0 |
| scout | server_error | 503 | 1 | 0 |
| scout | malformed | 502 | 1 | 0 |
| coach | timeout | 500 | 1 | 0 |
| coach | rate_limit | 500 | 1 | 0 |
| coach | server_error | 500 | 1 | 0 |
| coach | malformed | 502 | 1 | 0 |

## Current replay behavior

| Flow | Same payloads | Provider attempts | Persistence writes |
| --- | ---: | ---: | ---: |
| scanner | 2 | 2 | 0 |
| analyst | 2 | 2 | 2 |
| scout | 2 | 2 | 2 |
| coach | 2 | 2 | 2 |

No AI route currently exposes request idempotency or result deduplication. Replays therefore repeat provider work; Analyst, Scout, and Coach also repeat persistence.

## Cost method

- Source: https://www.anthropic.com/claude/sonnet
- Input: $3/MTok; output: $15/MTok.
- Token estimate: `ceil(UTF-8 serialized request or response bytes / 4)` per aggregate.
- Scanner vision input is only a serialization proxy; image tokenization and tool fees are not represented.
- Actual usage, cache-token categories, web-search fees, discounts, tax, and invoice reconciliation are `BLOCKED / NOT MEASURED`.

## Required future measurements

- Live-model quality by flow, sport, and language: **NOT MEASURED**.
- Production-like Vercel/Supabase latency, capacity, connection headroom, and 1000+ session load: **NOT MEASURED**.
- Approved provider usage export and invoice reconciliation: **BLOCKED**.
- Quality non-inferiority tolerance, latency/error SLOs, burst size, soak duration, and financial guardrails: **TBD**.
- Anthropic web-search fees and Scanner vision token estimator: **TBD**.

## Safety evidence

- Fake Anthropic transports: 866
- Real outbound fetch attempts: 0
- Node socket attempts: 0
- Live Anthropic calls: 0
- Live Supabase calls: 0
- Telegram sends: 0
- Runtime/mobile/migration diff: none

## Rerun

```powershell
npm ci
npm run test:ai-baseline
npm run build:provider-scripts
node scripts/ai-baseline-harness.mjs --output <result.json> --report <report.md>
```
