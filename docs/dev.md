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

## Current Sprint: Sprint 0 — Product Audit

**Goal:** Full audit of current prototype. Create documentation foundation.  
**Definition of Success:** Team has complete picture of what exists, what works, what to carry forward, and what to discard.

### Tasks

- [x] Create /docs structure (strategy.md, product.md, dev.md, decisions.md)
- [ ] Technical audit of bettracker.html — inventory all features
- [ ] Database audit — document current Supabase schema
- [ ] UX audit — document all screens and user flows
- [ ] Feature matrix — what to migrate vs discard vs rebuild
- [ ] Sprint 1 kickoff — set up Next.js project

---

## Tech Stack (Approved)

| Layer | Technology | Decision |
|-------|------------|----------|
| Framework | Next.js 14+ (App Router) | Approved 2026-06-26 |
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

## Project Structure (Planned)

```
bettracker/
├── app/
│   ├── (auth)/
│   │   └── login/
│   ├── (app)/
│   │   ├── dashboard/
│   │   ├── bets/
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
│   ├── ui/           (base components)
│   ├── bets/         (bet-specific)
│   ├── analytics/    (charts, stats)
│   └── ai/           (agent UIs)
├── lib/
│   ├── supabase/     (client, server, types)
│   ├── ai/           (agent logic)
│   └── utils/        (formatting, calculations)
├── types/
│   └── index.ts      (all shared types)
├── hooks/
└── docs/             (this folder)
```

---

## Database Schema (Planned — New Supabase Project)

```sql
-- Users are managed by Supabase Auth

-- Bets
CREATE TABLE bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  created_at timestamptz DEFAULT now(),
  event text NOT NULL,
  market text NOT NULL,
  odds numeric NOT NULL,
  stake numeric NOT NULL,
  sport text DEFAULT 'football',
  bookmaker text,
  bet_type text DEFAULT 'single', -- single | express
  is_live boolean DEFAULT false,
  status text DEFAULT 'pending', -- pending | won | lost | void | partial
  profit numeric,
  notes text,
  ai_analysis jsonb,
  metadata jsonb
);

-- Bankroll transactions
CREATE TABLE bankroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  created_at timestamptz DEFAULT now(),
  type text NOT NULL, -- deposit | withdrawal | bet_result
  amount numeric NOT NULL,
  balance_after numeric NOT NULL,
  reference_bet_id uuid REFERENCES bets(id)
);

-- User settings
CREATE TABLE user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users,
  currency text DEFAULT 'USD',
  default_stake numeric DEFAULT 10,
  kelly_fraction numeric DEFAULT 0.5,
  web_search_enabled boolean DEFAULT true,
  metadata jsonb
);

-- Global config (admin only)
CREATE TABLE global_config (
  key text PRIMARY KEY,
  value text
);
```

---

## Technical Debt (from Prototype)

| Item | Severity | Notes |
|------|----------|-------|
| Single 4900-line HTML file | Critical | Entire reason for Controlled Rebuild |
| State in localStorage | High | Not synced, unreliable on mobile |
| No TypeScript | High | No type safety |
| One giant AI prompt | Medium | Needs refactoring into agent architecture |
| No routing | High | Everything on one page |
| No tests | Medium | Sprint 2+ |
| RLS not properly configured | High | global_config bypassed via service_role workaround |

---

## Bugs (Known — Prototype)

| Bug | Status | Notes |
|-----|--------|-------|
| Haiku misreads team names (OCR) | Fixed | Switched to claude-sonnet-4-6 for Scanner |
| Handicap shown as П1 instead of Ф1 | Fixed | Updated scan prompt rules |
| API key not syncing across devices | Fixed | getApiKey() chain: localStorage → user_metadata → global_config |
| Analysis shows only 1 factor | Fixed | Rewrote prompt with mandatory 10-factor template |
| HEIC images fail on mobile | Fixed | compressImage() canvas resize |
| Logout button silent fail | Fixed | Explicit showAuth() call |
| Password recovery auto-logs in | Fixed | _isRecovery URL hash check |

---

## Decisions Log
See `decisions.md`

---

## Changelog

### 2026-06-26
- Created /docs structure (Sprint 0 kickoff)
- Upgraded Scanner from claude-haiku to claude-sonnet-4-6
- Added team1_form, team2_form, group_context to AI analysis output
- Added group standings search query to web-search prompt

---

*Last updated: 2026-06-26*  
*Owner: Lead Engineer*
