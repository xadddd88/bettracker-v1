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
**Status:** Accepted via PR #81; superseded for planning by PR #82 provider evidence. Provider odds calls remain not started.

**Decision:** BetTracker will not proceed to a production API-Football odds dry-run until the exact odds endpoint, request shape, bookmaker/market discovery shape, and quota/request cost are confirmed from the API-Football/API-Sports account or official documentation.

**Why:**
- The official API-Football/API-Sports documentation hosts returned a browser challenge to the Codex runtime again.
- PR #80 intentionally added only a read-only planner and treats endpoint/request/cost as unconfirmed.
- Odds requests can burn provider quota and can later become betting signals, so inferred endpoint names or third-party snippets are not enough.
- The current API-Football account plan cost is not stored in the repo and was not available to Codex.

**PR #81 confirmation result before PR #82 evidence:**
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

## Decision #014 - API-Football Odds Provider Evidence Captured
**Date:** 2026-07-05
**Proposed by:** CPO + Founder
**Status:** Accepted via PR #82. Provider evidence captured; production provider odds calls not started.

**Decision:** BetTracker accepts sanitized operator-side and docs-sourced evidence for API-Football odds endpoint shape, quota model, bookmaker discovery shape, mapping discovery shape, response schema, and `Match Winner` market mapping. PR #82 remains evidence-only and does not run a production odds dry-run.

**Confirmed evidence:**
- base URL: `https://v3.football.api-sports.io`
- auth header: `x-apisports-key`
- status endpoint: `GET /status`
- observed plan: `Free`
- observed daily request limit: `100`
- quota model: one HTTP call / page counts as one request against plan quota
- no endpoint-specific weighted `/odds` cost identified
- daily and per-minute request limits apply
- odds endpoint: `GET /odds`
- request parameters shown: `fixture`, `league`, `season`, `date`, `bookmaker`, `bet`, `page`
- mixed request filters are supported
- pagination is supported through `page`
- odds pagination size is 10 results per page
- bookmaker endpoint path: `GET /odds/bookmakers`
- bookmaker discovery response uses standard wrapper plus `response[].id` and `response[].name`
- mapping endpoint path: `GET /odds/mapping`
- mapping response uses standard wrapper plus `league`, `fixture`, and `update`
- pre-match bet catalog path: `GET /odds/bets`
- `Match Winner` / 1X2 provider bet id: `1`
- `Match Winner` values: `Home`, `Draw`, `Away`
- odds response shape includes `fixture`, `league`, `update`, `bookmakers`, `bets`, `values`, and decimal-string `odd`

**Still required before any production provider odds call:**
- separate CPO approval for a read-only dry-run scope
- exact canonical fixture IDs and exact API-Football provider links for that scope
- request budget, including pagination
- sanitized runtime report expectations
- confirmation that odds remain non-user-facing
- BetTracker canonical pre-match eligibility gate must stay authoritative unless a later runtime result proves provider-side pre-match filtering is sufficient

**Risk decision:**
```txt
endpoint/cost evidence blocker: addressed for planning
production odds dry-run: NOT STARTED
next action: separate CPO-approved read-only dry-run scope
```

**Scope controls:**
- no provider odds call from BetTracker production
- no odds write
- no migration
- no API route
- no Supabase write
- no env change
- no Scout, Analyst, or UI odds usage
- `SPORTS_ODDS_SYNC_WRITE_ENABLED` not added/enabled

**Consequences:**
- PR #82 is evidence-only and does not run runtime provider calls.
- A later CPO-approved step must select the dry-run fixtures, request budget, and sanitized report before any production provider odds call.
- The likely future dry-run shape is `GET /odds?fixture={api_football_provider_fixture_id}&bet=1`, counting each page as one request.

---

## Decision #015 - Read-Only Odds Dry-Run Scope Before Provider Call
**Date:** 2026-07-05
**Proposed by:** CPO + Founder
**Status:** Accepted via PR #83. Scope approval only; production provider odds call not started.

**Decision:** The first API-Football odds runtime step must be scoped and approved before any provider call. PR #83 selects a single primary exact-linked fixture candidate and a fallback candidate, defines the request shape, request budget, pagination guardrail, sanitized report, and stop conditions. It does not run the provider call.

**Proposed PR #83 scope:**
- provider: `api_football`
- market: `Match Winner / 1X2`
- provider bet id: `1`
- primary provider fixture id: `1576052`
- fallback provider fixture id: `1576053`
- future request shape, if separately approved: `GET /odds?fixture=1576052&bet=1`
- variant: A only
- max provider requests: 1
- hard stop: `paging.total > 1`

**Required gates before runtime:**
- fixture remains `scheduled`
- `kickoff_at` is known
- `kickoff_at > now + 15 minutes`
- exact `api_football` provider link exists
- provider fixture id matches the merged PR #83 scope
- no odds write flag is present
- odds remain non-user-facing

**Scope controls:**
- no provider odds call in PR #83
- no odds write
- no migration
- no API route
- no Supabase write
- no env change
- no Scout, Analyst, or UI odds usage
- no model probability, implied probability, edge, EV, recommendation, or betting signal
- `SPORTS_ODDS_SYNC_WRITE_ENABLED` not added/enabled

