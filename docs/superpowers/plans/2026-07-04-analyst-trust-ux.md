# Analyst Trust UX Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared Analyst Trust View Model so blocked/no-price Analyst output is localized, status-aware, and structurally free from pricing artifacts.

**Architecture:** Extend `lib/ai/analysis-quality-gate.ts` with per-leg status/actionability and shared render helpers. The Analyst API stores and returns deterministic blocked-mode trust content. The AI page, PDF/share text, and decision detail page consume the shared helpers instead of rendering raw blocked-mode AI reasoning/factors.

**Tech Stack:** Next.js App Router, TypeScript, React, Supabase RPC, Node script tests.

## Global Constraints

- Do not enable `SPORTS_FIXTURE_SYNC_WRITE_ENABLED`.
- Do not run write mode.
- Do not start M1.2.c.
- Do not add odds, results, SportMonks, enrichment, cron, fixture writes, or provider status lookup.
- In blocked/no-price mode, do not render raw AI reasoning or raw factor analysis as primary analysis.
- For `output_language = uk`, Analyst result, PDF/share, decision detail, and quality gate labels must be Ukrainian.

---

### Task 1: Trust View Model Tests

**Files:**
- Modify: `scripts/test-analysis-quality-gate.mjs`
- Modify: `lib/ai/analysis-quality-gate.ts`

**Interfaces:**
- Produces: `buildAnalystTrustView(input): AnalystTrustView`
- Produces: `renderAnalystTrustSummary(input): string`

- [ ] **Step 1: Write failing tests**

Add tests for:
- exact mixed-sport PDF coupon in Ukrainian
- no blocked-mode pricing terms or forbidden percentages in summary text
- leg 3 detected as tennis
- per-leg status/actionability present
- unknown status means Watch is allowed
- simulated finished leg means not actionable and Watch is not allowed

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd run test:analysis-quality-gate
```

Expected: FAIL because the new trust view APIs and localized output do not exist yet.

- [ ] **Step 3: Implement minimal trust view model**

Add typed status/actionability fields to the quality gate result and implement pure helpers that build deterministic blocked-mode text from structured inputs.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm.cmd run test:analysis-quality-gate
```

Expected: all analysis quality gate tests pass.

### Task 2: Analyst Route Enforcement

**Files:**
- Modify: `app/api/ai/analyst/route.ts`
- Modify: `scripts/test-analysis-quality-gate.mjs`

**Interfaces:**
- Consumes: `buildAnalystTrustView`
- Persists: `trust_view` inside `p_output_json`
- Returns: `trust_view` in Analyst API response

- [ ] **Step 1: Write failing route-shape tests**

Add tests that build the same API output shape and assert blocked output uses safe deterministic reasoning/factors instead of raw AI pricing-like factor text.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd run test:analysis-quality-gate
```

Expected: FAIL because `trust_view` is not yet included.

- [ ] **Step 3: Implement route changes**

After `evaluateAnalysisQuality`, build `trust_view`. If pricing is blocked, store deterministic `reasoning`, `factors`, `safeExplanation`, and `safeNextSteps` from the trust view rather than raw AI pricing-like text.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm.cmd run test:analysis-quality-gate
```

Expected: all analysis quality gate tests pass.

### Task 3: UI, PDF, Share, and Decision Detail Rendering

**Files:**
- Modify: `app/(app)/ai/page.tsx`
- Modify: `app/(app)/decisions/[id]/page.tsx`
- Modify: `app/(app)/decisions/[id]/DecisionActions.tsx`
- Modify: `scripts/test-analysis-quality-gate.mjs`

**Interfaces:**
- Consumes: `quality_gate` and `trust_view`
- Produces: localized blocked-mode rendering with Place Bet hidden and Watch governed by actionability

- [ ] **Step 1: Write failing render text tests**

Add assertions that the shared render text for UI/PDF/share contains Ukrainian labels and excludes forbidden pricing terms.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd run test:analysis-quality-gate
```

Expected: FAIL because UI/share/PDF helpers still produce English blocked-mode labels.

- [ ] **Step 3: Update renderers**

Use shared labels and trust view text in `/ai`, PDF/share generation, decision detail, and actions. Hide Place Bet when pricing is blocked or not actionable. Hide or disable Watch when the trust view says Watch is not meaningful.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm.cmd run test:analysis-quality-gate
```

Expected: all analysis quality gate tests pass.

### Task 4: Final Verification and Draft PR

**Files:**
- Only files touched by Tasks 1-3 and this plan/spec.

- [ ] **Step 1: Run focused tests**

```powershell
npm.cmd run test:analysis-quality-gate
npm.cmd run test:extract-json
npm.cmd run test:provider-safety
```

- [ ] **Step 2: Run production build with dummy public Supabase env if needed**

```powershell
npm.cmd run build
```

- [ ] **Step 3: Inspect diff**

```powershell
git status --short
git diff --stat
git diff --check
```

- [ ] **Step 4: Commit, push, and open draft PR**

```powershell
git add docs/superpowers/specs/2026-07-04-analyst-trust-ux-design.md docs/superpowers/plans/2026-07-04-analyst-trust-ux.md lib/ai/analysis-quality-gate.ts scripts/test-analysis-quality-gate.mjs app/api/ai/analyst/route.ts app/(app)/ai/page.tsx app/(app)/decisions/[id]/page.tsx app/(app)/decisions/[id]/DecisionActions.tsx
git commit -m "Add analyst trust UX patch"
git push -u origin codex/analyst-trust-ux
gh pr create --draft --base main --head codex/analyst-trust-ux --title "[codex] Add analyst trust UX patch"
```

## Self-Review

- Spec coverage: every PR #74 requirement maps to Tasks 1-3.
- Placeholder scan: no TODO/TBD/fill-later instructions remain.
- Type consistency: `quality_gate`, `trust_view`, per-leg status/actionability, and shared render helpers are named consistently.

