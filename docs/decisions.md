# BetTracker — Decision Log
> Every significant architectural, product, or strategic decision is recorded here.
> Format: Date | Decision # | What | Why | Alternatives | Consequences

---

## Decision #001 — Controlled Rebuild vs Refactor
**Date:** 2026-06-26  
**Proposed by:** CPO  
**Approved by:** Lead Engineer + CEO  

**Decision:** Controlled Rebuild. New Next.js project from scratch. Current `bettracker.html` becomes reference only.

**Why:**
- Current monolithic 4900-line HTML file cannot scale
- No TypeScript = no type safety, no refactor confidence
- No routing = impossible to add new screens cleanly
- localStorage state = unreliable across devices
- AI as single giant prompt = impossible to evolve into agent architecture
- Refactor would extend the life of an architecture that can't reach the product goal

**Alternatives considered:**
- Full Refactor (Vanilla JS): faster short-term, hits ceiling in 3–6 months
- Big Bang Rebuild (chaotic): risk of losing working business logic
- Controlled Rebuild: takes longer, but correct for 12+ month horizon

**Consequences:**
- Sprint 1 = infrastructure only, no new features
- Current prototype stays live on btdk.app during rebuild
- All business logic from bettracker.html must be audited and ported deliberately
- Estimated 2–3 weeks before first working page in new stack

---

## Decision #002 — Skip shadcn/ui in Sprint 1
**Date:** 2026-06-26  
**Proposed by:** Lead Engineer  
**Approved by:** CPO + CEO  

**Decision:** Use plain Tailwind CSS in Sprint 1. Evaluate component library at Sprint 2.

**Why:**
- shadcn/ui requires setup time and opinionated structure
- Sprint 1 goal is architecture, not UI polish
- Design language isn't stable enough yet to choose a component system
- Adding UI library too early can constrain design decisions later

**Alternatives considered:**
- shadcn/ui from day 1: more polish, but premature
- Radix UI: same issue
- No library ever: risk of inconsistency at scale

**Consequences:**
- Some UI repetition in Sprint 1 (acceptable)
- Component library decision deferred to Sprint 2 when design patterns are clearer

---

## Decision #003 — New Supabase Project
**Date:** 2026-06-26  
**Proposed by:** CPO  
**Approved by:** Lead Engineer + CEO  

**Decision:** Create new Supabase project for the rebuilt product. Old project used only as data migration source.

**Why:**
- Old schema has no migrations, no type safety, informal structure
- `bets` and `bankroll` tables have technical debt
- `global_config` RLS is broken (requires service_role workaround)
- Clean start allows proper schema design with migrations from day 1

**Alternatives considered:**
- Migrate old Supabase in-place: risk of breaking live prototype
- Keep old project: inherit all technical debt

**Consequences:**
- New Supabase project must be created by CEO before Sprint 1 starts
- Old project keys remain active for bettracker.html (prototype stays live)
- Migration script needed to port existing bets to new schema

---

## Decision #004 — Scanner upgraded from Haiku to Sonnet
**Date:** 2026-06-26  
**Proposed by:** Lead Engineer  
**Approved by:** CEO (tested, confirmed OCR errors)  

**Decision:** `scParseScreenshot()` now uses `claude-sonnet-4-6` instead of `claude-haiku-4-5-20251001`.

**Why:**
- Haiku produced OCR errors on team names (e.g., "Нидерланды" → "нимеченны", "Эквадор" → "Екадор")
- Sonnet is significantly better at reading text from images
- Cost difference is acceptable given low frequency of scanner usage

**Alternatives considered:**
- Prompt engineering on Haiku: already tried (added "read exactly as shown"), insufficient
- Two-step pipeline (Haiku scan → Sonnet correct): more complex, same end cost
- Sonnet directly: simplest solution, best quality

**Consequences:**
- Slightly higher API cost per scan (negligible)
- Significantly better team name accuracy

---

## Decision Template