**Consequences:**
- M1.3 can proceed to a separately approved read-only runtime dry-run after PR #85 is merged and deployed.
- Any fallback call, page 2 fetch, broader fixture scope, odds write, or user-facing odds use requires separate approval.
- The old false-precision failure class remains closed: odds discovery must not become a probability, edge, EV, or recommendation.

---

## Decision #016 - Read-Only Odds Dry-Run Implementation Before Runtime Call
**Date:** 2026-07-05
**Proposed by:** CPO + Founder
**Status:** Accepted and merged via PR #85. Runtime dry-run executed separately after merge; odds writes and downstream usage not started. GitHub assigned this implementation as PR #85 because PR #84 already exists.

**Decision:** BetTracker may add a protected admin-only read-only odds dry-run route and server helper for the PR #83 scope, but the production API-Football provider call remains blocked until PR #85 is reviewed, merged, deployed, and separately approved.

**Implemented PR #85 scope:**
- route: `POST /api/admin/sports/odds/dry-run`
- provider: `api_football`
- primary provider fixture id: `1576052`
- market: `Match Winner / 1X2`
- provider bet id: `1`
- request shape: `GET /odds?fixture=1576052&bet=1`
- required runtime confirmation: `RUN_READ_ONLY_ODDS_DRY_RUN_M1_3`
- variant: A only
- max provider requests: 1
- page 1 only
- stop if `paging.total > 1`

**Pre-flight gates:**
- exact `fixture_provider_links` row exists
- `provider = api_football`
- `provider_fixture_id = 1576052`
- `mapping_confidence = exact`
- linked `canonical_fixtures` row exists
- `sport = football`
- `status = scheduled`
- `kickoff_at` is known
- `kickoff_at > now + 15 minutes`

**Scope controls:**
- no provider odds call during PR #85 implementation/validation
- no odds write
- no migration
- no Supabase write
- no env change
- no `SPORTS_ODDS_SYNC_WRITE_ENABLED`
- no Scout, Analyst, or UI odds usage
- no model probability, implied probability, edge, EV, recommendation, or betting signal

**Consequences:**
- PR #85 was tested with mocked provider responses and read-only Supabase mocks.
- The route must require operator authorization and keep `API_FOOTBALL_KEY` server-side only.
- A failing pre-flight must block the provider call.
- A successful pre-flight may attempt exactly one page-1 provider request only after separate runtime approval.
- The sanitized report may include bookmaker/market ids and names, paging, availability, and values-present booleans, but not raw provider payload, odds prices, tokens, probability, edge, EV, or betting signals.

---

## Decision #017 - First Read-Only Odds Dry-Run Result
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Executed / safe. Result recorded via PR #87. Odds writes not started. GitHub assigned the result record as PR #87 because PR #86 already existed.

**Decision:** BetTracker accepts the first production API-Football read-only odds dry-run result as safe evidence. The run consumed exactly one approved provider request, returned no odds coverage for the selected fixture and market, and produced only a sanitized coverage report.

**Approved runtime scope:**
- endpoint: `POST https://btdk.app/api/admin/sports/odds/dry-run`
- provider: `api_football`
- provider fixture id: `1576052`
- market: `match_winner`
- provider bet id: `1`
- internal provider request shape: `GET /odds?fixture=1576052&bet=1`
- max provider requests: 1
- page 1 only

**Result:**
- HTTP status: 200
- `success=true`
- `preflight.passed=true`
- `requestAttempted=true`
- `paging.current=1`
- `paging.total=1`
- `oddsAvailable=false`
- `discoveredBookmakers=[]`
- `discoveredMarkets=[]`
- `valuesPresent=false`
- `paginationOverflow=false`
- `estimatedProviderRequests=1`
- `actualProviderRequests=1`
- `stopReasons=[]`
- `writeSkipped=true`

**Interpretation:**
- Pre-flight passed against the exact provider link and canonical fixture.
- Exactly one provider request was executed.
- API-Football returned no odds coverage for fixture `1576052` / `bet=1`.
- No page 2 was requested.
- No odds write, Supabase write, migration, or env flag was used.
- No raw provider payload, token, odds price, probability, implied probability, edge, EV, recommendation, Scout signal, Analyst signal, or UI signal surfaced.

**Consequences:**
- M1.3 read-only odds dry-run is `EXECUTED / SAFE`.
- `SPORTS_ODDS_SYNC_WRITE_ENABLED` remains not added/enabled.
- M1.3 odds writes remain `NOT STARTED`.
- Any further provider odds call, fallback fixture call, page 2 fetch, odds write, storage work, or user-facing odds usage requires separate CPO approval.

---

## Decision #018 - Bookmaker and Mapping Discovery Scope Before Reference Calls
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Draft PR #88. Scope approval only; provider calls not run.

**Decision:** After the first fixture-specific read-only odds dry-run returned `oddsAvailable=false`, the next safer M1.3 step is reference discovery scope approval for bookmaker and mapping endpoints, not a new near-term fixture odds call or any write path.

