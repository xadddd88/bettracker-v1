# Sports Intelligence Architecture

> **Status: Planning / architecture only. Nothing in this document is implemented.**
> This is a docs-only design reference for Beta v2 direction. It does not authorize
> any code, schema, migration, or integration work.

---

## 1. Purpose

BetTracker (future LineHunter AI) must evolve from an engineering-stable betting
tracker into a deep sports intelligence system. Tracking bets and running generic
AI analysis is not the core value of the product — deep, market-aware, sport-specific
prediction is.

This architecture must eventually support:

- calendar-driven Scout
- deep football analysis
- deep tennis analysis
- market-aware bet builder
- auto-settlement
- learning/calibration
- multilingual product
- mobile/tablet experience
- future native app

This document describes the target shape of the system. It does not schedule
implementation. Implementation order is governed by the dependency chain in
Section 9 and the current CPO "Do Not Do Now" list in `PROJECT_STATE.md`.

---

## 2. Core product loop

Intended future loop, once each layer below exists:

1. User chooses sport / event / date / language
2. Scout pulls real fixtures/calendar
3. System attaches odds/market snapshot
4. Scout ranks opportunities
5. User opens event
6. Football/Tennis Analyst runs deep analysis
7. System generates bet variations:
   - conservative
   - balanced/value
   - aggressive
   - alternative/hedge
   - no-bet/wait
8. User saves decision / places bet / watches
9. Bet is tracked
10. Result provider auto-settles when possible
11. Analytics/Coach learn from outcome and calibration

---

## 3. Architecture layers

### Layer 1 — Sports Data Layer

**Purpose:** Structured external data.

Includes:
- fixtures
- results
- odds
- standings
- lineups
- injuries/suspensions
- player/team stats
- tennis tournament/surface data
- bookmaker odds
- odds timestamps
- stable provider IDs

**Key rule:** AI must not invent fixtures, odds, or results.

### Layer 2 — Internal Sports Knowledge Base

**Purpose:** Fast reusable base knowledge.

Store stable/semi-stable knowledge:
- teams
- players
- coaches
- stadiums/venues
- leagues/tournaments
- tennis surfaces
- player/team style profiles
- historical H2H summaries
- tactical tendencies
- league-specific characteristics
- known strengths/weaknesses
- long-term statistical baselines

This layer should be searchable and reusable across Scout, Analyst, Coach, public
previews, and the future mobile app.

### Layer 3 — Dynamic Context Layer

**Purpose:** Current event-specific information.

Fetch/refresh:
- recent form
- recent match reports
- injuries
- suspensions
- expected lineups
- weather
- odds movement
- travel/rest/fatigue
- tournament motivation
- press conferences
- expert previews
- video/transcript summaries where legally available

Separate:
- verified structured data
- trusted editorial/context data
- unverified social/video commentary

### Layer 4 — Retrieval / RAG Layer

**Purpose:** Give AI the right context quickly.

Should support:
- source metadata
- timestamps
- confidence/source quality
- embeddings for articles/transcripts/reports
- entity linking: team/player/coach/venue/fixture
- deduplication
- freshness scoring
- citation/source references where possible

### Layer 5 — Sport-Specific Analysis Engines

Separate engines per sport.

#### Football Analyst v2

Should consider:
- team form
- home/away splits
- standings/table context
- fixtures congestion
- injuries/suspensions
- lineups/expected lineups
- coach/tactical style
- matchup style
- H2H
- stadium/venue
- weather
- league/tournament specifics
- motivation
- odds movement
- market context

#### Tennis Analyst v2

Should consider:
- player form
- ranking/profile
- surface
- tournament stage
- fatigue/rest
- recent match load
- H2H
- injuries/withdrawals
- player style matchup
- set/game history
- odds movement
- market context

### Layer 6 — Market-Aware Bet Builder

**Purpose:** Transform analysis into actionable bet variations.

Inputs:
- model probability
- current odds
- bookmaker/source
- odds timestamp
- line/market
- fair odds
- minimum acceptable odds
- edge %
- confidence
- risk
- market availability

Outputs (one of each, where applicable):
- Conservative option
- Balanced/value option
- Aggressive option
- Alternative/hedge option
- No-bet/wait option

Each option should include:
- market type
- selection
- current best odds
- bookmaker/source
- odds timestamp
- fair/model odds
- minimum acceptable odds
- edge %
- confidence
- risk level
- why this market fits the analysis
- what would invalidate the bet

