# BetTracker — Product Bible
> Level 2 Document. Updated every few weeks. Describes what the product is and how it works.

---

## Product Overview

BetTracker is a web application (Next.js, mobile-first) that combines:
1. **Bet Tracker** — structured logging of all bets
2. **Analytics Engine** — ROI, Yield, EV, CLV, bankroll, patterns
3. **AI Agents** — 6 specialized assistants for specific tasks
4. **Bankroll Manager** — disciplined capital management

---

## Core User Journey

```
User opens app
  → Logs a bet (quick, <30 sec)
  → Before betting: runs Analyst agent to evaluate the bet
  → After result: bet auto-updates P&L
  → Weekly: reviews Coach agent summary of patterns
  → Monthly: reads Analytics report
```

---

## Screens & Routing

| Route | Screen | Purpose |
|-------|--------|---------|
| `/` | Dashboard | Overview: balance, today's bets, quick stats, AI summary |
| `/bets` | Bet List | All bets, filters, search, add new bet |
| `/bets/new` | Add Bet | Quick bet entry form |
| `/bets/[id]` | Bet Detail | Single bet + AI analysis result |
| `/analytics` | Analytics | ROI, Yield, EV charts, patterns, reports |
| `/bankroll` | Bankroll | Balance history, deposit/withdraw, Kelly calculator |
| `/ai` | AI Hub | All 6 agents accessible |
| `/settings` | Settings | Profile, API key, preferences |

---

## AI Agents

### Agent 1: Analyst
**Task:** Evaluate a specific bet before placing it.  
**Input:** Match, market, odds, context  
**Output:** Probability estimate, 10 factors, market-specific analysis, verdict, Kelly %  
**Web search:** Yes (when enabled)  
**Status:** Exists in prototype, needs refactoring into agent architecture

### Agent 2: Coach
**Task:** Analyze the user's betting patterns and behavior.  
**Input:** User's bet history (last 30/90 days)  
**Output:** Pattern report — where user loses, where they win, psychological tendencies, recommendations  
**Web search:** No  
**Status:** Not built

### Agent 3: Scout
**Task:** Find interesting upcoming matches based on user preferences.  
**Input:** User's sports preferences, bet types, typical odds range  
**Output:** 3–5 suggested matches with brief rationale  
**Web search:** Yes  
**Status:** Not built

### Agent 4: Scanner
**Task:** Read a bookmaker coupon screenshot and extract bet data.  
**Input:** Photo/screenshot of coupon  
**Output:** Structured JSON → auto-fills bet form  
**Model:** claude-sonnet-4-6 (upgraded from haiku for OCR accuracy)  
**Status:** Exists in prototype, works

### Agent 5: Risk Manager
**Task:** Evaluate risk of a pending bet in context of current bankroll and open bets.  
**Input:** Proposed bet + bankroll state + open bets  
**Output:** Risk score, correlation warning, recommended stake  
**Web search:** No  
**Status:** Not built

### Agent 6: Portfolio
**Task:** Bankroll management and stake optimization.  
**Input:** Full bet history + current bankroll  
**Output:** Kelly recommendations, diversification advice, exposure analysis  
**Web search:** No  
**Status:** Partial (Kelly calculator exists in prototype)

---

## UX Rules

1. Any frequent action must be completable in ≤3 taps/clicks
2. Mobile-first: all core flows must work perfectly on phone
3. No feature ships if it makes the UI more complex without clear user value
4. Loading states on every async action
5. Errors must be human-readable (not "HTTP 500")
6. Dark mode by default (user preference toggleable)

---

## Feature Specifications

### Bet Entry
Fields: Event name, Market, Odds, Stake, Sport, Bookmaker, Date, Notes (optional), Is Live  
Quick add: scan photo → auto-fill  
Result update: Win / Loss / Void / Partial — updates P&L automatically

### Analytics (Sprint 3)
- ROI = (Total Profit / Total Staked) × 100
- Yield = ROI per bet average
- EV = (Probability × Odds - 1) per bet
- CLV = (Closing odds / Bet odds - 1) — requires closing odds input
- Filters: by sport, bookmaker, market type, date range, bet type
- Charts: bankroll curve, ROI over time, win rate by category

### Bankroll Manager
- Starting balance + deposit/withdrawal log
- Current balance auto-calculated from bets
- Kelly calculator: f = (bp - q) / b
- Recommended stake per bet based on Kelly %

---

## Roadmap

| Sprint | Goal | Status |
|--------|------|--------|
| Sprint 0 | Product audit + documentation | ✅ In Progress |
| Sprint 1 | New architecture (Next.js) + core tracker | ⬜ Planned |
| Sprint 2 | Best-in-class bet tracker UX | ⬜ Planned |
| Sprint 3 | Professional analytics (ROI, Yield, EV, CLV) | ⬜ Planned |
| Sprint 4 | AI agents architecture | ⬜ Planned |
| Sprint 5 | Closed beta | ⬜ Planned |
| Sprint 6 | Public launch | ⬜ Planned |

---

## Release Plan

**Sprint 1 Definition of Success:**  
Team is confident that the next 12 months can add new features without rewriting the foundation.

**Sprint 2 Definition of Success:**  
A bettor who currently tracks bets in Excel switches to BetTracker and doesn't miss anything.

**Beta Definition of Success:**  
10 real users use the product for 30+ days without being asked to.

---

*Last updated: 2026-06-26*  
*Owner: CPO*