**Why:**
- The first dry-run proved the protected route, pre-flight, provider-call budget, sanitized report, and no-write behavior.
- The selected fixture is scheduled for `2026-12-31`, roughly 178 days away at the time of the dry-run, so missing odds coverage is expected and not an integration defect.
- Fixture-specific odds coverage may be sparse far ahead of kickoff.
- Bookmaker and mapping reference discovery can validate provider reference shapes without exposing odds prices or creating betting signals.
- Reference discovery still consumes provider quota, so it requires scope approval, a fixed request budget, and pagination stop conditions before runtime.

**Approved discovery scope proposal:**
- `GET /odds/bookmakers`
- `GET /odds/mapping`
- max provider requests: 2 total
- page 1 only for each endpoint
- stop if `paging.total > 1` on either endpoint
- no pagination crawling
- no page 2
- no odds values endpoint
- no fixture-specific odds call

**Sanitized report fields:**
- request attempted per endpoint
- endpoint name
- `paging.current`
- `paging.total`
- results count
- discovered bookmaker ids/names from `/odds/bookmakers`
- mapping coverage fields from `/odds/mapping`:
  - `league.id`
  - `league.season`
  - `fixture.id`
  - `update`

**Stop conditions:**
- estimated provider requests exceed 2
- `paging.total > 1`
- response shape differs from accepted provider evidence
- raw provider payload would be exposed
- report attempts to include odds prices, probability, implied probability, edge, EV, recommendation, Scout signal, Analyst signal, UI signal, or any betting signal

**Scope controls:**
- no runtime code
- no migration
- no API route
- no provider call in PR #88
- no odds dry-run rerun
- no odds write
- no Supabase write
- no env change
- no `SPORTS_ODDS_SYNC_WRITE_ENABLED`
- no Scout, Analyst, or UI changes
- no model probability, implied probability, edge, EV, recommendation, or betting signal

**Consequences:**
- PR #88 may document and seek approval for the reference discovery scope only.
- Runtime bookmaker/mapping discovery remains blocked until PR #88 is reviewed, merged, deployed if needed, and separately approved for execution.
- Any future implementation must keep raw provider payloads, tokens, account details, odds prices, and betting signals out of responses, logs, docs, and user-facing surfaces.

---

## Decision #019 - FP-001 False Precision Regression Case
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Accepted. Regression case recorded in `docs/analysis-trust-regression-cases.md`.

**Decision:** BetTracker will treat the legacy AI Analysis PDF from 2026-07-04 as regression case `FP-001 - Legacy False Precision Analysis`.

The legacy PDF showed `SOCCER`, `NO VALUE`, `Model probability 28.0%`, `Implied probability 45.5%`, and `Edge -17.4%` while also admitting that live injuries, team news, recent form updates, current line movement, and tennis-specific model support were missing. It also used pseudo-precise probability language such as `45.45%` and `25-30%` without verified per-leg model inputs.

**Rule:** No incomplete provider discovery, odds snapshot, bookmaker mapping, market mapping, or Analyst/Scout feature may produce model probability, implied probability, edge, EV, recommendation, Place Bet visibility, Scout score, or betting signal unless required model inputs and trust gates are satisfied.

**Consequences:**
- Reference discovery is not a betting signal.
- Odds availability is not model probability.
- Odds snapshots are not edge.
- Bookmaker odds are not recommendations.
- Line movement cannot be shown as value until a separate trust validation milestone approves it.
- Any future odds, market, bookmaker, Scout, Analyst, or user-facing recommendation work must be checked against FP-001 before merge.

Reference: `docs/analysis-trust-regression-cases.md`

---

## Decision #021 - FP-001 Data Coverage Map
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Accepted as a roadmap aid. Documentation only; implementation not started.

**Decision:** BetTracker will maintain an FP-001 data coverage map that connects each missing requirement from the legacy false-precision analysis to provider candidates, canonical storage targets, milestones, status, and blockers.

The map is not an implementation milestone. It does not supersede the current M1.3 bookmaker/mapping discovery path, does not start M1.2.e football enrichment, and does not authorize provider calls, odds writes, Supabase writes, Scout usage, Analyst usage, UI changes, or betting signals.

**Mapped requirements:**
- provider-backed odds / line movement
- live status / event state
- team news / lineups
- injuries / suspensions
- sport-specific model support
- per-leg model inputs

**Conclusions:**
- Football can eventually close several FP-001 gaps using existing paid providers, but only after endpoint evidence, read-only dry-runs, write gates, and trust validation.
- Tennis remains unsupported for pricing until a deep tennis provider, tennis enrichment storage, and tennis-specific model support exist.
- Sport-specific model support and per-leg model inputs are Analyst-layer requirements, not data purchases alone.
- Reference discovery and provider availability do not unlock betting signals.
- Any Analyst, Scout, UI, or pricing work must check against FP-001 before use.

Reference: `docs/data-coverage-fp001-map.md`

---

*Last updated: 2026-07-06*
*Owner: All (each role contributes)*
