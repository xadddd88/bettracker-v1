# BetTracker AI — Project State

> **Source of truth for current beta status.**
> Last updated: 2026-07-05

---

## 1. Current Status

| Field | Value |
|---|---|
| **Engineering Shell** | READY |
| **Product Vision Beta** | NOT READY |
| **External beta launch** | PAUSED — product does not yet match founder vision |
| **Production URL** | https://btdk.app |
| **Repo** | xadddd88/bettracker-v1 |
| **Branch model** | Feature branches → PR → CPO accept → Dima merges |
| **Current UI** | Stable dark UI + Ambient Theme live as-is |
| **Ambient Theme** | Current version live in production — further Design v2 / premium event skin work is parked |
| **Current phase** | M1.2 provider-backed fixture foundation complete; M1.3 read-only odds dry-run implementation in draft PR #84; Product Vision Gap / Beta v2 planning continues |
| **Active blockers** | None in current main — product vision gaps documented in PRODUCT_VISION_GAP.md |
| **External beta invites** | Do not invite external beta users yet |

> **Note:** main is stable and frozen. No rollback needed. No urgent bugfix. Engineering shell is solid.
> The pause is a product decision — the engineering work done is confirmed and retained.
> See PRODUCT_VISION_GAP.md for the full roadmap to Product Vision Beta.

---

## 1a. Sports Data Provider Decision