```
## Decision #XXX — [Title]
**Date:** YYYY-MM-DD  
**Proposed by:** [CPO / Lead Engineer / CEO]  
**Approved by:** [Who approved]  

**Decision:** [One sentence — what was decided]

**Why:**
- [Reason 1]
- [Reason 2]

**Alternatives considered:**
- [Alt 1]: [why rejected]
- [Alt 2]: [why rejected]

**Consequences:**
- [What changes]
- [What risks]
```

---

## Decision #005 — Decision-First Data Architecture
**Date:** 2026-06-26  
**Proposed by:** CPO  
**Approved by:** Lead Engineer + CEO  

**Decision:** `Decision` is the primary object of the system. `Bet` is the financial execution of a Decision. `BetLeg` decouples individual events from tickets for express/parlay support.

**Schema hierarchy:**
```
decisions
  └── ai_analysis_runs
bet_legs → decisions (nullable)
bets
  └── bet_legs
bankrolls
  └── bankroll_transactions → bets
profiles
```

**Why:**
- "We build not a history of bets, but a history of decisions"
- User can analyze and NOT bet — valid action, must be recordable
- User can bet without analysis (quick_entry) — must work
- Express bets need leg-level decision linking
- Enables future analytics: where AI was right, where user skipped value bets

**Key rules:**
- `bet_legs.decision_id` is nullable — allows imports and quick entry
- New UX should always create a Decision (even minimal one with `source = quick_entry`)
- `bankroll_transactions` tracks balance by events, not by direct mutation

**Alternatives considered:**
- `bets` table only (old Sprint 0 schema): loses the decision/analysis separation
- `decisions → bets` simple FK: breaks for express bets with multiple decisions

**Consequences:**
- `001_initial_schema.sql` rewritten before first migration (clean project, no rollback needed)
- `types/index.ts` updated to reflect new entities
- Dashboard/Bets pages need updating to query new schema (Sprint 1 task)
- `handle_new_user()` trigger auto-creates profile + default bankroll on signup

---

## Decision #006 — Multi-Sport Foundation
**Date:** 2026-06-26  
**Proposed by:** CPO + Founder  
**Approved by:** Lead Engineer + CEO  

**Decision:** BetTracker AI is not tennis-only. The architecture must be sport-aware from the foundation. AI Analyst uses a base prompt + sport-specific module + market-specific module.

**Core sports (Sprint 2):**
- `soccer`
- `tennis`
- `cs2`

**Future sports:**
- `basketball`, `ice_hockey`, `mma`, `dota2`, `lol`, `baseball`, `american_football`, and others

**Sport-specific reasoning examples:**

*Tennis:* surface, serve/return quality, break points, tie-break frequency, fatigue, H2H, indoor/outdoor, BO3/BO5, recent form, injury risk

*Soccer:* home/away split, team style, xG if available, form, injuries/lineups if provided, motivation, schedule congestion, weather, cards/corners for relevant markets, tactical mismatch

*CS2:* map pool, map veto, BO1/BO3/BO5, LAN/online, roster changes, player form, CT/T side strength, pistol rounds, economy, H2H, recent map-specific form

**Why:**
- Product vision is a platform, not a single-sport tool
- Sport-specific analysis produces materially better output than generic analysis
- Architecture must support sport modules without full rewrites

**Alternatives considered:**
- Generic prompt for all sports: simpler, but lower quality analysis
- Build tennis-only first: faster, but creates architectural dead ends

**Consequences:**
- AI Analyst prompt structure: base system prompt + injected sport module
- Fallback: `generic_sport_analyst` for unlisted sports
- Sprint 2 must support tennis / soccer / cs2 selection in `/ai` form
- No sport-specific UI constraints — same form, different AI context

---

## Decision #007 — Multilingual Foundation
**Date:** 2026-06-26  
**Proposed by:** CPO + Founder  
**Approved by:** Lead Engineer + CEO  

**Decision:** BetTracker AI targets a global audience. Initial locales: `uk`, `ru`, `en`, `es`, `fr`, `de`, `ar`. Arabic requires RTL support. All canonical data must be stored as codes, not localized labels.

