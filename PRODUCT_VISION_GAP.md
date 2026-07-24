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

The founder has clarified that the core value of the product is **not** shallow bet
tracking or generic AI analysis. The core value is:

- **Deep Predictive Sports Intelligence** — forecasting football and tennis outcomes
  with maximum available context, not surface-level pattern matching
- **Market-aware bet analysis and bet variation generation** — analysis must connect
  to the current odds market and produce multiple actionable bet options, not a
  single generic recommendation
- **Internal sports knowledge base / intelligence graph** — stable sports knowledge
  (teams, players, coaches, venues, tournaments, styles, H2H) stored and reused
  internally, not re-derived from scratch on every request
- **Learning from outcomes** — analysis outcomes, bet outcomes, settlement results,
  user feedback, and calibration must feed back into the system over time
- **Dynamic current context ingestion** — news, injuries, lineups, weather, and odds
  movement must be fetched and factored in at analysis time, not assumed static
- **Future video/social/expert-analysis ingestion**, where legally allowed, to add
  qualitative expert context on top of structured data

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

### Predictive Betting Intelligence Gap

The core product is not a shallow AI form. It must deeply forecast and analyze
football/tennis bets with maximum context, including:

- form
- teams/players
- coaches
- tactical styles
- league/championship specifics
- venue/stadium
- weather
- injuries/suspensions
- expected lineups
- motivation
- odds movement
- historical patterns
- previous match performance
- qualitative expert context

It must remain probabilistic decision support:
- no guaranteed picks
- no sure wins
- no profit promises

---

### Sports Knowledge Base / Intelligence Graph Gap

The system should store stable/base knowledge internally for fast retrieval:

- teams
- players
- coaches
- venues/stadiums
- leagues/tournaments
- tennis surfaces
- tactical/style profiles
- H2H summaries
- league characteristics
- long-term statistical baselines

This is currently missing. Every analysis today re-derives context from scratch
instead of drawing on a reusable internal base of sports knowledge.

---

### Dynamic Context Ingestion Gap

The system should fetch/refresh dynamic event-specific information:

- recent form
- injuries
- suspensions
- lineups
- weather
- odds movement
- news
- recent match reports
- travel/rest/fatigue
- tournament motivation

This is currently missing. Analysis today has no live ingestion pipeline for
event-specific context that changes in the hours/days before a fixture.

---

### Video / Social / Expert Analysis Gap

Future system should use legally accessible:

- YouTube tactical breakdowns
- previous match analysis
- expert previews
- post-match reviews
- press conferences
- transcripts/captions/metadata
- social clips only where allowed

**Important:** Do not blindly scrape copyrighted media. Store structured insights,
citations/source links, timestamps, summaries, embeddings, and confidence — not
raw copyrighted video.

---

### Market-Aware Bet Variations Gap

After analysis, the product must generate market-aware bet options based on
current odds:

- conservative
- balanced/value
- aggressive
- alternative/hedge
- no-bet/wait

Each option should include:
- market type
- selection
- current odds
- bookmaker/source
- odds timestamp
- fair/model odds
- minimum acceptable odds
- edge %
- confidence
- risk
- why this market fits the analysis
- what would invalidate it

Rules:
- AI must not invent odds.
- If odds are stale/unavailable, show target odds only: "Play only if odds ≥ X."
- Product must be comfortable saying "no bet."

This is currently missing. AI Analyst v1 produces generic analysis, not
market-aware, odds-connected bet variations.

---

### Learning / Calibration Gap

The system should learn from:

- saved analyses
- decisions
- placed bets
- settled outcomes
- edge vs actual result
- confidence calibration
- user overrides
- feedback
- recurring team/player/market patterns

This is currently missing. Coach analyzes user decision patterns today, but there
is no feedback loop that calibrates model confidence against actual settled
outcomes over time.

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

### Phase 2 — Sports Knowledge Base / Intelligence Graph
- Internal storage for stable/base sports knowledge (teams, players, coaches,
  venues, leagues/tournaments, tennis surfaces, style profiles, H2H summaries)
- Fast retrieval layer reusable across Scout, Analyst, Coach, and future public/
  mobile surfaces
- Long-term statistical baselines and league characteristics

### Phase 3 — Scout v2 Calendar-Driven
- Real upcoming fixtures as Scout input
- Football and tennis first
- Odds-aware candidate generation
- AI used for ranking and explanation — only after real data retrieval
- No fabricated matches

### Phase 4 — Football Analyst v2 + Tennis Analyst v2
- Sport-specific analysis schemas
- Deeper contextual inputs (form, H2H, surface, etc.)
- Stronger confidence and risk reasoning
- Source-aware explanations (AI cites what data it used)