Rules:
- Do not invent odds.
- If odds are stale/unavailable, show target odds only: "Play only if odds ≥ X."
- The system must be comfortable saying no-bet.

### Layer 7 — Settlement Engine

**Purpose:** Auto-settle bets when safe.

Needs:
- provider fixture_id
- result status lifecycle
- market settlement rules
- settlement confidence
- manual override
- audit trail
- settlement source

Safe v1 markets might include:

**Football:**
- 1X2
- double chance
- draw no bet
- over/under
- basic handicap, if provider result data is sufficient

**Tennis:**
- moneyline
- game handicap
- total games, if data is reliable
- set betting, only if set-level result data is reliable

Unsafe/manual v1 markets:
- player props without a reliable stat source
- complex combos/parlays
- unofficial markets
- ambiguous void/push scenarios

### Layer 8 — Learning / Calibration Layer

**Purpose:** Improve trust and model quality over time.

Learn from:
- saved analyses
- decisions
- placed bets
- settled outcomes
- edge vs. actual result
- confidence calibration
- user overrides
- feedback
- recurring team/player/market patterns

Outputs:
- calibration grade
- model confidence correction
- sport/league/user-level insights
- Coach recommendations
- future probability calibration

**Important:** This is probabilistic decision support, not guaranteed betting advice.

### Layer 9 — Public / Mobile / Multilingual Readiness

Architecture must not block:
- public pages without auth
- auth-gated advanced tools
- mobile-first UX
- tablet UX
- future native mobile app
- i18n: EN, ES, FR, DE, AR, UK, RU
- Arabic RTL
- localized dates/numbers/currencies

---

## 4. Data categories

| Data category | Examples | Stable or dynamic | Store internally? | Fetch live? | Needed for Scout? | Needed for Analyst? | Needed for auto-settlement? | Notes |
|---|---|---|---|---|---|---|---|---|
| Fixtures | Match/event schedule | Dynamic | Yes (cache) | Yes | Yes | Yes | Yes | Provider is source of truth |
| Results | Final scores/outcomes | Dynamic | Yes | Yes | No | Yes (H2H/form) | Yes | Drives settlement |
| Odds | Bookmaker prices | Dynamic (fast-moving) | Snapshot only | Yes | Yes | Yes | No | Must be timestamped |
| Teams | Club/national team profiles | Stable | Yes | Occasionally | Yes | Yes | No | Knowledge Base |
| Players | Roster, attributes | Semi-stable | Yes | Occasionally | Minor | Yes | No | Knowledge Base |
| Coaches | Manager/coach profiles | Semi-stable | Yes | Rarely | Minor | Yes | No | Knowledge Base |
| Venues/Stadiums | Location, surface, altitude | Stable | Yes | Rarely | Minor | Yes | No | Knowledge Base |
| Weather | Forecast at kickoff | Dynamic | No | Yes | No | Yes (football) | No | Context Layer |
| Injuries/Suspensions | Availability status | Dynamic | No (cache short-term) | Yes | Minor | Yes | No | Context Layer |
| Lineups | Confirmed/expected XI | Dynamic | No | Yes | No | Yes | No | Context Layer |
| Rankings/Standings | Table position, ATP/WTA rank | Semi-dynamic | Yes (cache) | Yes | Yes | Yes | No | Refresh periodically |
| Tennis surfaces | Clay/grass/hard profiles | Stable | Yes | No | Minor | Yes | No | Knowledge Base |
| H2H | Historical matchups | Semi-stable | Yes | Occasionally | Minor | Yes | No | Knowledge Base + updates |
| Form | Recent results trend | Dynamic | No | Yes | Yes | Yes | No | Derived from Results |
| Odds movement | Price history over time | Dynamic | Yes (time series) | Yes | Minor | Yes | No | Needed for market context |
| Match reports | Editorial previews/reviews | Dynamic | Yes (as chunks) | Yes | No | Yes | No | RAG Layer, source-scored |
| Video/transcripts | Tactical breakdowns, interviews | Dynamic | Yes (structured insight only) | Yes | No | Yes | No | Store insights, not raw media |
| User decisions | Saved analysis/bet choices | Dynamic | Yes | No | No | No | No | Feeds Calibration Layer |
| Bet outcomes | Won/Lost/Void results | Dynamic | Yes | No | No | No | Yes | Feeds Settlement + Calibration |
| Feedback | User corrections/ratings | Dynamic | Yes | No | No | No | No | Feeds Calibration Layer |

---

## 5. Entity model concepts

