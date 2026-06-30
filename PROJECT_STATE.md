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
| **Branch model** | feature branches → PR → CPO accept → Dima merges |
| **Current UI** | Stable dark UI — confirmed production |
| **Ambient Theme / Design v2** | Parked (PR #28 — do not merge) |
| **Active blockers** | None |

---

## 2. Confirmed Production Fixes (merged to main)

| PR | Description |
|---|---|
| #35 | Coach/Analyst JSON extraction fix — shared `extractJsonObject` |
| #36 | JSON regression tests + preview CI QA checklist |
| #37 | Preview CI reliability hardening |
| #38 | Coach schema tolerance improvements |
| #39 | Scout/Analyst schema tolerance improvements |
| #40 | Raw AI output removed from server logs |
| #41 | Scout per-candidate validation |
| #42 | Configurable AI route rate limits |
| #45 / #46 | Product structure + in-app guidance (Beta readiness) |
| #47 | Quick Settle UI — inline Won/Lost/Void for pending bets |

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
| Coach RU | Post-ready retest optional | Only if desired after rate-limit increase |
| Analyst RU / UK | ✅ PASS | |
| Scout RU / UK | ✅ PASS | |
| Quick Settle | ✅ PASS | Static QA + live mutation testing (Won/Lost/Void/409) complete |
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

- `012_settle_bet_fixes.sql` — PR + manual Supabase apply
- CSP Report-Only header PR
- `npm audit` / `package-lock` hygiene PR
- `lucide-react` version check
- Analytics taxonomy cleanup: `from: 'quick_settle'` → `from_page` field standardisation
- Optional Coach RU retest (after rate-limit tuning)
- Optional controlled $1 Quick Settle live-mutation test
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
