# BetTracker AI — Product Bible
> Level 2 Document. Updated every few sprints. Describes what the product is, how it works, and where it's going.  
> Future brand direction: **LineHunter AI**

---

## Product Overview

BetTracker AI is a web application (Next.js, mobile-first) that combines:

1. **Decision System** — structured recording and evaluation of betting decisions before and after they happen
2. **AI Agents** — specialized assistants for analysis, scouting, coaching, and scanning
3. **Analytics Engine** — ROI, Yield, EV, edge, patterns — grounded in the user's actual decision history
4. **Bankroll Manager** — disciplined capital management

**Core thesis:** We are not building a bet diary. We are building an AI platform that helps users find vulnerable betting lines and make stronger decisions.

**Future brand:** LineHunter AI  
**Future slogan:** Hunt the edge. Beat the line.  
**RU:** Ищи слабые линии. Принимай сильные решения.  
**UA:** Шукай слабкі лінії. Приймай сильні рішення.

---

## Core Sports

| Sport | Sprint | Status |
|-------|--------|--------|
| `soccer` | Sprint 2 | Planned |
| `tennis` | Sprint 2 | Planned |
| `cs2` | Sprint 2 | Planned |
| `basketball` | Future | — |
| `ice_hockey` | Future | — |
| `mma` | Future | — |
| `dota2` | Future | — |
| `lol` | Future | — |
| `baseball` | Future | — |
| `american_football` | Future | — |

Product supports all sports for basic bet tracking (Free). AI intelligence layers are unlocked by sport.

---

## Supported Locales

Initial: `uk`, `ru`, `en`, `es`, `fr`, `de`, `ar`

Arabic requires RTL support (planned, not implemented in Sprint 2).

All canonical data stored as codes, not localized labels:
- `sport_code = "soccer"` not `sport = "Футбол"`
- `recommendation = "bet"` not `recommendation = "Ставить"`
- `market_type = "match_winner"` not `market = "Победа"`

---

## Core Decision Loop

```
User identifies a match / market
↓
AI Analyst evaluates the opportunity
  → model_probability
  → implied_probability
  → edge_percent
  → confidence_score
  → risk_level
  → recommendation
  → reasoning
  → factors (6–10)
↓
Decision saved (final_action: pending)
↓
User: Place Bet / Skip / Watch
↓
If Placed → Bet created, linked to Decision via bet_legs.decision_id
↓
Result entered (Sprint 3)
↓
Analytics: Decision quality vs actual result
↓
Coach: patterns in user decision-making (Sprint 6)
```

---

## Screens & Routing

| Route | Screen | Purpose |
|-------|--------|---------|
| `/` | Home | Redirect → `/dashboard` |
| `/dashboard` | Dashboard | Balance, recent bets, quick stats |
| `/bets` | Bet List | All bets, filters, add new |
| `/bets/new` | Add Bet | Quick bet form (manual entry + scanner) |
| `/bets/[id]` | Bet Detail | Single bet + linked decision |
| `/decisions/[id]` | Decision Detail | AI analysis, action buttons |
| `/analytics` | Analytics | Decision metrics, financial metrics |
| `/bankroll` | Bankroll | Balance history, deposits, withdrawals |
| `/ai` | AI Analyst | Analyze a market, get AI Decision |
| `/settings` | Settings | Profile, locale, preferences |

---

## AI Agents

### Agent 1: Analyst (Sprint 2)
**Task:** Evaluate a specific market before placing a bet.  
**Input:** sport, event, market, selection, odds, optional notes  
**Output:** Structured Decision — probability, edge, confidence, risk, recommendation, reasoning, factors  
**Sport modules:** tennis, soccer, cs2 (Sprint 2); more in future sprints  
**Web search:** Yes (when enabled in profile)  
**Language:** User-selected output language; structured JSON remains canonical  
**Guardrails:** Never guarantees outcomes. Never encourages chasing. Skip is a valid outcome.  
**Status:** Sprint 2 — planned

### Agent 2: Coach (Sprint 6)
**Task:** Analyze user's betting patterns and decision quality over time.  
**Input:** User's decision + bet history  
**Output:** Pattern report — where user makes strong decisions, where they over/underestimate, behavioral patterns  
**Web search:** No  
**Status:** Not built

### Agent 3: Scout (Sprint 5)
**Task:** Find markets worth deeper research before the user identifies a specific match.  
**Input:** User's sport preferences, market preferences, optional upcoming events  
**Output:** Research candidates (market_opportunities) with brief rationale  
**Distinction:** Scout finds opportunities; Analyst evaluates a specific decision  
**Guardrail:** Must not become a chase-loss engine  
**Web search:** Yes  
**Status:** Not built

### Agent 4: Scanner (Sprint 1 — exists)
**Task:** Read a bookmaker coupon screenshot and extract bet data.  
**Input:** Photo/screenshot of coupon  
**Output:** Structured JSON → auto-fills bet form  
**Languages:** Supports multilingual coupons  
**Model:** Configured via `ANTHROPIC_MODEL_ANALYST` env  
**Status:** Working (Sprint 1)

