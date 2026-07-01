# BetTracker AI — Project State

> **Source of truth for current beta status.**
> Last updated: 2026-07-01

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
| **Current phase** | Product Vision Gap / Beta v2 planning |
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
| **Status** | Decision recorded — see `DATA_PROVIDER_DECISION.md`. Phase 1 technical plan exists in `PHASE_1_TECHNICAL_PLAN.md` (merged PR #63). No provider client, DB migration, or Scout v2 implementation started. Product Vision Beta remains NOT READY; external launch remains PAUSED. |

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
