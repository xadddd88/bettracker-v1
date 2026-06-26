# BetTracker — Development Log
> Level 3 Document. Changes daily. Engineering reference only.

---

## Definition of Ready
A task is ready to develop when:
- [ ] Product logic is approved by CPO
- [ ] UX is defined (wireframe or description)
- [ ] Technical approach is agreed with Lead Engineer
- [ ] Acceptance criteria are written

## Definition of Done
A task is done when:
- [ ] Code is written and works
- [ ] No TypeScript errors
- [ ] Tested on desktop + mobile
- [ ] No regressions in existing functionality
- [ ] Relevant documentation updated

---

## ✅ Sprint 0 — Product Audit (COMPLETED 2026-06-26)

**Goal:** Full audit of current prototype. Create documentation foundation.  
**Definition of Success:** Team has complete picture of what exists, what works, what to carry forward, and what to discard.

### Tasks
- [x] Create /docs structure (strategy.md, product.md, dev.md, decisions.md)
- [x] Scaffold Next.js 15 + TypeScript project
- [x] Push to GitHub (xadddd88/bettracker-v1)
- [x] Decision-first architecture defined (ADR-005)
- [x] Write full SQL migration (001_initial_schema.sql)
- [ ] Run migration in Supabase SQL Editor ← **CEO pending**
- [ ] Register account + smoke test login/dashboard

---

## 🔄 Sprint 1 — Foundation Stabilization

**Goal:** Close all architecture blockers identified in CPO review (commit dae1013).  
No new product features until foundation is solid.

**Definition of Success:** `npm run build` passes, migration runs clean, quick bet is atomic, one test account with one bet works end-to-end.

### Definition of Done — Sprint 1
1. `package-lock.json` committed (reproducible installs)
2. `dev.md` reflects Decision-first architecture (this file)
3. Quick bet creation atomic via `create_quick_bet()` RPC ✅
4. Bankroll balance consistent: `balance_after` mandatory, updated inside RPC ✅
5. `bet_legs` / `legs` data shape mismatch fixed (Supabase aliasing `legs:bet_legs(*)`) ✅
6. DB CHECK constraints protect all enum-like fields ✅
7. `pgcrypto` extension added to migration ✅
8. RLS or RPC prevents cross-user references ✅
9. Migration runs successfully on clean Supabase project
10. `npm run build` passes with no TypeScript errors
11. Parlay hidden (Sprint 1 = single only) ✅
12. Zod validation on quick bet form ✅
13. Mobile nav plan documented

### Tasks
- [x] Fix .gitignore — remove package-lock.json exclusion
- [x] CEO: run `npm install` → commit package-lock.json
- [x] Rewrite migration 001 with constraints, pgcrypto, atomic RPC
- [x] Fix `legs:bet_legs(*)` aliasing in Dashboard + Bets pages
- [x] Rewrite new bet page: Zod, RPC, hide parlay, fix stake bug
- [x] Update dev.md (this file)
- [x] Add mobile bottom nav (MobileNav component)
- [x] Fix create_quick_bet: use auth.uid(), SET search_path, no p_user_id
- [x] Add cross-user validation triggers (bet_bankroll, txn_references, bet_leg_decision)
- [x] Fix bankroll null handling in RPC — auto-create or resolve default
- [x] Harden scanner: media_type whitelist, size limit, Zod output validation
- [x] TypeScript: BankrollTransaction.balance_after made required
- [x] CEO: re-run migration 001 v1.2 in Supabase SQL Editor
- [x] Smoke test: register → dashboard → add bet → scanner → verify balance ✅ 2026-06-26

---

## Tech Stack (Approved)