### Agent 5: Risk Manager (Future)
**Task:** Evaluate risk of a pending bet in context of bankroll and open bets.  
**Input:** Proposed bet + bankroll state + open positions  
**Output:** Risk score, correlation warning, recommended stake  
**Status:** Not built

### Agent 6: Portfolio (Future)
**Task:** Bankroll management and stake optimization.  
**Input:** Full decision + bet history + current bankroll  
**Output:** Kelly recommendations, diversification, exposure analysis  
**Status:** Partial (Kelly calculator logic exists in prototype)

---

## Product Language Rules

**Use:**
Decision, Edge, Line, Scout, Opportunity, Weak Line, Value, Risk, Confidence, Research Candidate, Watchlist, Skip

**Avoid in all product-facing text:**
guaranteed, sure bet, lock, free money, 100%, revenge bet, chase, must bet, all-in, recover your loss

**Important:** Skip is a valid product outcome. No bet can be the best decision.

---

## UX Rules

1. Any frequent action completable in ≤3 taps/clicks
2. Mobile-first — all core flows work perfectly on phone
3. No feature ships if it makes UI more complex without clear user value
4. Loading states on every async action
5. Errors are human-readable (never "HTTP 500")
6. Dark mode by default

---

## Roadmap

| Sprint | Goal | Status |
|--------|------|--------|
| Sprint 0 | Product audit + documentation | ✅ Complete |
| Sprint 1 | Foundation: Next.js, schema, auth, scanner, quick bet | ✅ Complete |
| Sprint 2 | Decision Intelligence MVP: AI Analyst → Decision → Place/Skip/Watch | 🔄 In Progress |
| Sprint 3 | Result & Learning Layer: settle bets, P&L, bankroll updates | ⬜ Planned |
| Sprint 4 | Analytics v1: decision quality metrics, ROI, performance by sport/market | ⬜ Planned |
| Sprint 5 | Market Scout MVP: find research candidates before a Decision exists | ⬜ Planned |
| Sprint 6 | Coach MVP: AI pattern analysis of user decision behavior | ⬜ Planned |
| Sprint 7 | Scanner 2.0 / Import Layer / Automated Scout | ⬜ Planned |
| Sprint 8 | Closed Beta: 20–50 serious users | ⬜ Planned |

### Sprint 3 — Result & Learning Layer
- User can settle bets: won / lost / void / push / partial / cashed out
- P&L calculated on settlement
- Bankroll updated via RPC on settlement
- Decision quality reviewable: "AI recommended X, I did Y, result was Z"

### Sprint 4 — Analytics v1
Full decision-quality analytics:
- total decisions, placed/skipped/watchlisted breakdown
- decision → bet conversion rate
- win rate, ROI, yield, P&L
- avg odds, avg edge, avg confidence
- performance by sport, market, bookmaker, AI recommendation, risk level

### Sprint 5 — Market Scout MVP
- User enters upcoming events or uploads a list/screenshot
- Scout identifies research candidates
- Candidates stored as `market_opportunities`
- User converts Opportunity → Decision → optional Bet

### Sprint 6 — Coach MVP
AI Coach detects patterns in user behavior:
- user often bets when AI says Watch
- high-risk bets have negative ROI
- performance varies by sport
- post-loss tilt patterns

### Sprint 7 — Scanner 2.0 / Import Layer
- Scanner connected to multi-leg bet normalization
- Import from external sources
- Automated Scout from upcoming fixtures

### Sprint 8 — Closed Beta
Target: 20–50 serious users  
Target profiles: Excel bet trackers, Betstamp/Pikkit/Outlier users, tennis/soccer/CS2 value bettors

**Primary beta question:** Do users open BetTracker AI before placing a bet?

---

## North Star Metric

**Pre-Bet Decision Rate**

Definition: % of bets that had an AI Decision created before the bet was placed.

Why: If users open BetTracker AI before betting, the product is part of their decision process — not just a diary.

**Secondary metrics:**
- Decisions per active user per week
- Decision → Bet conversion rate
- Skip rate after AI warning
- Return rate within 7 days
- % users with 10+ decisions
- % users with settled bets
- AI analysis cost per active user
- Average bankroll risk per bet
- Usage by sport
- Usage by locale

---

## Monetization Direction (Architecture Only — Not Sprint 2)

Free: basic bet tracking, all sports, scanner (limited)  
Paid: AI intelligence layers per sport

**Initial monetized sport codes:** `soccer`, `tennis`, `cs2`  
**Locales are never monetized** — accessibility is not a paid feature.

Future tables: `plans`, `subscriptions`, `user_entitlements`, `usage_limits`, `usage_events`

AI endpoints must be designed so entitlement checks can be added later. No hardcoded "all users have all AI features forever" assumptions.

---

*Last updated: 2026-06-26*  
*Owner: CPO*
