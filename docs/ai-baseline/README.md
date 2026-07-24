# AI baseline harness

This directory implements stage 1 of
[ADR-011 — Scale Readiness & AI Economics](../adr/ADR-011-scale-readiness-ai-economics.md):
a reproducible, offline baseline of the current Scanner, Analyst, Scout, and
Coach execution paths.

The baseline is pinned to runtime commit
`83e92616e2a485b351c41317e4034394bf0eee0b`. It does not make BetTracker
scale-ready. It does not call Anthropic, Supabase, Telegram, Vercel, or any
production service.

Artifacts:

- [protocol](protocol.md);
- [runtime contracts](fixtures/v1/contracts.json);
- versioned [Scanner](fixtures/v1/scanner.json),
  [Analyst](fixtures/v1/analyst.json), [Scout](fixtures/v1/scout.json), and
  [Coach](fixtures/v1/coach.json) fixtures;
- [versioned Anthropic list-price snapshot](price-cards/anthropic-sonnet-4-6-2026-07-24.json);
- [machine-readable baseline](results/ai-baseline-v1-83e9261-local-mocked.json);
- [human-readable baseline](results/ai-baseline-v1-83e9261-local-mocked.md).

Run the non-writing verification:

```powershell
npm run test:ai-baseline
```

Generate a fresh pair of explicitly named local artifacts:

```powershell
npm run build:provider-scripts
node scripts/ai-baseline-harness.mjs `
  --output scratch/ai-baseline-result.json `
  --report scratch/ai-baseline-report.md
```

The generated latency and throughput values are local mocked route overhead.
They are not Vercel, Supabase, Anthropic, web/mobile load, or provider-capacity
measurements.