| Layer | Technology | Decision |
|-------|------------|----------|
| Framework | Next.js 15 (App Router) | Approved 2026-06-26 |
| Language | TypeScript | Approved 2026-06-26 |
| Styling | Tailwind CSS | Approved 2026-06-26 |
| UI Components | Tailwind only (Sprint 1), shadcn/ui TBD (Sprint 2+) | Approved 2026-06-26 |
| State | Zustand + TanStack Query | Approved 2026-06-26 |
| Validation | Zod | Approved 2026-06-26 |
| Auth | Supabase Auth | Approved 2026-06-26 |
| Database | Supabase (NEW project) | Approved 2026-06-26 |
| Charts | Recharts | Approved 2026-06-26 |
| AI | Claude API (claude-sonnet-4-6) | Existing |
| Deployment | Vercel | Existing |
| Domain | btdk.app | Existing |

---

## Project Structure

```
bettracker/
├── app/
│   ├── (auth)/
│   │   └── login/
│   ├── (app)/
│   │   ├── layout.tsx         (Sidebar + MobileNav)
│   │   ├── dashboard/
│   │   ├── bets/
│   │   │   ├── page.tsx
│   │   │   └── new/page.tsx
│   │   ├── analytics/
│   │   ├── bankroll/
│   │   ├── ai/
│   │   └── settings/
│   ├── api/
│   │   ├── ai/
│   │   │   ├── analyst/
│   │   │   ├── scanner/
│   │   │   └── coach/
│   │   └── bets/
│   └── layout.tsx
├── components/
│   ├── ui/
│   │   ├── Sidebar.tsx        (desktop)
│   │   └── MobileNav.tsx      (mobile bottom bar)
│   ├── bets/
│   ├── analytics/
│   └── ai/
├── lib/
│   ├── supabase/
│   ├── ai/
│   └── utils/
├── types/
│   └── index.ts
├── hooks/
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql
```

---

## Database Schema (Decision-first — ADR-005)

Migration file: `supabase/migrations/001_initial_schema.sql`

```
profiles
  ├── id (→ auth.users)
  ├── currency, default_stake, kelly_fraction, web_search_enabled

bankrolls
  ├── user_id, name, balance (authoritative — updated by RPC)
  └── is_default

decisions                         ← PRIMARY OBJECT
  ├── user_id
  ├── event_name, sport, league, market_type, selection
  ├── offered_odds, bookmaker
  ├── model_probability, implied_probability, edge_percent
  ├── confidence_score, risk_level, recommendation
  ├── final_action (pending/placed/skipped/watchlisted/ignored)
  ├── source (ai_analyst/scanner/scout/quick_entry/manual/import)
  └── reasoning, factors (jsonb)

ai_analysis_runs
  ├── decision_id (→ decisions, nullable)
  ├── agent_type (analyst/scout/scanner/risk_manager/coach/portfolio)
  └── input_snapshot, output_json, confidence_score

bets                              ← FINANCIAL EXECUTION
  ├── user_id, bankroll_id
  ├── bet_type (single only in Sprint 1)
  ├── stake, total_odds, potential_payout
  └── status (pending/won/lost/void/push/cashed_out/partial)

bet_legs                          ← INDIVIDUAL EVENT WITHIN A BET
  ├── bet_id (→ bets, CASCADE)
  ├── decision_id (→ decisions, NULLABLE)
  └── odds, leg_status

bankroll_transactions
  ├── bankroll_id, bet_id
  ├── type (deposit/withdrawal/stake/payout/adjustment/bonus)
  ├── amount, balance_after (NOT NULL — always snapshot balance)
```

### Key architectural rules
- `decision_id` on `bet_legs` is nullable — allows quick_entry and imports
- Always create a Decision, even for quick_entry (`source = 'quick_entry'`)
- `bankrolls.balance` is authoritative (Option B). Updated only via `create_quick_bet()` RPC or equivalent DB functions — never from frontend
- `bankroll_transactions.balance_after` is NOT NULL — every transaction records running balance
- Parlay/system supported by schema; single only in Sprint 1 UI

---

## Mobile Navigation

**Sprint 1:** Add `MobileNav` component — bottom bar with 5 primary links. Hide desktop Sidebar on `md:` breakpoint and below. No hamburger menu needed for Sprint 1.

