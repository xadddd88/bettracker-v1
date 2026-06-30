# BetTracker AI — Product Vision Gap

> **CPO/Founder decision: 2026-06-30**
> Engineering Shell is READY. Product Vision Beta is NOT READY.
> External beta launch is PAUSED until product matches founder vision.
> This document is the gap analysis and roadmap toward Product Vision Beta.

---

## 1. Founder Vision

What the product must become before an external beta launch:

- Deep AI sports intelligence product — football and tennis first
- Calendar-driven Scout (real fixtures, not LLM-fabricated matches)
- Auto-tracked and auto-settled bets (from real results)
- Public multilingual site (browseable without login; advanced tools require auth)
- Premium dynamic sports design
- First-class mobile/tablet experience
- Future native mobile app readiness

---

## 2. What Is Currently Built

The current production shell at https://btdk.app includes:

- Stable authenticated app shell (Next.js 15, Supabase SSR, dark UI)
- Scout v1 (LLM-generated candidates — not fixture-driven)
- AI Analyst v1 (generic analysis — not sport-specific deep models)
- Coach (pattern analysis of user decisions)
- Bets / bankroll / manual settle / Quick Settle
- Analytics (decision metrics, ROI, P&L)
- Security hardening (migrations 010–012, RLS, FK indexes, leaked-password protection)
- CSP Report-Only header + violation logging
- Monitoring / daily health-check (Vercel, Sentry, PostHog)
- Product structure guidance + in-app onboarding
- Ambient Theme live as-is — Design v2 / premium event skin is parked

**This is an engineering-stable shell, not the final product vision.**

---

## 3. Product Gaps

### Deep Analysis Gap

Football and tennis analysis must become sport-specific and much deeper.

**Football** should eventually include:
- Form (recent results, home/away form)
- Fixtures/calendar context
- Standings and league position
- Injuries/suspensions (where available)
- Head-to-head record
- Home/away splits
- Team stats (goals, xG, defensive record)
- Odds movement and market signals
- Market context (sharp/public money)
- Motivation and tournament context (relegation battle, cup final, dead rubber)

**Tennis** should eventually include:
- Surface (hard/clay/grass — surface win rate)
- Ranking and current form
- Head-to-head on surface and overall
- Tournament stage and draw context
- Fatigue and rest days
- Withdrawals/injuries (where available)
- Set-level result history
- Player stats (aces, break points, serve %)
- Odds movement

---

### Scout Fixture/Calendar Gap

Current Scout v1 is not acceptable as final product behavior.
The AI fabricates or returns unverifiable matches.

Future Scout must be fixture/calendar-first:
- Retrieve real upcoming fixtures from a data provider
- Filter by sport, league, date, and importance
- Attach odds and markets where available
- Rank candidates by value/opportunity signals
- Use AI only after real data retrieval — to explain and rank, not to fabricate
- Never return unrelated or invented matches

---

### Auto-Settlement Gap

Bets should auto-settle from real match results. Manual-only settlement is not the product vision.

Needs:
- Fixture IDs shared across Scout → Analyst → Bet → Settlement
- Result source integration (from same provider as fixture data)
- Settlement engine (map result → bet outcome per market type)
- Settlement confidence score (auto vs manual review)
- Manual override for edge cases
- Audit trail per settlement

---

### Public Site Gap

The site should be browseable without login. Currently everything requires auth.

Needs:
- Public landing page
- How it works / product explanation
- Example analysis (static or anonymized)
- Pricing / waitlist / beta access flow
- Trust disclaimer and responsible gambling notice
- Auth-gated wall for AI tools, bets, analytics, bankroll

---

### Multilingual UI Gap

Full i18n is required for the target user base.

Languages:
- English (EN)
- Spanish (ES)
- French (FR)
- German (DE)
- Arabic (AR)
- Ukrainian (UK)
- Russian (RU)

Also required:
- Arabic RTL layout support
- Localized date, number, and currency formats
- Localized public pages
- Localized full app UI
- AI output language support (already partially present in Analyst/Scout — needs consistency)

---

### Design Quality Gap

Current design is accepted as the live stable shell, but it is not founder vision.

Design v2 needs:
- Premium sports intelligence visual identity
- Dynamic and event-aware visuals (not static neutral dashboard)
- Mobile polish throughout
- Public landing design that communicates product value
- Full design system before implementation begins
- Motion/animation system (subtle, not decorative)

---

### AI Limits / Cost Architecture Gap

User-facing AI limits are blunt and create friction.
The system still needs:
- Configurable per-plan tiers (free vs paid)
- Analysis snapshot caching (same match/market should reuse prior result)
- Reused analysis when fixture context hasn't changed
- Cost controls per user/day/month
- Abuse guardrails at infrastructure level

---

### Mobile / Tablet / Native App Readiness Gap

Current app is usable as a responsive web app, but mobile/tablet experience is not yet
treated as a first-class product surface.

