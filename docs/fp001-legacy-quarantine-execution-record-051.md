# Execution Record — FP-001 Legacy Pricing Quarantine (Decision #051)

## Status

EXECUTED 2026-07-10 · CPO accept on PR #135 · sanitized record, rides under Decision #051.

## Pre-apply refinement (recorded)

A read-only pre-apply snapshot showed the `ai_analysis_runs` match was 31 by key presence but
only 17 by non-null value — the other 14 rows had the pricing keys with `null` values (not
readable false precision, and an empty audit row is meaningless). The migration's run clauses
were tightened to match by **non-null value**, aligning the implementation with the reviewed
17-run / 78-total counts. Committed as `2da212d` before apply.

## Sequence

1. **Before snapshot** (read-only): decisions 20, opportunities 41, analysis runs 17 (by
   non-null pricing value); no quarantine table yet.
2. **Migration 022 applied** via Supabase migration tooling (`fp001_legacy_quarantine_022`).
3. **After verification:**

   | Surface | Before | After (readable pricing) |
   |---------|--------|--------------------------|
   | `decisions` | 20 | **0** |
   | `market_opportunities` | 41 | **0** |
   | `ai_analysis_runs` (non-null JSON value) | 17 | **0** |
   | `fp001_pricing_quarantine` rows | — | **78** (decisions 20 + opportunities 41 + runs 17) |

   - 14 `ai_analysis_runs` retain the pricing keys with `null` values (intentionally left —
     a null key is not readable false precision).
   - Quarantine table privileges: `anon` SELECT = false, `authenticated` SELECT = false
     (service-role only, RLS on) ✓.
4. **PR #135 merged.**

## Result

No fabricated pre-gate pricing value is readable anywhere in the domain — the last FP-001
data residue is quarantined. The originals are preserved (reversible) in
`fp001_pricing_quarantine` for audit. The cutoff guard (`created_at < 2026-07-07`) means a
re-run never touches a future genuinely-verified row.

## Safety confirmed

No read path breaks: Coach already ignores legacy `edge_percent` (PR #122); the
Analyst/decision/Scout surfaces gate display on the quality gate, so NULL pricing renders as
the blocked surface these legacy rows already showed; analytics reads bet P&L, not decision
pricing.

## Holds unchanged

Football enrichment, odds work, new provider calls, and new betting-signal surfaces remain
on HOLD.