Conceptual entities only — no migrations or schemas are created by this document.

- **Provider** — external sports data/odds source; tracks reliability and coverage per sport
- **Sport** — top-level domain (football, tennis, ...) that scopes rules and markets
- **Competition / League / Tournament** — grouping context for fixtures and standings
- **Season** — time-bounded scope for standings, form, and stats
- **Team** — football club/national team knowledge base record
- **Player** — individual athlete profile, used by both football and tennis
- **Coach** — manager/tactical profile linked to teams over time
- **Venue** — stadium/court location, surface, and environmental attributes
- **Fixture** — a specific scheduled or completed event
- **FixtureParticipant** — link between a Fixture and the Team(s)/Player(s) involved
- **OddsSnapshot** — a timestamped price capture for a market at a point in time
- **Market** — a bettable market type on a Fixture (e.g. 1X2, over/under)
- **MarketSelection** — a specific outcome within a Market (e.g. "Home", "Over 2.5")
- **Result** — the verified outcome of a Fixture, used to settle Markets
- **SettlementRule** — logic defining how a Market resolves given a Result
- **AnalysisSnapshot** — a stored output of an Analyst run at a point in time
- **KnowledgeSource** — an origin of context data (provider, editorial, video, social)
- **KnowledgeChunk** — a retrievable unit of context (embedded, timestamped, scored)
- **CalibrationRecord** — tracked comparison of predicted edge vs. actual outcome
- **UserDecision** — the user's chosen action after viewing an analysis
- **Bet** — a tracked wager tied to a UserDecision
- **BetLeg** — an individual selection within a Bet (supports multi-leg bets)

---

## 6. Source reliability model

Every piece of context data needs a reliability score, not just a value.

Ordering of trust (highest to lowest):
1. Official provider data (fixtures, results, lineups, stats)
2. Bookmaker odds (treated as market fact, not opinion)
3. Trusted editorial/news sources
4. Expert analysis (named, accountable authors)
5. Video/transcript analysis (tactical breakdowns, interviews)
6. Social commentary (lowest trust, directional signal only)
7. User-provided notes (treated as user input, not verified fact)

Rules:
- Official data > trusted editorial > social commentary, always.
- Social/video context should support and enrich analysis — it should never define
  the final probability or recommendation on its own.
- Every source must carry a timestamp and a confidence/quality score so the
  Retrieval Layer (Section 3, Layer 4) can weight and expire it correctly.

---

## 7. Video / social / expert analysis

Future ingestion track (not started):

- YouTube tactical breakdowns
- Match previews/reviews
- Press conferences
- Highlights and previous-match analysis
- Instagram/social clips, only where legally accessible
- Prefer transcripts/captions/metadata over raw video
- Store structured insights and citations, not raw copyrighted media
- Legal/commercial constraints must be reviewed per source before any ingestion
- Do not scrape blindly — every source needs an explicit legal/ToS check first

---

## 8. Constraints and non-goals

- No guaranteed betting advice
- No "sure wins"
- No invented odds
- No fabricated fixtures
- No auto-settlement for unsupported markets
- No public launch until privacy/legal/public pages are ready
- No native app until API/product architecture is stable

---

## 9. Phase dependencies

```
Sports Data Provider decision
  → Fixture/result/odds foundation
    → Sports Knowledge Base
      → Scout v2
        → Deep Analyst v2
          → Market-Aware Bet Builder
            → Auto Settlement
              → Public/i18n/mobile/design
```

Each stage depends on the previous stage being real and stable — not
approximated. Skipping ahead (e.g. building Deep Analyst before fixture/odds
data exists) produces an analysis engine with nothing trustworthy to analyze.

---

## 10. Open questions for founder/CPO

- Which data provider strategy?
- One provider vs. split providers (e.g. separate football/tennis/odds providers)?
- Which markets are v1 settlement-safe?
- Which football leagues and tennis tournaments ship first?
- What is the acceptable monthly data cost for beta?
- How much source citation should the user see in the UI?
- Should the user be able to paste video/article links directly?
- Which languages ship first?
- Is the native app a future standalone product or a companion app to the web product?

---

## 11. Final recommendation

- Do not implement Scout v2 until the provider decision is made.
- Do not implement the deep analyst until fixture/odds context is available.
- Do not implement auto-settlement until fixture/result IDs are stable.
- Build the intelligence architecture before adding more UI.
- The next decision document should be `SPORTS_DATA_PROVIDER_EVALUATION.md`.
