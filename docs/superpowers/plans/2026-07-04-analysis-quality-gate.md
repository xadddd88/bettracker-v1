# Analysis Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent BetTracker AI Analyst from showing model probability or edge when the available data does not support priced betting analysis.

**Architecture:** Add a pure server-side quality gate before Analyst pricing is persisted or returned. Store the gate result in the analysis output JSON, persist blocked pricing as null, and make UI/PDF/share rendering depend on the gate result instead of always printing numeric pricing.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Supabase RPC, Node script tests.

## Global Constraints

- Do not enable `SPORTS_FIXTURE_SYNC_WRITE_ENABLED`.
- Do not run write mode.
- Keep this out of M1.2.c write validation.
- Do not add odds, results, enrichment, cron, or new UI scope beyond this quality gate.
- Never show "Model probability" unless backed by valid model inputs.
- Never show "Edge" unless model probability is valid.

---

### Task 1: Quality Gate Domain Module

**Files:**
- Create: `lib/ai/analysis-quality-gate.ts`
- Create: `scripts/test-analysis-quality-gate.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `evaluateAnalysisQuality(input: AnalysisQualityGateInput): AnalysisQualityGateResult`
- Produces: `isPricingAllowed(result: AnalysisQualityGateResult): boolean`
- Consumes: request context from `app/api/ai/analyst/route.ts`

- [ ] **Step 1: Write failing tests**

Add tests that import the compiled module and verify:
- mixed sport parlay blocks pricing
- tennis leg without full tennis support blocks pricing
- missing live team news, injuries, recent form, and line movement suppresses model probability and edge
- valid single-leg priced input remains priced

- [ ] **Step 2: Verify RED**

Run: `npm.cmd run test:analysis-quality-gate`

Expected: FAIL because `lib/ai/analysis-quality-gate.ts` does not exist and the script is not wired yet.

- [ ] **Step 3: Implement minimal module**

Create a typed quality gate that accepts sport, market, selection, notes, web search state, optional legs, and optional model input flags. It should return:

```ts
{
  status: 'priced' | 'insufficient_data' | 'unsupported',
  label: 'PRICED BETTING ANALYSIS' | 'INSUFFICIENT DATA' | 'NO PRICE - unsupported mixed-sport parlay',
  pricingAllowed: boolean,
  dataCoverageScore: number,
  missingDataByLeg: Array<{ legLabel: string; sport: string; missing: string[] }>,
  suppressedPricingFields: Array<'model_probability' | 'implied_probability' | 'edge_percent'>,
  reasons: string[],
  analysisType: 'risk_warning' | 'priced_betting_analysis',
}
```

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd run test:analysis-quality-gate`

Expected: all quality gate tests pass.

### Task 2: Analyst Route Enforcement

**Files:**
- Modify: `app/api/ai/analyst/route.ts`
- Modify: `scripts/test-analysis-quality-gate.mjs`

**Interfaces:**
- Consumes: `evaluateAnalysisQuality`
- Produces: Analyst JSON where blocked pricing fields are null and `quality_gate` explains why.

- [ ] **Step 1: Add route-shape tests**

Extend `scripts/test-analysis-quality-gate.mjs` with fixture-level assertions that a PDF-style express/mixed input produces no model probability or edge in the sanitized response shape.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd run test:analysis-quality-gate`

Expected: FAIL because route output still always contains numeric pricing.

- [ ] **Step 3: Enforce gate in route**

Call `evaluateAnalysisQuality()` after LLM schema validation and before server implied/edge calculation. If blocked, set `p_model_probability`, `p_implied_probability`, and `p_edge_percent` to null, persist `quality_gate` in `p_output_json`, return the same `quality_gate`, and track analytics with `edge_bucket: 'unpriced'` or another safe non-numeric bucket.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd run test:analysis-quality-gate`

Expected: all gate and route-shape tests pass.

### Task 3: AI Result, Share, PDF, and Decision Detail Rendering

**Files:**
- Modify: `app/(app)/ai/page.tsx`
- Modify: `app/(app)/decisions/[id]/page.tsx`
- Modify: `scripts/test-analysis-quality-gate.mjs`

**Interfaces:**
- Consumes: `quality_gate` in Analyst response or persisted output JSON.
- Produces: Rendered text that distinguishes risk warning from priced betting analysis.

- [ ] **Step 1: Add rendering tests**

Add string renderer helpers or exported pure helpers so tests can assert that blocked output contains `INSUFFICIENT DATA` or `NO PRICE - unsupported mixed-sport parlay` and does not contain `Model probability 28` or `Edge -17.4`.

- [ ] **Step 2: Verify RED**

Run: `npm.cmd run test:analysis-quality-gate`

Expected: FAIL because the current UI/PDF/share strings always print pricing.

- [ ] **Step 3: Update rendering**

Update the AI page and decision detail page to show pricing stats only when `quality_gate.pricingAllowed === true`. When blocked, show data coverage score, missing checklist per leg, and a risk-warning section.

- [ ] **Step 4: Verify GREEN**

Run: `npm.cmd run test:analysis-quality-gate`

Expected: all rendering and gate tests pass.

### Task 4: Final Verification and Publish

**Files:**
- Modify only files already listed by Tasks 1-3.

**Interfaces:**
- Produces: draft PR `codex/analysis-quality-gate` against `main`.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm.cmd run test:analysis-quality-gate
npm.cmd run test:extract-json
npm.cmd run test:provider-safety
```

- [ ] **Step 2: Run build or type check**

Run:

```powershell
npm.cmd run build
```

- [ ] **Step 3: Inspect diff**

Run:

```powershell
git status --short
git diff --stat
git diff --check
```

- [ ] **Step 4: Commit and open draft PR**

Run:

```powershell
git add package.json lib/ai/analysis-quality-gate.ts scripts/test-analysis-quality-gate.mjs app/api/ai/analyst/route.ts app/(app)/ai/page.tsx app/(app)/decisions/[id]/page.tsx docs/superpowers/plans/2026-07-04-analysis-quality-gate.md
git commit -m "Add analysis quality gate"
git push -u origin codex/analysis-quality-gate
gh pr create --draft --base main --head codex/analysis-quality-gate --title "[codex] Add analysis quality gate"
```

## Self-Review

- Spec coverage: every requested behavior is mapped to Tasks 1-3.
- Placeholder scan: no TBD/TODO/fill-later steps remain.
- Type consistency: `quality_gate`, `pricingAllowed`, `dataCoverageScore`, and `missingDataByLeg` are used consistently across the route, response, and UI plan.