### Phase 5 — Market-Aware Bet Builder
- Connect analysis output to current odds market
- Generate conservative / balanced / aggressive / alternative-hedge / no-bet
  options
- Fair odds, minimum acceptable odds, edge %, confidence, and risk per option
- Target-odds messaging when live odds are stale/unavailable

### Phase 6 — Dynamic Context Ingestion
- Live ingestion of news, injuries, suspensions, lineups, weather, odds movement
- Recent match reports and tournament motivation context
- Separation of verified structured data vs. editorial/social context
- Foundation for future video/social/expert-analysis ingestion

### Phase 7 — Auto Settlement v1
- Result ingestion from data provider
- Fixture/result mapping to open bets
- Settlement for safe v1 market types (1X2, Match Winner)
- Settlement logs and audit trail
- Manual override for edge cases

### Mandatory Milestone — Scale Readiness & AI Economics

This milestone is a release gate before Phase 8, mass marketing, or any claim that
BetTracker is ready for 1000+ concurrent web/mobile sessions. Architecture review
alone does not pass the gate: the measurable criteria in
[ADR-011 — Scale Readiness & AI Economics](docs/adr/ADR-011-scale-readiness-ai-economics.md)
must be demonstrated by future load, failure, quality, and cost tests.

1. Establish performance, AI quality, and AI cost baselines.
2. Implement request, runtime, database, provider, and AI observability.
3. Introduce a durable AI usage ledger with actual token and cost accounting.
4. Add safe caching, Anthropic prompt caching, request deduplication, and idempotency.
5. Introduce explicit model-routing and bounded fallback policies.
6. Add durable queues, priorities, backpressure, and provider-aware rate limits.
7. Enforce per-user, per-plan, and global budget guardrails.
8. Prove Supabase connection-pooling and query-capacity readiness.
9. Run representative web/mobile load tests and a separate simultaneous-AI stress
   test.
10. Roll out gradually through 10% → 25% → 50% → 100% cohorts with soak gates.
11. Approve a capacity plan, incident-response procedure, and rollback runbook.

### Phase 8 — Public Site + Auth Split
- Public landing page
- Public example analysis
- Auth-gated advanced tools
- Waitlist / beta access flow
- Trust disclaimer and responsible gambling notice

### Phase 9 — i18n v1
Languages: EN, ES, FR, DE, AR, UK, RU
- Full app UI translation
- Public pages translation
- Arabic RTL layout
- Localized date/number/currency

### Phase 10 — Mobile / Tablet Experience v1
- Mobile-first app flows
- Tablet-optimized app shell
- Touch-friendly bet tracking and settlement
- Mobile AI result reading experience
- Responsive analytics and charts
- PWA readiness

### Phase 11 — Design v2 / Premium Event Skin
- Visual direction first (references, concepts, not implementation)
- App shell redesign
- Public landing design
- Event-aware skins
- Motion system

### Phase 12 — Native Mobile App Exploration
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
- Football and tennis analysis uses real fixture context, current form, odds,
  venue/stadium/weather where available
- Tennis analysis accounts for surface, player form, fatigue/rest, ranking/profile,
  H2H, tournament stage
- Football analysis accounts for team form, tactical style, coach/team tendencies,
  injuries/suspensions, venue/weather, league context
- System stores reusable base knowledge for fast retrieval
- System separates stable knowledge from live/current context
- After analysis, product suggests multiple market-aware bet options: conservative,
  balanced/value, aggressive, alternative/hedge, no-bet/wait
- Each bet option includes current odds, source/bookmaker, timestamp, fair odds,
  minimum acceptable odds, edge %, confidence, and risk
- Product can say "no bet" when no current market has value
- If odds are stale/unavailable, product shows target odds instead of an active
  recommendation
- Product learns from outcomes and calibration over time
- Video/social/expert analysis is supported as a future ingestion layer with
  legal/commercial constraints
- The mandatory Scale Readiness & AI Economics milestone has passed with measured
  load-test, failure-test, quality, and cost evidence; design review alone is not
  sufficient

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
- No market-aware bet builder implementation until odds provider and market
  normalization are decided
- No dynamic context/video ingestion until source/legal model is planned
- No learning/calibration implementation until data model and privacy implications
  are planned

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
- Odds data availability, including snapshots suitable for a future market-aware
  bet builder
- Stable IDs for fixtures/teams/players across time
- Historical data for backtesting
- Pricing and rate limits for beta scale
- API stability and documentation quality

The selected provider strategy must support, at minimum:
- fixtures
- results
- odds snapshots
- stable IDs
- football/tennis first
- the future market-aware bet builder (Phase 5)
- future auto-settlement (Phase 7)

**This decision unlocks Phases 2–7 of the roadmap.**