Needs:
- Mobile-first layouts for Scout, Analyst, Bets, Bankroll, Analytics, Coach
- Tablet-optimized app shell (not just stretched mobile)
- Touch-friendly controls and settlement flows
- Better small-screen navigation
- Responsive AI result cards — long outputs readable without horizontal scrolling
- Mobile-safe charts and tables
- PWA readiness consideration
- Future native mobile app architecture path (shared API layer, clean boundaries)

---

## 4. Roadmap

### Phase 1 — Sports Data + Fixture Foundation
- Evaluate and select sports data provider (see Section 7)
- Football fixtures integration
- Tennis fixtures integration
- Match results ingestion
- Odds data (if available from provider)
- Stable fixture IDs shared across product
- Caching and sync plan

### Phase 2 — Scout v2 Calendar-Driven
- Real upcoming fixtures as Scout input
- Football and tennis first
- Odds-aware candidate generation
- AI used for ranking and explanation — only after real data retrieval
- No fabricated matches

### Phase 3 — Football Analyst v2 + Tennis Analyst v2
- Sport-specific analysis schemas
- Deeper contextual inputs (form, H2H, surface, etc.)
- Stronger confidence and risk reasoning
- Source-aware explanations (AI cites what data it used)

### Phase 4 — Auto Settlement v1
- Result ingestion from data provider
- Fixture/result mapping to open bets
- Settlement for safe v1 market types (1X2, Match Winner)
- Settlement logs and audit trail
- Manual override for edge cases

### Phase 5 — Public Site + Auth Split
- Public landing page
- Public example analysis
- Auth-gated advanced tools
- Waitlist / beta access flow
- Trust disclaimer and responsible gambling notice

### Phase 6 — i18n v1
Languages: EN, ES, FR, DE, AR, UK, RU
- Full app UI translation
- Public pages translation
- Arabic RTL layout
- Localized date/number/currency

### Phase 7 — Mobile / Tablet Experience v1
- Mobile-first app flows
- Tablet-optimized app shell
- Touch-friendly bet tracking and settlement
- Mobile AI result reading experience
- Responsive analytics and charts
- PWA readiness

### Phase 8 — Design v2 / Premium Event Skin
- Visual direction first (references, concepts, not implementation)
- App shell redesign
- Public landing design
- Event-aware skins
- Motion system

### Phase 9 — Native Mobile App Exploration
- React Native / Expo feasibility study
- Shared API layer assessment
- Shared i18n integration
- Push notifications for bet settlement and result updates
- Mobile-specific onboarding design

---

## 5. Acceptance Criteria for Product Vision Beta

The following must all be true before an external beta launch:

- Scout returns real upcoming fixtures (not LLM-fabricated matches)
- AI analysis is sport-specific and deep for football and tennis
- Bets can auto-settle from real match results
- Public pages are accessible without login
- Advanced tools (Scout, Analyst, Coach, Analytics) are gated behind auth
- App UI is available in EN, ES, FR, DE, AR, UK, RU
- Arabic RTL is handled correctly
- Core flows work smoothly on mobile and tablet:
  Scout → Analyst → decision → bet → settlement → Analytics/Coach
- AI outputs are readable on mobile without horizontal scrolling
- Bet lists, Quick Settle, bankroll, and analytics are touch-friendly
- Tablet layout uses available space — not just stretched mobile
- Design meets premium sports intelligence standard
- User can complete the full product loop without manual hacks or workarounds
- Architecture leaves a clear path open for a future native mobile app

---

## 6. What Remains Frozen

Until the above gaps are closed and acceptance criteria are met:

- No external beta invites
- No public launch
- No Scout v2 implementation until data provider is selected
- No i18n implementation until architecture is planned
- No auto-settlement until fixture/result model exists
- No mobile redesign until mobile/tablet UX is planned
- No native mobile app until web product architecture and API boundaries are stable
- No random design iteration
- No new code PRs unless a blocker appears in current main

---

## 7. Immediate Next Decision (Gate)

**Sports Data Provider Selection**

Before coding Phase 2 (Scout v2), Phase 3 (deep Analyst), Phase 4 (Auto Settlement),
or Phase 5 (public previews with real fixtures), the founder/CPO must select the
sports data provider strategy.

Providers to evaluate:

| Provider | Focus |
|---|---|
| API-Sports | Football, tennis, broad sport coverage |
| SportMonks | Football-first, deep stats |
| Sportradar | Enterprise-grade, football and tennis |
| TheOddsAPI | Odds aggregation across bookmakers |
| OpticOdds | Odds, lines, live data |
| Others | Other football/tennis providers as relevant |

Evaluation criteria:
- Real upcoming fixtures for football and tennis
- Match results with sufficient latency for auto-settlement
- Odds data availability
- Historical data for backtesting
- Pricing and rate limits for beta scale
- API stability and documentation quality

**This decision unlocks Phases 2–5 of the roadmap.**
