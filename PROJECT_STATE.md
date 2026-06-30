# BetTracker AI — Project State

> **Source of truth for current beta status.**
> Last updated: 2026-06-30

---

## 1. Current Status

| Field | Value |
|---|---|
| **Status** | Beta READY |
| **Production URL** | https://btdk.app |
| **Repo** | xadddd88/bettracker-v1 |
| **Branch model** | Feature branches → PR → CPO accept → Dima merges |
| **Current UI** | Stable dark UI + Ambient Theme live as-is |
| **Ambient Theme** | Current version live in production — further Design v2 / premium event skin work is parked |
| **Active blockers** | None |

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
| Quick Settle (live mutation) | Optional | Not required for Beta readiness |
| Vercel runtime logs | ✅ Clean | No 4xx/5xx errors |
| Sentry | ✅ Clean | No unresolved issues |

---

## 5. Do Not Do Now

- Do NOT continue Ambient Theme / Design v2
- Do NOT start Scout v2
- Do NOT start i18n
- Do NOT start legal pages
- Do NOT start broad security hardening
- Do NOT do visual redesign
- Do NOT merge any PR without explicit CPO ACCEPT

---

## 6. Non-Blocking Backlog

Items parked for after beta — no timeline set:

- Optional Coach RU retest (after rate-limit tuning)
- Optional controlled $1 Quick Settle live mutation test
- Design v2 / premium event skin (future sprint)

---

## 7. Process Rules

- **Claude Code** opens PRs only — no direct pushes to main (except CI hotfixes)
- **Cowork** can review from Cowork side
- **CPO** reviews and explicitly accepts
- **Dima** merges only after explicit CPO ACCEPT
- One task = one PR — no unrelated changes bundled
- Manual Supabase migrations applied only after CPO accept + PR merged

---

## 8. Product Identity

| Field | Value |
|---|---|
| Current name | BetTracker AI |
| Future name | LineHunter AI (planned rebrand — not started) |
| Repo | xadddd88/bettracker-v1 |
