# FP-001 Legacy Pricing Quarantine (Decision #051)

## Status

SCOPE + IMPLEMENTATION. Awaiting CPO review. Migration 022 NOT applied yet.

Last updated: 2026-07-10

## Context

CPO audit item 5: "code is protected better than data." PR #122 stopped Scout/Coach from
using legacy pricing and the Analyst quality gate blocks pricing display, but the fabricated
pre-gate numbers still sit in the database. Production inventory (2026-07-10, read-only):

| Surface | Rows with pricing | Newest |
|---------|-------------------|--------|
| `decisions` (model/implied/edge) | 20 (all `ai_analyst`) | 2026-07-04 |
| `market_opportunities` (model/implied/edge) | 41 (all rows) | 2026-07-01 |
| `ai_analysis_runs.output_json` (model/implied/edge keys) | 17 (none carry a `quality_gate`) | — |

Every non-NULL pricing value predates the FP-001 gate / PR #122 (shipped 2026-07-07). Since
pricing has been blocked on 100% of runs, **no verified pricing has ever been produced** —
every one of these is a fabricated LLM number with no data basis. The current UI already
hides them (the gate's fallback blocks display for legacy rows), but the raw values remain
readable by any future analytics query, migration, or new Coach that reads the columns / JSON
directly — which would launder false precision into "real" pricing.

## Decision — backup + scrub (CPO's recommended option)

Migration `022_fp001_legacy_quarantine.sql` (one-time production data fix):

1. **Audit backup** — `fp001_pricing_quarantine` table (service-role only, RLS on, no grants
   to anon/authenticated) preserves every scrubbed value with its source table, row id,
   user id, and `quarantined_at`. The originals are retained (reversible) but out of the
   domain read paths.
2. **Scrub** — for each surface, back up **before** scrubbing, then:
   - `decisions`: `model_probability` / `implied_probability` / `edge_percent` → NULL
   - `market_opportunities`: same three → NULL
   - `ai_analysis_runs.output_json`: strip the `model_probability` / `implied_probability` /
     `edge_percent` keys
3. **Cutoff guard** — every backup + scrub is `WHERE created_at < '2026-07-07'`, so re-running
   against an updated database never touches a future genuinely-verified row.

Expected effect: `decisions` / `market_opportunities` / `ai_analysis_runs` all carry zero
readable pricing; `fp001_pricing_quarantine` holds 20 + 41 + 17 = **78** backup rows.

## Why no live "trust marker" column

The CPO audit floated a `pricing_trust_status` enum. After the scrub every live pricing value
is NULL, which already means exactly "no trustworthy pricing" — indistinguishable from a fresh
blocked run, which is the correct semantic. The distinction "this row was scrubbed as
FP-001 legacy" is preserved in the quarantine audit table, so a live marker column would be
redundant. Going forward, verified vs. blocked is decided by the existing quality gate; if a
verified-pricing path ever ships, a marker can be added then with real semantics rather than
speculatively.

## Safety analysis (no read path breaks)

- Coach already leaves its edge-accuracy buckets empty and ignores legacy `edge_percent`
  (PR #122) — scrubbing to NULL changes nothing for it.
- Analyst / decision-detail / Scout display gate on the quality gate; NULL pricing renders as
  the blocked/trust surface, which is what these legacy rows already show.
- Analytics reads bet P&L, not decision pricing.

## Tests

New CI suite `npm run test:fp001-quarantine` (5 static cases): quarantine table is
service-role-only with RLS, backup precedes scrub for every surface, all three columns nulled
on decisions + opportunities, JSON keys stripped on runs, cutoff-guarded. The live
before/after counts (decisions 20→0, opps 41→0, runs 17→0, quarantine = 78) are verified
against the database during execution and recorded in the execution record.

## Deployment order

1. CI + CPO review → 2. apply migration 022 → 3. verify counts (before captured now, after =
   0 live pricing + 78 quarantined) → 4. merge → 5. prod smoke (a legacy decision detail page
   still renders, now blocked) → 6. execution record.

## Non-goals

No schema change to the live pricing columns (kept for future verified pricing), no live
trust-marker column, no change to the quality gate, no deletion of the fabricated values
(preserved in quarantine), no Scout/Coach/Analyst logic change.