| Field | Value |
|---|---|
| **Football** | Split strategy — API-Football / API-Sports Ultra (broad calendar/odds/results) + SportMonks (deep enrichment: xG, pressure, predictions, match facts) |
| **Tennis** | API-Tennis Business (fixtures/odds/results/H2H, source of truth) |
| **Security note** | `SPORTMONKS_TOKEN` rotation **complete** — token was rotated after briefly appearing in an open field; stored as a Vercel Sensitive env var. Redact SportMonks `api_token` in logs/errors. |
| **Status** | Decision recorded — see `DATA_PROVIDER_DECISION.md`. Phase 1 technical plan exists in `PHASE_1_TECHNICAL_PLAN.md` (merged PR #63). M1.2 provider client and controlled fixture write validation completed; Scout v2 not started. Product Vision Beta remains NOT READY; external launch remains PAUSED. |

---

## 1b. Sports Fixture Data Foundation

| Milestone | Status | Evidence |
|---|---|---|
| M1.2.b Fixture Sync Dry-Run | DONE | Production/preview dry-runs validated API-Football and API-Tennis fetch paths with write counters at 0. |
| M1.2.c Fixture Write Safety Guard | DONE | `dryRun=false` requires one provider, one day, and a 25-fixture cap; production safety smoke returned expected `400` / `400` / `200` responses. |
| M1.2.c Controlled Fixture Write Validation | DONE | Controlled scope `api_football` / `2026-12-31` fetched 2 fixtures; first write inserted 2 canonical fixtures and 2 provider links; idempotency write inserted 0 and updated 2/2; duplicate provider links = 0. |

Final production state after validation:

- `SPORTS_FIXTURE_SYNC_WRITE_ENABLED`: absent/off
- `writeEnabled`: false
- production alias: https://btdk.app
- deployed commit: `ad8ce53645509fbc38697901045f05074e1e89d2`
- no broad write, multi-provider write, or multi-day write was run
- odds, results, SportMonks enrichment, cross-provider mapping, cron, Scout, Analyst, and UI remained untouched by M1.2.c

M1.3 Odds Snapshot Sync Design is DONE via PR #79. M1.3 Odds Endpoint Discovery & Dry-Run Plan is DONE via PR #80. M1.3 API-Football Odds Endpoint & Cost Confirmation is DONE / BLOCKED via PR #81 and superseded for planning by PR #82 provider evidence. M1.3 Read-Only Odds Dry-Run Scope is DONE via PR #83. M1.3 Read-Only Odds Dry-Run Implementation is in draft PR #84. M1.3 odds writes, migrations, production provider odds calls, Scout, Analyst, and UI usage remain NOT STARTED.

---

## 1c. M1.3 Odds Snapshot Sync Design

| Field | Value |
|---|---|
| **Status** | DESIGN DONE via PR #79; endpoint discovery / dry-run planning DONE via PR #80; endpoint/cost confirmation DONE / BLOCKED via PR #81; provider evidence DONE via PR #82; read-only dry-run scope DONE via PR #83; read-only dry-run implementation in draft PR #84 |
| **Implementation** | READ-ONLY PLANNER from PR #80; protected read-only dry-run path in draft PR #84; odds ingestion NOT STARTED |
| **Odds ingestion** | NOT STARTED |
| **Provider calls** | NOT RUN; production odds provider calls require PR #84 merged/deployed and separate CPO runtime approval |
| **Migrations** | NOT ADDED |
| **User-facing usage** | BLOCKED until separate validation milestone |
| **Odds write flag** | `SPORTS_ODDS_SYNC_WRITE_ENABLED` not added/enabled |

Design direction:

- odds v1 starts with API-Football and football fixtures only
- no cron or broad ingestion in the first implementation milestone
- first implementation must be dry-run first, operator-gated, capped, and manually validated
- odds snapshots must not feed Analyst, Scout, user-facing probability, edge, or EV until verified in a later trust milestone
- storage, provider quota, market normalization, bookmaker scope, and retention must be accepted before any odds write
- PR #80 added a read-only planner only; it never reports writes as allowed
- PR #82 confirms docs-sourced `/odds`, fixture-specific request shape, pagination, cost model, bookmaker/mapping discovery shapes, `Match Winner` = bet id `1`, and sanitized odds response shape
- PR #83 scopes the first read-only production odds dry-run candidate: `GET /odds?fixture=1576052&bet=1`, Variant A only, max 1 provider request, stop if `paging.total > 1`
- PR #84 implements the protected read-only dry-run path and still does not run the production provider call
- production provider odds calls remain not started until PR #84 is merged/deployed and the runtime dry-run receives separate CPO approval

Reference: `docs/sports-odds-snapshot-sync-m1-3-design.md`
PR #80 planning reference: `docs/sports-odds-endpoint-discovery-m1-3.md`
PR #81 confirmation reference: `docs/api-football-odds-endpoint-confirmation-m1-3.md`
PR #82 evidence reference: `docs/api-football-odds-provider-evidence-m1-3.md`
PR #83 scope reference: `docs/sports-odds-read-only-dry-run-scope-m1-3.md`
PR #84 implementation reference: `docs/sports-odds-read-only-dry-run-implementation-m1-3.md`

---

## 2. Confirmed Production Fixes (merged to main)

| PR | Description |
|---|---|
| #28 | Ambient Theme System — merged, live in production |
| #35 | Coach/Analyst JSON extraction fix — shared `extractJsonObject` |
| #36 | JSON regression tests + preview CI QA checklist |
| #37 | Preview CI reliability hardening |
| #38 | Coach schema tolerance improvements |
| #39 | Scout/Analyst schema tolerance improvements |
| #40 | Raw AI output removed from server logs |
| #41 | Scout per-candidate validation |
| #42 | Configurable AI route rate limits (raised default Coach daily limit to 20/day) |
| #43 | Ambient Theme cleanup — reduced-motion scope fix + restored Analytics PageView |
| #44 | Ambient Theme v2 — event header strip + app-shell depth; merged/live; further Design v2 parked |
| #45 / #46 | Product structure + in-app guidance (Beta readiness) |
| #47 | Quick Settle UI — inline Won/Lost/Void for pending bets |
| #50 / Migration 012 | `settle_bet` fixes applied manually — future settlements update `bet_legs.leg_status`; `lost` outcome returns non-null `new_balance` when bankroll exists; historical `bet_legs` backfill applied, remaining mismatches verified as 0 |
| #52 | CSP `Report-Only` header + `/api/csp-report` violation endpoint — live, collecting violations in Vercel runtime logs |
| #55 | `npm audit` lockfile hygiene — 4 in-range patch updates (`@supabase/supabase-js`, `postcss`, `posthog-js`, `posthog-node`); 2 moderate postcss vulns in Next.js nested deps accepted as non-exploitable; `lucide-react` 1.22.0 verified current, no update needed |
| #58 | Analytics taxonomy — `from` → `from_page` in Quick Settle `bet_settle_clicked` payload; live $1 settle test confirmed `from_page: 'quick_settle'` received in PostHog, old `from` property absent |
| #72 | M1.2.b Fixture Sync Dry-Run - provider fixture sync route, sanitized dry-run reports, operator auth, no write mode |
| #73 | Analysis Quality Gate - blocked false precision for insufficient-data / unsupported mixed-sport Analyst outputs |
| #74 | Analyst Trust UX Patch - localized blocked Analyst surfaces, share/PDF builders, and Ukrainian exact-coupon smoke |
| #75 | Decision Surfaces Trust Patch - localized saved decision list/detail/share/PDF surfaces, including legacy unpriced rows |
| #76 | Live Coupon Parser & Actionability Gate - scanner upload path preserves live coupon legs, sports, phases, and actionability |
| #77 | M1.2.c Fixture Write Safety Guard - one-provider / one-day / 25-fixture write cap before controlled validation |
| #78 | M1.2.c Controlled Fixture Write Validation Record - documentation/status record only; no runtime code |
| #79 | M1.3 Odds Snapshot Sync Design - design-only odds snapshot plan with pre-match, quota, bookmaker, market catalog, and non-use gates |
| #80 | M1.3 Odds Endpoint Discovery & Dry-Run Plan - read-only planner, endpoint/cost gates, sanitized reporting, no odds writes or provider calls |
| #81 | M1.3 API-Football Odds Endpoint & Cost Confirmation - docs/status confirmation block; endpoint/cost not available from Codex runtime |
| #82 | M1.3 API-Football Odds Provider Evidence - docs/status evidence record; no runtime provider calls or writes |
| #83 | M1.3 Read-Only Odds Dry-Run Scope - scope approval only; selects provider fixture `1576052` primary and does not run provider calls |
| #84 | M1.3 Read-Only Odds Dry-Run Implementation - draft PR; protected read-only route/helper only; production provider call not run |

---

## 3. Security / P2 Applied

- Migrations **010** and **011** merged and manually applied to production Supabase
- `anon` EXECUTE revoked on selected RPCs
- RLS `initplan` optimization applied
- FK indexes added
- Leaked-password protection enabled

---

## 4. QA Status

| Area | Status | Notes |
|---|---|---|
| Beta smoke tests | ✅ PASS | CI green on main |
| Coach UK | ✅ PASS | |
| Coach RU | Optional retest | After rate-limit increase; PR #42 raised default to 20/day |
| Analyst RU / UK | ✅ PASS | |
| Scout RU / UK | ✅ PASS | |
| Quick Settle (static) | ✅ PASS | Won/Lost/Void/409 paths verified |
| Quick Settle (live mutation) | ✅ PASS | $1 live settle test completed; `from_page: 'quick_settle'` confirmed in PostHog |
| Vercel runtime logs | ✅ Clean | No 4xx/5xx errors |
| Sentry | ✅ Clean | No unresolved issues |

---

## 5. Do Not Do Now

- Do NOT invite external beta users yet
- Do NOT launch publicly
- Do NOT continue Ambient Theme / Design v2
- Do NOT start Scout v2 (until data provider decision)
- Do NOT start i18n
- Do NOT start legal pages
- Do NOT start broad security hardening
- Do NOT start public site work
- Do NOT start mobile redesign (until mobile/tablet UX is planned)
- Do NOT start native mobile app work
- Do NOT do visual redesign
- Do NOT merge any PR without explicit CPO ACCEPT
- Do NOT open new code PRs unless a blocker appears in current main
- Do NOT start M1.3 odds ingestion, provider odds calls, or migrations until PR #84 is merged/deployed and the one-call runtime dry-run is separately approved

---

## 6. Non-Blocking Backlog

Items parked for after product vision gaps are addressed:

- Optional Coach RU retest (after rate-limit tuning)
- Design v2 / premium event skin (future sprint — Phase 11)
- CSP `eu-assets.i.posthog.com` script-src gap (add before CSP is enforced)

- Beta v2 sports intelligence direction — see `SPORTS_INTELLIGENCE_ARCHITECTURE.md` (planning only, not started)

---

## 7. Passive Monitoring

Daily health-check (read-only, no PR unless blocker):
- Vercel: latest production deployment READY
- Vercel runtime logs: errors/fatals clean
- CSP violation logs: note recurring blocked sources
- Sentry: no new unresolved issues
- PostHog: core events flowing

---

## 8. Process Rules

- **Claude Code** opens PRs only — no direct pushes to main (except CI hotfixes)
- **Cowork** can review from Cowork side
- **CPO** reviews and explicitly accepts
- **Dima** merges only after explicit CPO ACCEPT
- One task = one PR — no unrelated changes bundled
- Manual Supabase migrations applied only after CPO accept + PR merged

---

## 9. Product Identity

| Field | Value |
|---|---|
| Current name | BetTracker AI |
| Future name | LineHunter AI (planned rebrand — not started) |
| Repo | xadddd88/bettracker-v1 |