**Canonical code rule:**
```
Bad:  sport = "Футбол", market = "Победа", recommendation = "Ставить"
Good: sport_code = "soccer", market_type = "match_winner", recommendation = "bet"
```
User-facing labels are translated by the UI/i18n layer — never stored as translations in the DB.

**This affects:**
- UI (all new Sprint 2 screens must be i18n-ready)
- AI output (user selects output language; structured JSON fields remain canonical)
- Scanner output (include `detected_language`, `raw_text`, normalized canonical fields)
- Database fields (sport_code, market_type, selection, recommendation all canonical)

**DB schema implications:**

`profiles`: add `preferred_locale`, `timezone`

`decisions`: add `input_language`, `output_language`, `raw_event_text`, `raw_market_text`, `participants jsonb`

`ai_analysis_runs`: add `input_language`, `output_language`, `detected_language`

**Sprint 2 scope:**
- User selects output language (auto / uk / ru / en / es / fr / de / ar)
- AI Analyst returns user-facing text in selected language
- Structured JSON values remain canonical regardless of language
- Do not build a full translation system yet — prepare structure only

**Why:**
- Target users span UA, RU, EN markets at minimum
- Sport betting is globally distributed
- Localization debt is very expensive to pay back later

**Alternatives considered:**
- English-only: fast short-term, blocks global growth
- Translation after launch: high refactor cost

**Consequences:**
- All new Sprint 2 code avoids hardcoded user-facing strings where possible
- Canonical codes always used in data layer; labels generated by display layer
- Arabic RTL planned but not implemented until locale is active

---

## Decision #008 — Market Scout / Opportunity Scout
**Date:** 2026-06-26  
**Proposed by:** CPO + Founder  
**Approved by:** Lead Engineer + CEO  

**Decision:** BetTracker AI will eventually help users find markets worth deeper research, not only evaluate matches they already identified. This is the Scout module — distinct from AI Analyst.

**Product distinction:**
- AI Analyst = evaluates one specific Decision the user already has in mind
- Scout = discovers potential opportunities before a Decision exists

**Future user flow:**
```
Upcoming events
→ Scout run
→ market_opportunities (candidates)
→ user opens candidate
→ AI Analyst creates Decision
→ user: Place / Skip / Watch
→ Bet / Result / Learning
```

**Responsible betting guardrail:**
Scout must not become a chase-loss engine. If user is in a post-loss context, the product should encourage planning and risk discipline, not forced activity.

**Future `market_opportunities` table (not Sprint 2):**
```
id, user_id, sport_code, event_id?, event_name, market_type, selection,
line, odds, bookmaker, opportunity_type, scout_score,
model_probability, implied_probability, edge_percent, confidence_score,
data_quality_score, risk_level, status, reasoning, required_checks jsonb,
metadata jsonb, created_at, updated_at
```

Statuses: `discovered`, `research_needed`, `watchlisted`, `converted_to_decision`, `dismissed`, `expired`

**Sprint 2 impact:**
- Do NOT implement Scout in Sprint 2
- Sprint 2 AI Analyst and Decision schema must be compatible with future Scout
- AI Analyst must support generic `sport_code` + `market_type` + `selection` + `line` + `odds` (not locked to match_winner)

**Why:**
- Users don't only analyze bets they already found — they search for opportunities
- Scout becomes a major product differentiator (vs pure trackers)
- Architecture must allow Scout to feed into the Decision pipeline

**Consequences:**
- `market_opportunities` table planned for Sprint 5
- Decision schema is forward-compatible (sport_code, market_type, selection, line are all generic fields)
- Scout roadmap entry added to product.md

---

## Decision #009 — Future Brand Direction: LineHunter AI
**Date:** 2026-06-26  
**Proposed by:** CPO + Founder  
**Status:** Accepted as future direction. Not implemented yet.  

**Decision:** BetTracker AI remains the current working name. LineHunter AI is the preferred future brand direction.