**Sprint 2+:** Evaluate drawer/sheet component when shadcn/ui is adopted.

---

## Technical Debt

| Item | Severity | Sprint | Notes |
|------|----------|--------|-------|
| Single 4900-line HTML file (legacy) | Critical | 0 → done | Controlled Rebuild in progress |
| State in localStorage (legacy) | High | 0 → done | Supabase replaces |
| No TypeScript (legacy) | High | 0 → done | Full TS from day 1 |
| One giant AI prompt (legacy) | Medium | Sprint 2 | Needs agent architecture |
| No routing (legacy) | High | 0 → done | Next.js App Router |
| RLS not properly configured (legacy) | High | 1 | Fixed via CHECK constraints + RPC |
| Currency hardcoded to `$` in UI | Low | Sprint 2 | Should use `bankroll.currency` from profile |
| Handwritten TypeScript DB types | Medium | Sprint 2 | Generate from Supabase schema: `supabase gen types typescript` |
| No normalized sports/bookmakers tables | Medium | Sprint 2 | Currently free-text. Blocks Match Intelligence. |
| No tests | Medium | Sprint 3 | Vitest + Playwright |
| No error boundary components | Low | Sprint 2 | Next.js error.tsx pages |

---

## Bugs (Known — Prototype in `legacy/`)

| Bug | Status | Notes |
|-----|--------|-------|
| Haiku misreads team names (OCR) | Fixed | Switched to claude-sonnet-4-6 for Scanner |
| Handicap shown as П1 instead of Ф1 | Fixed | Updated scan prompt rules |
| API key not syncing across devices | Fixed | getApiKey() chain |
| Analysis shows only 1 factor | Fixed | Rewrote prompt with mandatory 10-factor template |
| HEIC images fail on mobile | Fixed | compressImage() canvas resize |
| Logout button silent fail | Fixed | Explicit showAuth() call |
| Password recovery auto-logs in | Fixed | _isRecovery URL hash check |

---

## Changelog

### 2026-06-26 — Sprint 1 closed ✅

- Smoke test passed end-to-end: login → scanner → save bet → bets list
- Fixed "No default bankroll found" by restoring missing profile/bankroll via SQL for existing auth user
- Error messages now surface real DB error instead of generic "Something went wrong"

### 2026-06-26 — Sprint 1 security hardening (commit after d14d620)

- `001_initial_schema.sql` v1.2: `create_quick_bet` uses `auth.uid()` — `p_user_id` removed; `SET search_path = public` on all SECURITY DEFINER functions; cross-user validation triggers added; bankroll null auto-resolve
- `app/api/ai/scanner`: media_type whitelist, 7.5 MB size guard, Zod output schema validation
- `types/index.ts`: `BankrollTransaction.balance_after` made required
- `bets/new/page.tsx`: removed `p_user_id` from RPC call
- `docs/dev.md`: Sprint 1 tasks synced

### 2026-06-26 — Sprint 1 foundation stabilization

- `.gitignore`: removed `package-lock.json` exclusion
- `001_initial_schema.sql` v1.1: added pgcrypto extension, CHECK constraints on all enum fields, `create_quick_bet()` atomic RPC, mandatory `balance_after` on transactions
- Dashboard + Bets pages: fixed `legs:bet_legs(*)` aliasing (Supabase nested select)
- `bets/new/page.tsx`: removed wrong `stake = parseFloat(form.odds)` variable, added Zod validation, switched to `create_quick_bet()` RPC, hid parlay toggle (Sprint 2)

### 2026-06-26 — Sprint 0 kickoff
- Created /docs structure (strategy.md, product.md, dev.md, decisions.md)
- Upgraded Scanner from claude-haiku to claude-sonnet-4-6
- Added team1_form, team2_form, group_context to AI analysis output
- Added group standings search query to web-search prompt

---

*Last updated: 2026-06-26*  
*Owner: Lead Engineer*