**Why the name fits the product:**
- The product helps users find weak/vulnerable betting lines
- "Hunt the edge. Beat the line." captures the core value proposition
- "Tracker" undersells the product — it's a decision system, not a diary
- "LineHunter" reflects: searching for weak lines, finding edge, competing against bookmaker pricing

**Slogans:**
- EN: Hunt the edge. Beat the line.
- RU: Ищи слабые линии. Принимай сильные решения.
- UA: Шукай слабкі лінії. Приймай сильні рішення.

**No public rebrand before:**
- Working Analyst / Scout loop exists
- Product-market fit signals
- Domain availability check (`linehunter.ai`, etc.)
- Trademark check
- Brand/marketing review

**What this means now:**
- Product language in docs, prompts, and copy should prefer: Decision, Edge, Line, Scout, Opportunity, Weak Line, Value, Risk, Confidence
- Avoid in product language: guaranteed bet, sure bet, lock, free money, 100%, revenge bet, chase
- No rename of repo, routes, Supabase project, or UI in Sprint 2

**Consequences:**
- `docs/strategy.md` to reflect LineHunter direction
- Product vocabulary codified (see Decision #009 product language rules)
- Rebrand is a named milestone, not a spontaneous decision

---

## Decision #010 - Controlled Provider-Backed Fixture Writes
**Date:** 2026-07-05
**Proposed by:** CPO + Founder
**Status:** Accepted and validated in production for M1.2.c.

**Decision:** BetTracker may write provider-backed fixtures only through a controlled, operator-gated, one-provider / one-day workflow with a small fixture cap, immediate write-flag removal, and post-write idempotency verification.

**Why:**
- Fixture data is now needed as the foundation for future odds, results, enrichment, Scout, and Analyst improvements.
- Provider fetches and writes can burn quota or create duplicate records if run broadly.
- The first production write needed to prove the `canonical_fixtures` and `fixture_provider_links` path without touching odds, results, enrichment, cron, Scout, Analyst, or UI.

**Validated M1.2.c scope:**
- provider: `api_football`
- date: `2026-12-31`
- fetched fixtures: 2
- first write inserted 2 canonical fixtures and 2 provider links
- idempotency write inserted 0 and updated 2 canonical fixtures / 2 provider links
- failed writes: 0
- duplicate provider links: 0
- mapping confidence: `exact`
- mapping method: `provider_fixture_id`
- write flag removed after validation; production `writeEnabled=false`

**Consequences:**
- Future fixture writes must use a fresh dry-run-selected scope and stay within the safety guard.
- `SPORTS_FIXTURE_SYNC_WRITE_ENABLED` remains absent/off by default.
- M1.3 odds snapshot work must begin as a design milestone before implementation because odds sync can create provider cost, rate-limit, storage, noise, and settlement-risk pressure.

---

## Decision #011 - Design-Gated Odds Snapshot Sync
**Date:** 2026-07-05
**Proposed by:** CPO + Founder
**Status:** Accepted for design in PR #79. Implementation not started.

**Decision:** M1.3 odds snapshot sync must be designed and accepted before any code, migrations, provider calls, cron, or odds writes are added. Odds v1 starts with a narrow API-Football / football-only scope and remains blocked from Scout, Analyst, UI, model probability, edge, and EV until a separate validation milestone proves the data is safe to use.

**Why:**
- Odds data can burn provider quota faster than fixture data.
- Odds snapshots can grow storage quickly if cadence, fixtures, markets, bookmakers, and retention are not capped first.
- Provider market labels and bookmaker IDs are not safe for downstream use until normalized through a market catalog.
- Unverified odds must not create false precision or betting signals in Analyst.
- M1.2.c proved controlled fixture writes only; it did not validate odds ingestion, odds quality, or user-facing odds consumption.

**Initial design constraints:**
- provider v1: `api_football`
- sport v1: football only
- execution v1: manual dry-run first, no cron
- write enablement: separate odds write gate in a future implementation PR, off by default
- max run scope, max snapshots per fixture/day, bookmaker allowlist, retention, and quota budget must be defined before implementation
- raw provider odds payloads must never be surfaced in user-facing responses or logs

**Consequences:**
- PR #79 is documentation/design only.
- No odds ingestion code or migrations are allowed in PR #79.
- Future M1.3 implementation must include safety guards, dry-run reporting, cap overflow behavior, tests, and a validation runbook before any controlled odds write.
- Analyst and Scout must continue treating provider odds snapshots as unavailable until a later trust validation explicitly enables them.

---

## Decision #012 - Odds Endpoint Discovery Before Provider Calls
**Date:** 2026-07-05
**Proposed by:** CPO + Founder
**Status:** Accepted and completed via PR #80. Production provider odds calls not started.

**Decision:** M1.3 must begin with a read-only odds endpoint discovery and dry-run planner. Production API-Football odds provider calls remain blocked until the exact endpoint, request shape, and quota/request cost are documented and accepted. Odds writes remain blocked until a later controlled write milestone.

**Why:**
- The official API-Football documentation was not accessible from the Codex runtime because the public documentation hosts returned a browser challenge.
- Endpoint shape and request cost must be treated as unconfirmed until verified from provider docs/account by an operator.
- A safe implementation can still validate local gating, pre-match eligibility, bookmaker allowlist behavior, sanitized reporting, and non-use rules without calling providers.
- This keeps the old false-precision failure class closed: unverified odds data must not become a model probability, edge, EV, Scout signal, or Analyst recommendation.

**PR #80 constraints:**
- no odds writes
- no migrations
- no production provider odds calls
- no Supabase writes
- no cron
- no Scout, Analyst, or UI usage
- `SPORTS_FIXTURE_SYNC_WRITE_ENABLED` remains absent/off
- `SPORTS_ODDS_SYNC_WRITE_ENABLED` is not added/enabled

**Consequences:**
- PR #80 may add a pure read-only planner and tests for blocked provider calls, fixture eligibility, empty bookmaker allowlist, sanitized discovery reports, and no raw payload/token surfacing.
- A future PR must confirm API-Football endpoint/request/cost before adding any real provider odds fetcher.
- Bookmaker allowlist remains empty until dry-run discovery is reviewed and approved.

---

## Decision #013 - API-Football Odds Endpoint Confirmation Block
**Date:** 2026-07-05
**Proposed by:** CPO + Founder
**Status:** Draft PR #81; provider odds calls remain blocked.

**Decision:** BetTracker will not proceed to a production API-Football odds dry-run until the exact odds endpoint, request shape, bookmaker/market discovery shape, and quota/request cost are confirmed from the API-Football/API-Sports account or official documentation.

**Why:**
- The official API-Football/API-Sports documentation hosts returned a browser challenge to the Codex runtime again.
- PR #80 intentionally added only a read-only planner and treats endpoint/request/cost as unconfirmed.
- Odds requests can burn provider quota and can later become betting signals, so inferred endpoint names or third-party snippets are not enough.
- The current API-Football account plan cost is not stored in the repo and was not available to Codex.

**Current confirmation result:**
- exact odds endpoint: not confirmed
- request parameters: not confirmed
- bookmaker discovery shape: not confirmed
- market/bet discovery shape: not confirmed
- whether `match_winner` / 1X2 can be requested directly: not confirmed
- quota/request cost: not confirmed
- decision to proceed to production odds dry-run: blocked

**Scope controls:**
- no production provider odds call
- no odds write
- no migration
- no API route
- no Supabase write
- no env change
- no Scout, Analyst, or UI change
- `SPORTS_ODDS_SYNC_WRITE_ENABLED` not added/enabled

**Consequences:**
- PR #81 records a blocked confirmation state, not an implementation unblock.
- A later unblock PR must provide sanitized operator-side evidence from the API-Football/API-Sports account or official docs.
- Only after that evidence is accepted may BetTracker plan a read-only production odds dry-run against known canonical fixture IDs.

---

*Last updated: 2026-07-05*
*Owner: All (each role contributes)*
