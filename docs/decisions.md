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
## Decision #NNN — [Title]
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
**Status:** Scope accepted via PR #88. Implementation merged via PR #92. First runtime result is partial / safe.

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
- Runtime bookmaker/mapping discovery required separate approval after PR #88 and PR #92.
- The first separately approved runtime discovery attempted `/odds/bookmakers` only and stopped before `/odds/mapping` on the response-shape guard.
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

## Decision #022 - Bookmaker Discovery Partial Safe Result
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Accepted as partial / safe evidence. Mapping discovery not run. Full bookmaker/mapping discovery not done.

**Decision:** BetTracker accepts the first production bookmaker/mapping reference discovery result as safe partial evidence, not as a completed discovery milestone.

**Approved runtime scope:**
- endpoint: `POST https://btdk.app/api/admin/sports/odds/reference-discovery`
- provider: `api_football`
- scope: `bookmaker_mapping_reference`
- endpoints: `/odds/bookmakers`, `/odds/mapping`
- max provider requests: 2
- page 1 only
- stop if `paging.total > 1`
- stop if response shape differs from expected evidence
- no odds values endpoint
- no fixture-specific odds endpoint

**Result:**
- HTTP status: 200
- `success=false`
- `dryRun=true`
- `estimatedProviderRequests=2`
- `actualProviderRequests=1`
- `writeSkipped=true`
- `paginationOverflow=false`
- stop reason: `provider response shape differs from expected evidence for /odds/bookmakers`
- `/odds/bookmakers.requestAttempted=true`
- `/odds/bookmakers.paging.current=1`
- `/odds/bookmakers.paging.total=1`
- `/odds/bookmakers.resultsCount=33`
- `/odds/bookmakers.responseShapeValid=false`
- discovered bookmaker count: 32, as reported by sanitized output
- `/odds/mapping.requestAttempted=false`
- `mappingCoverage=[]`

**Interpretation:**
- The bookmaker endpoint is reachable.
- The endpoint returned bookmaker ids/names in sanitized output.
- The protected route correctly returned `success=false` because a guardrail stop reason was present.
- The route correctly stopped before `/odds/mapping`.
- This is safe partial discovery, not full successful discovery.
- No page 2, odds values endpoint, or fixture-specific odds endpoint was called.
- No raw provider payload, API key, operator token, account data, odds prices, probability, implied probability, edge, EV, recommendation, Scout signal, Analyst signal, UI signal, betting signal, or Supabase write surfaced.

**Consequences:**
- M1.3 Bookmaker Discovery is `PARTIAL / SAFE`.
- M1.3 Mapping Discovery is `NOT RUN`.
- M1.3 Bookmaker & Mapping Discovery is `NOT DONE`.
- `SPORTS_ODDS_SYNC_WRITE_ENABLED` remains not added/enabled.
- M1.3 odds writes, storage, Scout usage, Analyst usage, UI usage, and betting signals remain not started.
- Any further provider call, including rerunning `/odds/bookmakers` or calling `/odds/mapping`, requires separate CPO approval.
- FP-001 remains active: reference discovery does not unlock probability, edge, EV, recommendation, or betting signal generation.

Reference: `docs/sports-odds-bookmaker-mapping-discovery-result-m1-3.md`

---

## Decision #023 - Bookmaker Discovery Rerun Remains Partial / Safe
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Accepted as partial / safe evidence. Mapping discovery not run. Full bookmaker/mapping discovery not done.

**Decision:** BetTracker accepts the post-PR #94 production bookmaker discovery rerun as safe partial evidence, not as a completed discovery milestone. PR #94 improved the sanitizer for flat and wrapped bookmaker rows, but the rerun still stopped on the bookmaker response-shape guard before `/odds/mapping`.

**Approved runtime scope:**
- endpoint: `POST https://btdk.app/api/admin/sports/odds/reference-discovery`
- provider: `api_football`
- scope: `bookmaker_mapping_reference`
- endpoints: `/odds/bookmakers`, `/odds/mapping`
- max provider requests: 2
- page 1 only
- stop if `paging.total > 1`
- stop if response shape differs from expected evidence
- no odds values endpoint
- no fixture-specific odds endpoint

**Result:**
- HTTP status: 200
- `success=false`
- `dryRun=true`
- `estimatedProviderRequests=2`
- `actualProviderRequests=1`
- `writeSkipped=true`
- `paginationOverflow=false`
- stop reason: `provider response shape differs from expected evidence for /odds/bookmakers`
- `/odds/bookmakers.requestAttempted=true`
- `/odds/bookmakers.paging.current=1`
- `/odds/bookmakers.paging.total=1`
- `/odds/bookmakers.resultsCount=33`
- `/odds/bookmakers.responseShapeValid=false`
- discovered bookmaker count: 32
- `/odds/mapping.requestAttempted=false`
- `mappingCoverage=[]`

**Interpretation:**
- `/odds/bookmakers` is reachable.
- Bookmaker extraction succeeded for 32 sanitized id/name pairs.
- At least one reported row likely has unexpected or malformed shape, so the endpoint shape remains not clean.
- The protected route correctly returned `success=false` because a guardrail stop reason was present.
- The route correctly stopped before `/odds/mapping`.
- This is safe partial discovery, not full successful discovery.
- No page 2, odds values endpoint, or fixture-specific odds endpoint was called.
- No raw provider payload, API key, operator token, account data, odds prices, probability, implied probability, edge, EV, recommendation, Scout signal, Analyst signal, UI signal, betting signal, or Supabase write surfaced.

**Bookmaker list handling:**
- The supplied rerun summary includes the discovered bookmaker count but does not include the individual sanitized id/name list.
- BetTracker must not reconstruct or invent bookmaker ids/names in documentation.
- If the exact sanitized runtime list is supplied later, only exact `providerBookmakerId` / `name` pairs from that runtime output may be appended.

**Consequences:**
- M1.3 Bookmaker Discovery is `PARTIAL / SAFE`.
- M1.3 Mapping Discovery is `NOT RUN`.
- M1.3 Bookmaker & Mapping Discovery is `NOT DONE`.
- M1.3 Bookmaker Discovery Shape Adapter is `PARTIAL / NEEDS FOLLOW-UP`.
- `SPORTS_ODDS_SYNC_WRITE_ENABLED` remains not added/enabled.
- M1.3 odds writes, storage, Scout usage, Analyst usage, UI usage, and betting signals remain not started.
- Any further provider call, including rerunning `/odds/bookmakers` or calling `/odds/mapping`, requires separate CPO approval.
- FP-001 remains active: reference discovery does not unlock probability, edge, EV, recommendation, or betting signal generation.

Reference: `docs/sports-odds-bookmaker-discovery-rerun-result-m1-3.md`

---

## Decision #024 - Bookmaker Missing Name Handling Policy
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Proposed design policy. Implementation not started.

**Decision:** BetTracker should use Hybrid mode for API-Football bookmaker rows where `providerBookmakerId` exists but bookmaker `name` is missing.

**Options evaluated:**
- Strict mode: missing name remains fatal and stops discovery.
- Tolerant mode: missing name becomes nullable or unknown and discovery continues without downstream restrictions.
- Hybrid mode: missing name is non-fatal for reference discovery but blocked for allowlist, writes, Scout, Analyst, UI, and betting signals.

**Recommended policy:**
- Missing bookmaker name should not block reference discovery from continuing to `/odds/mapping` when it is the only bookmaker-row issue.
- The row may be counted only as partial sanitized diagnostics.
- `providerBookmakerId` may be counted.
- `name` remains `null` or `UNKNOWN_PROVIDER_BOOKMAKER`.
- The report includes a warning: `bookmaker row missing name`.
- Top-level `success=false` should be reserved for fatal guardrails, not non-fatal partial bookmaker warnings.
- Mapping can run if only non-fatal partial bookmaker warnings are present and all other approved discovery guardrails pass.

**Downstream restrictions:**
Partial bookmaker rows are not eligible for:
- bookmaker allowlist
- odds writes
- odds storage
- market catalog mapping
- Scout usage
- Analyst usage
- UI usage
- probability
- implied probability
- edge
- EV
- recommendation
- Place Bet
- betting signal

**Fatal guardrails remain fatal:**
- non-object row
- unsupported wrapper shape
- missing provider bookmaker id
- pagination overflow
- envelope/response shape mismatch
- raw payload exposure
- odds price exposure
- probability, edge, EV, recommendation, Scout signal, Analyst signal, UI signal, or betting signal generation

**Scope controls:**
- Documentation/design only.
- No runtime code.
- No provider calls.
- No reference discovery rerun.
- No odds writes.
- No Supabase writes.
- No migrations or env flags.
- No Scout, Analyst, or UI changes.
- No betting signals.

**FP-001:** This policy does not unlock pricing or betting signals. Partial bookmaker rows remain technical diagnostics only. Check against FP-001 before implementation or downstream use.

Reference: `docs/sports-odds-bookmaker-missing-name-policy-m1-3.md`

---

## Decision #025 - Bookmaker and Mapping Discovery Rerun Remains Partial / Safe
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Accepted as partial / safe evidence. Full bookmaker/mapping discovery not done.

**Context:** After PR #98 implemented Hybrid missing-name handling, a separately approved production reference discovery rerun used the protected read-only route:

```txt
POST https://btdk.app/api/admin/sports/odds/reference-discovery
```

Approved body:

```json
{
  "dryRun": true,
  "endpoints": ["bookmakers", "mapping"],
  "maxProviderRequests": 2,
  "operatorConfirm": "RUN_BOOKMAKER_MAPPING_DISCOVERY_M1_3"
}
```

**Decision:** Record the rerun as safe partial discovery, not as full discovery completion.

**Result:**
- HTTP status: 200
- `success=false`
- `dryRun=true`
- provider: `api_football`
- scope: `bookmaker_mapping_reference`
- `estimatedProviderRequests=2`
- `actualProviderRequests=2`
- `writeSkipped=true`
- `paginationOverflow=true`
- stop reason: `provider pagination total exceeds approved page-1 budget for /odds/mapping`

**Bookmaker endpoint:**
- `/odds/bookmakers.requestAttempted=true`
- `paging.current=1`
- `paging.total=1`
- `resultsCount=33`
- `paginationOverflow=false`
- `responseShapeValid=true`
- `bookmakerRowsTotal=33`
- `validBookmakerRows=32`
- `invalidBookmakerRows=0`
- `invalidBookmakerRowReasons=[]`
- `partialBookmakerRows=1`
- `partialBookmakerRowReasons=["missing name"]`
- `nonFatalWarnings=["bookmaker row missing name"]`
- discovered bookmaker count: 32

**Mapping endpoint:**
- `/odds/mapping.requestAttempted=true`
- `paging.current=1`
- `paging.total=11`
- `resultsCount=100`
- `paginationOverflow=true`
- `responseShapeValid=true`
- `mappingCoverage count=100`
- page 2 was not requested because it was not approved

**Interpretation:**
- PR #98 missing-name handling worked.
- Bookmaker discovery is now safe with one partial warning.
- Mapping discovery ran and returned page 1 successfully.
- The protected route correctly returned `success=false` because `/odds/mapping` reported `paging.total=11`, which exceeds the approved page-1 budget.
- This is partial safe discovery, not full successful discovery.
- No page 2, odds values endpoint, or fixture-specific odds endpoint was called.
- No raw provider payload, API key, operator token, account data, odds prices, probability, implied probability, edge, EV, recommendation, Scout signal, Analyst signal, UI signal, betting signal, or Supabase write surfaced.

**Consequences:**
- M1.3 Bookmaker Discovery is `SAFE / PARTIAL WARNING`.
- M1.3 Mapping Discovery is `PARTIAL / SAFE`.
- M1.3 Bookmaker & Mapping Discovery is `PARTIAL / SAFE / NOT DONE`.
- `SPORTS_ODDS_SYNC_WRITE_ENABLED` remains not added/enabled.
- M1.3 odds writes, storage, Scout usage, Analyst usage, UI usage, and betting signals remain not started.
- Do not auto-fetch remaining mapping pages.
- Open a separate mapping pagination strategy/scope before any page 2+ calls.
- FP-001 remains active: reference discovery does not unlock probability, edge, EV, recommendation, or betting signal generation.

Reference: `docs/sports-odds-bookmaker-mapping-discovery-rerun-result-m1-3.md`

---

## Decision #026 - Mapping Pagination Strategy Before Page 2 Calls
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Strategy only. Runtime page 2+ calls not approved.

**Context:** The latest approved reference discovery after PR #98 reached `/odds/mapping` page 1 and stopped correctly on the approved page-1 guardrail.

Known result:
- `actualProviderRequests=2`
- `/odds/bookmakers` returned page 1 with `paging.total=1`, `resultsCount=33`, and `responseShapeValid=true`.
- Bookmaker diagnostics: `bookmakerRowsTotal=33`, `validBookmakerRows=32`, `partialBookmakerRows=1`, and `nonFatalWarnings=["bookmaker row missing name"]`.
- `/odds/mapping` returned page 1 with `paging.total=11`, `resultsCount=100`, and `responseShapeValid=true`.
- `paginationOverflow=true`.
- Stop reason: `provider pagination total exceeds approved page-1 budget for /odds/mapping`.
- Page 2 was not requested.
- Odds values endpoint was not called.
- Fixture-specific odds endpoint was not called.
- No writes, raw payload, odds prices, probability, edge, EV, recommendation, Scout/Analyst/UI signal, or betting signal surfaced.

**Decision:** Do not auto-fetch remaining mapping pages. Define and accept a mapping pagination strategy before any page 2+ runtime call.

**Options to evaluate:**
- Option A: Stop at page 1 sample only.
- Option B: Controlled full mapping discovery pages 1-11.
- Option C: Narrowed mapping discovery using provider-supported filters if available.
- Option D: Canonical-fixture-first mapping discovery relevant to BetTracker's known canonical fixtures.

**Request budget framing:**
- Page 1 sample only: 0 additional requests.
- Full current mapping: 10 additional requests.
- Narrowed or filtered mapping: TBD after provider evidence.

**Risk controls:**
- Provider quota usage must be explicitly budgeted.
- Response size and irrelevant league/season noise must be bounded.
- Stale mapping risk must be acknowledged.
- Mapping reference data has no direct user value until later validated storage and trust gates exist.
- FP-001 remains active: mapping reference availability does not unlock probability, implied probability, edge, EV, recommendation, Place Bet, Scout score, Analyst pricing, UI signals, or betting signals.

**Consequences:**
- M1.3 Mapping Discovery remains `PARTIAL / SAFE`.
- M1.3 Bookmaker & Mapping Discovery remains `PARTIAL / SAFE / NOT DONE`.
- Page 2+ calls remain blocked.
- Odds writes, storage, Scout usage, Analyst usage, UI usage, and betting signals remain not started.
- The next approved step must be a separate implementation/runtime scope after CPO accepts a request budget and filtering strategy.

Reference: `docs/sports-odds-mapping-pagination-strategy-m1-3.md`

---

## Decision #027 - Canonical-Fixture-First Mapping Discovery Scope
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Scope only. Runtime provider calls not approved.

**Context:** PR #100 established that `/odds/mapping` page 1 returned 100 rows with `paging.total=11`. Full current mapping discovery would require 10 additional provider requests and is not automatically approved.

Known BetTracker provider fixture IDs:
- `1576052`
- `1576053`

**Decision:** Before any additional `/odds/mapping` calls, BetTracker will use a canonical-fixture-first strategy. The next scope prioritizes matching known provider fixture IDs against existing sanitized page-1 mapping coverage instead of crawling all 11 mapping pages by default.

**Strategy:**
- Do not crawl all 11 mapping pages by default.
- First compare existing page-1 mapping coverage against `provider_fixture_id=1576052` and `provider_fixture_id=1576053`.
- If either known fixture appears in existing page-1 mapping coverage, record coverage as found without more provider calls.
- If neither appears, evaluate whether API-Football supports filterable mapping discovery.
- Do not fetch page 2+ without separate approval.
- Do not use mapping coverage as a betting signal.

**Request budget framing:**
- Zero additional requests: compare existing page-1 result only.
- Narrow or filtered request: TBD after provider filter evidence.
- Full crawl pages 2-11: blocked.

**Stop conditions:**
- Page 2+ is not approved.
- Full crawl is not approved.
- No user-facing odds usage is approved.
- No probability, implied probability, edge, EV, recommendation, Scout signal, Analyst signal, UI signal, Place Bet permission, or betting signal is approved.

**FP-001:** Mapping reference coverage is not model probability, edge, EV, recommendation, or Scout/Analyst signal. Reference availability does not close FP-001 data gaps by itself.

**Consequences:**
- M1.3 Mapping Discovery remains `PARTIAL / SAFE`.
- M1.3 Bookmaker & Mapping Discovery remains `PARTIAL / SAFE / NOT DONE`.
- Page 2+ calls remain blocked.
- Odds writes, Supabase writes, Scout usage, Analyst usage, UI usage, and betting signals remain not started.
- The next runtime step, if any, requires a separate CPO-approved scope.

Reference: `docs/sports-odds-canonical-fixture-first-mapping-scope-m1-3.md`

---

## Decision #028 - Canonical-Fixture-First Mapping Page-1 Comparison Result
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Result record. No runtime provider calls.

**Context:** PR #101 defined the canonical-fixture-first strategy: compare existing sanitized `/odds/mapping` page-1 coverage against known BetTracker provider fixture IDs before any broader crawl.

Known BetTracker provider fixture IDs:
- `1576052`
- `1576053`

Comparison source:
- already captured sanitized runtime output from the latest reference discovery run
- no provider call
- no `/odds/mapping` rerun
- no page 2 fetch

Existing `/odds/mapping` page-1 result:
- `paging.current=1`
- `paging.total=11`
- `resultsCount=100`
- `mappingCoverage count=100`
- page 2 was not requested
- odds values endpoint was not called
- fixture-specific odds endpoint was not called
- no writes occurred
- no betting signal surfaced

**Result:**
- `provider_fixture_id=1576052` is NOT present in existing page-1 mapping coverage.
- `provider_fixture_id=1576053` is NOT present in existing page-1 mapping coverage.
- Canonical-fixture-first page-1 check result: `DONE / NOT FOUND`.

**Interpretation:**
- This is not an integration failure.
- The known controlled fixtures are not covered on page 1 of the global mapping response.
- `/odds/mapping` page 2+ remains blocked.
- Full mapping crawl remains blocked.
- Mapping coverage does not unlock probability, edge, EV, recommendations, Scout/Analyst/UI, Place Bet, or betting signals.

**Next decision:**
- Do not auto-fetch page 2.
- Do not crawl pages 2-11.
- Evaluate whether API-Football supports a filtered `/odds/mapping` request or whether mapping exploration should stop for now.

**FP-001:** Mapping page-1 not-found status is technical reference evidence only. It is not probability, implied probability, edge, EV, recommendation, Scout signal, Analyst signal, UI signal, or betting signal.

Reference: `docs/sports-odds-canonical-fixture-first-mapping-page1-result-m1-3.md`

---

## Decision #029 - Filtered Mapping Support Evidence
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Evidence only. Runtime provider calls not approved.

**Context:** PR #102 recorded that provider fixture IDs `1576052` and `1576053` were not present in the existing `/odds/mapping` page-1 mapping coverage. `/odds/mapping` page 1 had `paging.total=11`, and page 2+ remains blocked.

**Evidence source:** Existing sanitized operator-side provider evidence from `docs/api-football-odds-provider-evidence-m1-3.md`. No provider call was made for this decision.

**Confirmed for `/odds/mapping`:**
- endpoint path: `GET /odds/mapping`
- response fields: `paging.current`, `paging.total`, `response[]`
- response mapping fields: `league.id`, `league.season`, `fixture.id`, `fixture.date`, `fixture.timestamp`, `update`

**Not confirmed for `/odds/mapping`:**
- `fixture` request filter
- `league` request filter
- `season` request filter
- `date` request filter
- `bookmaker` request filter
- `bet` request filter
- exact `page` request parameter shape
- any other narrowing parameter

**Important distinction:** `GET /odds` supports fixture, league, season, date, bookmaker, bet, and page parameters. That does not prove those same filters are supported by `GET /odds/mapping`.

**Decision:**
- Filtered `/odds/mapping` runtime is not approved.
- Do not call `/odds/mapping?fixture=1576052` unless future sanitized provider evidence confirms the fixture filter.
- Do not call unconfirmed league/season/date/bookmaker/bet mapping filters.
- Do not call `/odds/mapping?page=2`.
- Keep full page crawl blocked.

**Future branch:**
- If future sanitized provider evidence confirms a fixture filter, a later scope may propose `GET /odds/mapping?fixture=1576052`, page 1 only, max 1 request, sanitized report only.
- If future evidence confirms league/season filters but not fixture filters, a later scope must justify request budget and relevance before runtime.
- If no useful filters are confirmed, mapping exploration should remain stopped or require a separate explicit CPO-approved full-crawl budget.

**FP-001:** Filtered mapping support evidence does not unlock probability, implied probability, edge, EV, recommendation, Place Bet, Scout score, Analyst signal, UI signal, or betting signal.

Reference: `docs/sports-odds-filtered-mapping-support-evidence-m1-3.md`

---

## Decision #030 - Mapping Exploration Pause & Handoff
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Pause / handoff. Runtime provider calls not approved.

**Context:** The M1.3 mapping path reached the current evidence boundary:

- `/odds/mapping` page 1 returned 100 rows.
- `paging.total=11`.
- Page 2 was not requested.
- Full crawl pages 2-11 would require 10 additional provider requests.
- `provider_fixture_id=1576052` was NOT PRESENT in page-1 mapping coverage.
- `provider_fixture_id=1576053` was NOT PRESENT in page-1 mapping coverage.
- Filtered `/odds/mapping` request parameters are not confirmed.
- Page 2+ remains blocked.
- Full mapping crawl remains blocked.

**Decision:** Pause M1.3 mapping exploration for now.

**Record:**
- M1.3 Mapping Pagination Strategy: `DONE`.
- M1.3 Canonical-Fixture-First Page-1 Check: `DONE / NOT FOUND`.
- M1.3 Filtered Mapping Support Evidence: `DONE / FILTERED RUNTIME BLOCKED`.
- M1.3 Mapping Exploration: `PAUSED`.
- `/odds/mapping` page 2+: `BLOCKED`.
- Full mapping crawl: `BLOCKED`.
- Filtered `/odds/mapping` runtime: `NOT APPROVED`.
- Odds writes: `NOT STARTED`.
- Scout/Analyst/UI odds usage: `NOT STARTED`.
- Betting signals: `NOT STARTED`.

**Next unblock:**
- Obtain stronger provider docs/account evidence that `/odds/mapping` supports useful filters, such as `fixture`, `league`/`season`, `date`, `bookmaker`, `bet`, or another narrowing parameter.
- Or open a separate CPO-approved full-crawl budget strategy.
- No runtime call is approved before one of those is accepted.

**FP-001:** Mapping exploration pause does not unlock probability, implied probability, edge, EV, recommendation, Place Bet, Scout score, Analyst signal, UI signal, or betting signal.

Reference: `docs/sports-odds-mapping-exploration-pause-m1-3.md`

---

## Decision #031 - M1.2.e Football Enrichment Design
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Design only. Implementation, provider calls, migrations, writes, and downstream usage not approved.

**Context:** M1.3 mapping exploration is paused. FP-001 data coverage mapping identifies football enrichment as a future path for closing several football-specific missing-data gaps, but no enrichment implementation has started.

**Decision:** BetTracker will design M1.2.e football enrichment before implementation. The design covers provider-backed football enrichment gaps only:

- injuries / suspensions
- lineups / starting elevens
- team news
- event-state freshness
- recent form inputs, if provider-backed and licensed

**Provider candidates:** API-Football, SportMonks, or another already paid/licensed provider explicitly approved by CPO. Scraping, unlicensed third-party data, and user-provided third-party context are not provider truth.

**Evidence required before provider calls:**
- endpoint path
- request params
- response shape
- quota/request cost
- rate limits
- freshness/update semantics
- plan availability

**Storage stance:** The existing `football_enrichment` table exists from migrations 013/014, but its current SportMonks-linked latest-state schema must not be assumed sufficient for injuries, suspensions, lineups, team news, event-state freshness, or recent form without schema review.

**Trust rules:**
- enrichment availability does not unlock model probability by itself
- injuries, suspensions, lineups, and team news do not become recommendations
- missing or stale enrichment must keep Analyst gated
- enrichment remains non-user-facing until a later trust validation milestone

**Safety gates:**
- endpoint evidence PR
- read-only dry-run PR
- schema/write design PR
- controlled write validation PR
- trust validation PR

**Non-use:** No Scout/Analyst/UI usage, no Place Bet unlock, no probability, no implied probability, no edge, no EV, no recommendation, and no betting signal are approved by this design.

**FP-001:** M1.2.e can eventually help close football provider-layer gaps around injuries, team news, event-state freshness, and recent form. It does not close Analyst-layer requirements such as calibrated probability, edge, EV, sport-specific model support, or per-leg model input validation by itself.

Reference: `docs/sports-football-enrichment-m1-2-e-design.md`

---

## Decision #033 - M1.2.e Football Enrichment Endpoint Evidence
**Date:** 2026-07-06
**Proposed by:** CPO + Founder
**Status:** Documentation/status evidence only. Runtime provider calls, writes, migrations, env flags, and downstream usage are not approved.

**Numbering note:** Decision #032 is reserved by the parallel open M1.3 API-Football `/odds/mapping` filter evidence track. This decision uses #033 to avoid renumbering conflicts across concurrent documentation PRs.

**Context:** M1.2.e Football Enrichment Design is DONE. No football enrichment implementation has started. Before any enrichment provider call, BetTracker needs sanitized endpoint evidence for injuries/suspensions, lineups, team news, event-state freshness, and provider-backed recent form.

**Decision:** BetTracker will treat SportMonks fixture-by-ID as the preferred candidate family for a future first read-only football enrichment dry-run, conditional on a selected canonical football fixture having an exact/high SportMonks provider link and CPO approving a one-request runtime scope.

**Confirmed SportMonks evidence:**
- `GET https://api.sportmonks.com/v3/football/fixtures/{ID}` is fixture-scoped and provider docs mark pagination as `NO`.
- Fixture response examples include fixture identifiers, `state_id`, `starting_at`, `result_info`, `has_odds`, `has_premium_odds`, and `starting_at_timestamp`.
- Fixture-by-ID include options include state, lineups, events/timeline, statistics, prematch/postmatch news, metadata, sidelined, formations, scores, xG fixture, pressure, expected lineups, match facts, and related enrichment families.
- `GET /v3/football/fixtures/latest` and `GET /v3/football/livescores/inplay` exist but are broader than a one-fixture first dry-run.
- SportMonks pre-match news and expected-lineup endpoints exist, but they are broad/team-scoped or subscription-sensitive and require separate scope.
- SportMonks sidelined entity evidence exists, but runtime usage should be through an approved endpoint/include scope.

**API-Football evidence stance:** API-Football remains a candidate provider, but enrichment endpoint path, request parameters, response shape, quota/request cost, rate limits, plan availability, and freshness semantics are not confirmed by this PR. API-Football enrichment runtime remains blocked until operator-side sanitized docs/account evidence is captured.

**Blocked endpoints:**
- API-Football enrichment endpoints until endpoint/cost/plan evidence is confirmed.
- Broad SportMonks latest-updated, inplay, and news feeds until request budget and sanitized report scope are accepted.
- Premium expected lineups until plan availability and team/fixture relevance are confirmed.
- Any prediction, value, advice, or betting-signal-adjacent endpoint.

**Safest initial future scope:** one canonical football fixture, one exact/high SportMonks provider fixture link, `GET /v3/football/fixtures/{ID}`, max one provider request, no pagination, approved include set only, sanitized report only, no writes, no raw payload, and no Scout/Analyst/UI usage.

**Trust rules:** Endpoint availability does not unlock model probability. Injuries, suspensions, lineups, team news, event-state fields, xG, pressure, match facts, or recent form facts do not become recommendations by themselves. Missing or stale enrichment keeps Analyst gated.

**FP-001:** Football enrichment endpoint evidence does not unlock probability, implied probability, edge, EV, recommendation, Place Bet, Scout score, Analyst signal, UI signal, or betting signal. Check against FP-001 before any downstream use.

Reference: `docs/sports-football-enrichment-endpoint-evidence-m1-2-e.md`

---

## Decision #034 - M1.2.e Football Enrichment Read-Only Dry-Run Scope
**Date:** 2026-07-07
**Proposed by:** CPO + Founder
**Status:** Scope/planning only. Runtime provider call not approved.

**Context:** M1.2.e Football Enrichment Endpoint Evidence is DONE. M1.2.e.2 SportMonks Canonical Fixture Mapping Scope is DONE and records the current blocker: production `fixture_provider_links` has 2 `api_football` / exact rows and 0 `sportmonks` rows, and no exact/high SportMonks provider link exists for canonical fixture `1576052`.

**Decision:** BetTracker will plan a future read-only football enrichment dry-run using SportMonks fixture-by-ID, but only under a separately approved runtime scope. Canonical-linked enrichment remains blocked until an exact/high SportMonks provider link exists.

**Required future runtime scope:**
- exactly one selected canonical football fixture for canonical-linked mode
- exact/high SportMonks provider fixture link for canonical-linked mode
- max one provider request unless a later CPO approval changes the budget
- no pagination
- no retry loop
- no crawl
- no fallback endpoint calls
- approved include set only
- sanitized report only
- no raw payload persistence
- no writes
- no Scout/Analyst/UI usage
- no probability, implied probability, edge, EV, recommendation, Place Bet, or betting signal

**Dry-run distinction:**
- SHAPE-ONLY / UNBOUND dry-run may validate SportMonks response shape using a native SportMonks fixture ID. It cannot write, attach to `canonical_fixture_id`, create or update `fixture_provider_links`, unlock `football_enrichment` writes, unlock Scout/Analyst/UI, or unlock probability, edge, EV, recommendation, Place Bet, or betting signal.
- CANONICAL-LINKED dry-run requires an exact/high SportMonks provider link, selected canonical football fixture, approved include set, approved request budget, approved sanitized output shape, and explicit CPO runtime approval.

**Hard pre-flight blocker:** Missing exact/high SportMonks provider link must abort before any provider call.

**Include-set stance:** The first dry-run should start with the fixture base response only, with `state` include allowed only if separately approved as necessary for state/freshness validation. Lineups, injuries/sidelined, expected lineups, news, xG, pressure, statistics, events, timeline, match facts, predictions, and odds remain excluded unless explicitly approved in the future runtime checklist.

**Failure handling:** Missing exact/high provider link, below-threshold mapping confidence, missing canonical fixture, non-football fixture, endpoint errors, auth/plan blocks, unexpected response shape, timeout, or network failure must produce sanitized blocked/error reports only. No retry is approved.

**Freshness:** Future runtime must report whether provider freshness fields are available. Missing freshness fields keep downstream usage blocked. `collected_at` is not source freshness.

**FP-001:** Endpoint/reference/enrichment evidence does not become probability, implied probability, edge, EV, recommendation, Place Bet, Scout score, Analyst signal, UI signal, or betting signal. Check against FP-001 before any downstream use.

Reference: `docs/sports-football-enrichment-read-only-dry-run-scope-m1-2-e.md`

---

## Decision #035 - M1.2.e.2 SportMonks Canonical Fixture Mapping Scope
**Date:** 2026-07-07
**Proposed by:** CPO + Founder
**Status:** Documentation/status scope only. Runtime provider calls, writes, migrations, env flags, and downstream usage are not approved.

**Numbering note:** Decision #034 is used by the M1.2.e Football Enrichment Read-Only Dry-Run Scope track. Decision #020 remains intentionally untouched in this PR. Historical decisions are not renumbered.

**Context:** M1.2.e Football Enrichment Endpoint Evidence is DONE via PR #107. SportMonks fixture-by-ID is the preferred future candidate family, but canonical-linked enrichment requires a SportMonks provider link that maps to a BetTracker canonical fixture.

Production DB has been verified by the operator/CPO:

```txt
fixture_provider_links contains:
- 2 api_football / exact rows
- 0 sportmonks rows
```

New blocker:

```txt
No exact/high SportMonks provider link exists for canonical fixture 1576052.
```

Therefore:

```txt
No SportMonks link -> no canonical enrichment.
No canonical enrichment -> no write.
No write -> no Analyst/Scout/UI.
```

**Decision:** Insert M1.2.e.2 SportMonks canonical fixture mapping before any canonical-linked football enrichment dry-run, enrichment write, or downstream Scout/Analyst/UI usage.

**M1.2.e.2 roadmap:**

- 2.5.a Mapping Scope / Evidence - docs only
- 2.5.b Read-only mapping discovery - separate CPO approval
- 2.5.c Controlled provider link write - only if exact/high confidence
- 2.5.d Mapping validation record

**Dry-run distinction:**

- SHAPE-ONLY / UNBOUND dry-run may validate SportMonks response shape using a native SportMonks fixture ID. It cannot write, cannot attach to a canonical fixture, cannot unlock enrichment writes, and cannot unlock Scout/Analyst/UI.
- CANONICAL-LINKED dry-run requires an exact/high SportMonks provider link. Only then can enrichment evidence be tied to `canonical_fixture_id`.

**Non-use:** This decision does not approve runtime code, provider calls, migrations, Supabase writes, env flags, enrichment writes, Scout usage, Analyst usage, UI usage, Place Bet, probability, implied probability, edge, EV, recommendation, or betting signal.

**FP-001:** SportMonks mapping evidence is not model probability, edge, EV, recommendation, or Scout/Analyst signal. Provider-link availability does not close FP-001 by itself.

Reference: `docs/sportmonks-canonical-fixture-mapping-scope-m1-2-e.md`

---

## Decision #036 - Decision Ledger / Numbering Governance
**Date:** 2026-07-07
**Proposed by:** CPO + Founder
**Status:** Documentation/status governance only. Runtime work, provider calls, migrations, writes, and downstream usage are not approved.

**Context:** Multiple documentation PRs have been moving in parallel, and decision-number gaps/reservations created ambiguity. The current merged ledger contains Decision #018, leaves Decision #020 absent, records Decision #032 as reserved by the parallel M1.3 API-Football `/odds/mapping` filter evidence track, and has occupied Decisions #033 through #035.

**Decision:** BetTracker will maintain a decision-ledger governance document that records occupied, reserved, missing, and next-planned decision numbers so future PRs do not guess.

**Current governance state:**

- Decision #018 exists.
- Decision #020 is absent and must not be opportunistically backfilled.
- Decision #032 is reserved for the parallel M1.3 API-Football `/odds/mapping` filter evidence track.
- Decision #034 is occupied by M1.2.e Football Enrichment Read-Only Dry-Run Scope.
- Decision #035 is occupied by M1.2.e.2 SportMonks Canonical Fixture Mapping Scope.
- Decision #036 is occupied by this Decision Ledger / Numbering Governance entry.
- Decision #037 is occupied by M1.2.e.2.b Read-Only SportMonks Mapping Discovery Scope.

**Rules:**

- Scan `docs/decisions.md` and the decision ledger before assigning a new decision number.
- Do not use placeholder decision numbers such as `#0XX`.
- Do not close historical gaps such as Decision #020 without a dedicated governance decision.
- Do not renumber historical decisions.
- Parallel PRs that need decision numbers must reserve numbers explicitly in the ledger.
- If a reserved decision is abandoned, a docs/status governance update must release or reassign it.

**Non-use:** This governance decision does not approve runtime code, provider calls, migrations, Supabase writes, env flags, enrichment writes, Scout usage, Analyst usage, UI usage, Place Bet, probability, implied probability, edge, EV, recommendation, or betting signal.

Reference: `docs/decision-ledger-numbering-governance.md`

---

## Decision #037 - M1.2.e.2.b Read-Only SportMonks Mapping Discovery Scope
**Date:** 2026-07-07
**Proposed by:** CPO + Founder
**Status:** Documentation/status scope only. Runtime provider calls, provider-link writes, enrichment writes, migrations, env flags, and downstream usage are not approved.

**Context:** M1.2.e.2 SportMonks Canonical Fixture Mapping Scope is DONE and records that production has 2 `api_football` / exact provider links and 0 `sportmonks` links. Canonical fixture `1576052` has no exact/high SportMonks provider link. Because SportMonks fixture-by-ID requires a known SportMonks ID, it cannot be used for discovery.

**Decision:** BetTracker will define a read-only SportMonks mapping discovery scope before any SportMonks provider-link write or canonical-linked enrichment. Discovery must be based on canonical fixture data such as date, kickoff window, league/competition, season, participants/team names, and home/away assignment where available.

**Discovery rule:** Discovery is not `GET /v3/football/fixtures/{ID}` because the SportMonks fixture ID is unknown. Candidate endpoint families such as fixtures by date or fixtures between dates require separate endpoint evidence before runtime.

**Request guardrails:** Any future runtime scope must use max 2 provider requests, page 1 only, stop if `paging.total > 1`, no page 2, no crawl, no broad search, no fallback endpoint calls, and no retries without separate approval.

**Token redaction:** SportMonks `api_token` is query-param based and must be redacted from logs, reports, Vercel, Sentry, docs, PR bodies, errors, URLs, screenshots, and console output. If redaction cannot be guaranteed, abort before provider call.

**Confidence:** Only exact/high mapping confidence may become eligible for a later controlled provider-link write. Not-found, ambiguous, medium, needs_review, or failed results write zero rows and keep mapping blocked.

**Non-use:** This decision does not approve runtime code, provider calls, provider-link writes, enrichment writes, migrations, Supabase writes, env flags, Scout usage, Analyst usage, UI usage, Place Bet, probability, implied probability, edge, EV, recommendation, or betting signal.

**FP-001:** Mapping discovery is identity evidence only. It is not model probability, edge, EV, recommendation, Scout signal, Analyst signal, UI signal, or betting signal.

Reference: `docs/sportmonks-mapping-discovery-scope-m1-2-e-2-b.md`

---

## Decision #038 - M1.2.e.2.b.1 SportMonks Mapping Discovery Endpoint Evidence Scope
**Date:** 2026-07-07
**Proposed by:** CPO + Founder
**Status:** Documentation/evidence scope only. Runtime provider calls, final runtime request shape, API routes, migrations, provider-link writes, enrichment writes, env flags, and downstream usage are not approved.

**Context:** Decision #037 defines the future read-only SportMonks mapping discovery scope but keeps runtime blocked because the exact SportMonks endpoint evidence is not yet confirmed. Discovery must not use `GET /v3/football/fixtures/{ID}` because the SportMonks fixture ID is unknown.

**Decision:** BetTracker will collect sanitized official SportMonks docs/account evidence before proposing any mapping discovery runtime. This evidence scope must compare the fixtures-by-date and fixtures-between-dates endpoint families and record the request parameters, filters, pagination, response shape, quota/request cost, rate limits, plan availability, and token-redaction requirements needed for a later runtime scope.

**Runtime stance:** This decision does not approve a SportMonks call and does not propose a final runtime request shape. Any later runtime request must be a separate CPO-approved scope after endpoint evidence is documented.

**Required evidence:** The evidence checklist must cover exact endpoint paths, supported filters, league/season server-side versus client-side filtering, pagination mechanism, exact total-equivalent field name, page size/per-page behavior, fixture ID field, participants availability, home/away markers, `starting_at` and timezone behavior, league/season/state fields, freshness/update fields, include syntax for participants, league, season, and state, quota/request cost, rate limits, plan availability, and `api_token` redaction requirements.

**Token redaction:** SportMonks `api_token` must never appear in logs, Vercel, Sentry, reports, docs, PR body, copied URLs, errors, console output, or screenshots. Any URL must be shown only with `?api_token=[REDACTED]`.

**Non-use:** This decision does not approve runtime code, provider calls, API routes, migrations, Supabase writes, provider-link writes, enrichment writes, env flags, Scout usage, Analyst usage, UI usage, Place Bet, probability, implied probability, edge, EV, recommendation, or betting signal.

**FP-001:** Endpoint evidence is not identity confidence, model probability, edge, EV, recommendation, Scout signal, Analyst signal, UI signal, or betting signal.

Reference: `docs/sportmonks-mapping-discovery-endpoint-evidence-scope-m1-2-e-2-b-1.md`

---

## Decision #039 - odds_snapshots_public Curated View Status Reconciliation & Working-Tree Hygiene
**Date:** 2026-07-07
**Proposed by:** CPO + Founder
**Status:** Documentation/status governance only. No new runtime code, provider calls, or writes are approved.

**Context:** PR #84 merged migration `supabase/migrations/015_odds_snapshots_public_view.sql` (curated read-only view over `odds_snapshots`) together with the M1.2.b fixture dry-run design spec. An operator/CPO-verified production check on 2026-07-07 confirmed: the view already exists in production, `odds_snapshots` contains 0 rows, and the view's privilege posture matches the migration (REVOKE ALL from PUBLIC/anon/authenticated, GRANT SELECT to authenticated only). Earlier odds decisions (#011-#016) recorded "no migrations" scope controls for M1.3 evidence PRs; this entry reconciles the ledger with production reality instead of leaving the applied view unrecorded.

**Decision:** The `odds_snapshots_public` curated view is ACCEPTED as tracked schema (migration 015). It is display-shape preparation only. User-facing odds usage remains BLOCKED: no UI reads the view, no Scout/Analyst usage, and no probability, implied probability, edge, EV, or recommendation may be derived from it. The first user-facing consumer of the view requires a separate CPO-approved decision.

**Working-tree hygiene recorded by the same governance PR:**
- Untracked `supabase/migrations/013_sports_data_foundation_fixed.sql` deleted after production verification: `football_enrichment.fixture_provider_link_id` FK is ON DELETE CASCADE in production (`pg_constraint.confdeltype = 'c'`), proving tracked 013 (+014) matches production; the `_fixed` variant was a review artifact. The 013-variant drift question is CLOSED.
- Untracked stale duplicate `docs/PRODUCT_VISION_GAP.md` deleted; root `PRODUCT_VISION_GAP.md` is authoritative and newer.
- Research/context docs committed as explicitly NON-ledger records: `docs/DECISION_2026-07-01_PROVIDER_AND_SCOPE.md` (annotated), `docs/SPORTS_DATA_PROVIDER_EVALUATION.md`, `docs/SPORTS_DATA_PROVIDER_EVALUATION_RU.md`, `docs/TENNIS_TRACK_API_NOTES.md`, `docs/superpowers/plans/2026-06-29-scout-web-search-hardening.md`.
- `.gitignore` extended with `.env*` and `bettracker/` (nested legacy prototype repo with its own remote).
- Legacy Supabase project `jbwgbjhejtraopzixjnf` lockdown on 2026-07-07: broken `global_config` RLS policies (`read: SELECT`, `write: ALL` to authenticated) dropped and RLS confirmed enabled with zero policies — the stored Anthropic key is no longer readable by any client role. Anthropic key rotation and project downgrade/pause remain founder dashboard actions.

**Reservation:** Decision #038 is reserved by the parallel M1.2.e.2.b.1 SportMonks Mapping Discovery Endpoint Evidence Scope track (PR #112). The next free unreserved number after this entry is #040.

**Provider-strategy contradiction (OPEN):** `docs/DECISION_2026-07-01_PROVIDER_AND_SCOPE.md` declares api-sports.io across six sports without SportMonks and states the plan is paid, while the tracked split strategy (`DATA_PROVIDER_DECISION.md`, Decisions #031-#037) uses SportMonks for enrichment/mapping and Decision #014 recorded an operator-observed Free/100-requests-day plan. A dedicated governance decision must reconcile provider strategy and confirm the actual API-Sports plan/quota before any quota-dependent runtime scope is approved.

**Non-use:** This decision does not approve runtime provider calls, odds ingestion, odds writes, user-facing odds, enrichment writes, env flags, Scout usage, Analyst usage, UI usage, Place Bet, probability, implied probability, edge, EV, recommendation, or betting signal.

**FP-001:** The view exposes stored odds display fields only. Odds display is not probability, edge, EV, or recommendation.

---

## Decision #040 - M1.2.e.2.b.1 SportMonks Mapping Discovery Endpoint Evidence Record
**Date:** 2026-07-07
**Proposed by:** CPO + Founder
**Status:** Documentation/evidence record only. Runtime provider calls, final runtime request shape, API routes, migrations, provider-link writes, enrichment writes, env flags, and downstream usage are not approved.

**Context:** Decision #038 required sanitized official SportMonks docs evidence before any mapping discovery runtime proposal. Evidence was collected on 2026-07-07 from official SportMonks documentation pages only. ZERO SportMonks API calls were made and no `api_token` was used or exposed.

**Decision:** BetTracker records the official SportMonks Football API v3 endpoint evidence in `docs/sportmonks-mapping-discovery-endpoint-evidence-m1-2-e-2-b-1.md`, answering every question in the Decision #038 checklist.

**Key confirmed facts:**
- Endpoint paths: `GET /v3/football/fixtures/date/{YYYY-MM-DD}` and `GET /v3/football/fixtures/between/{start}/{end}` (max 100 days); the between-for-team variant requires a SportMonks team ID BetTracker does not have.
- Server-side league filter is documented on both endpoints: `filters=fixtureLeagues:{ids}`. A season filter target is listed but its literal spelling is unconfirmed.
- **v3 pagination has NO total/total_pages field** (removed from v2). The Decision #037 guardrail "stop if `paging.total > 1`" must be restated in the 2.5.b.2 runtime scope as: request page 1 with `per_page=50`, stop/flag AMBIGUOUS if `pagination.has_more === true`.
- Includes `participants;league;season;state` are valid on these endpoints; participants carry `meta.location` = home/away; includes cost zero extra rate-limit units.
- All datetimes are UTC by default; the `timezone` parameter changes the DATE BUCKET on fixtures-by-date and must be OMITTED by the future runtime so the date bucket matches `kickoff_at` UTC.
- Authentication supports an `Authorization` header (raw token) in addition to the `api_token` query parameter — header auth keeps the token out of URLs entirely and is recommended for the future runtime; `redactUrl()` remains defense-in-depth. `401` = bad token; `403` = feed not in the subscription plan.
- Rate limits are per entity per hour by plan tier (Starter 2,000 / Growth 2,500 / Pro 3,000 / Enterprise 5,000); each HTTP request costs exactly 1 unit regardless of includes.

**Open coverage gate (blocking runtime approval):** fixtures-by-date returns only fixtures from the subscription's selected leagues. The discovery targets are in the Welsh Premier League. The founder must confirm in my.sportmonks.com that the subscription covers that league (and record the plan tier) before any 2.5.b.3 runtime approval; otherwise discovery would return a false NOT FOUND. The SportMonks league ID for the Welsh Premier League is also still unknown and must be obtained without unapproved provider calls.

**Non-use:** This decision does not approve runtime code, provider calls, API routes, migrations, Supabase writes, provider-link writes, enrichment writes, env flags, Scout usage, Analyst usage, UI usage, Place Bet, probability, implied probability, edge, EV, recommendation, or betting signal.

**FP-001:** Endpoint evidence is not identity confidence, model probability, edge, EV, recommendation, Scout signal, Analyst signal, UI signal, or betting signal.

Reference: `docs/sportmonks-mapping-discovery-endpoint-evidence-m1-2-e-2-b-1.md`

---

## Decision #041 - SportMonks Plan Coverage Gate Result & Discovery Re-Target
**Date:** 2026-07-07
**Proposed by:** CPO + Founder
**Status:** Documentation/status only. Runtime provider calls, API routes, migrations, writes, env flags, and downstream usage are not approved.

**Context:** Decision #040 left one gate OPEN: confirm in my.sportmonks.com that the subscription covers the discovery targets' league (Welsh Premier League / Cymru Premier). The founder verified the dashboard on 2026-07-07 (screenshots; zero API calls): plan is Football API **Starter** with 2,000 API calls (per entity per hour), 22 leagues via base + "17 Extra Leagues" add-on, plus Euro Club Tournaments / International Tournaments / World Cup 2026 add-ons. League IDs were captured (e.g. Scotland Premiership 501, Bundesliga 82, La Liga 564).

**Gate result: FAILED.** Cymru Premier is not in the plan and is not offered in the dashboard league picker catalog at all, so it cannot be added on the current plan structure. Per Decision #040, fixtures-by-date returns only subscription leagues — discovery for the current Welsh targets would return a guaranteed false NOT FOUND.

**Decision:** The mapping discovery track re-targets to a league covered by both providers: **England Premier League (primary)**, Scotland Premiership 501 (backup). The Welsh canonical fixtures and their `api_football` links remain in the database untouched; they stop being the discovery targets. Decision #037's guardrails, confidence rubric, and token-redaction rules remain fully in force; only its target selection is superseded by the sequence below.

**Required sequence (each step separately approved):** (1) founder captures SportMonks league IDs for England PL/Championship from the dashboard; (2) separate CPO-approved API-Football read-only dry-run for one future EPL match date (also requires closing the API-Football plan/quota question left OPEN by Decision #039); (3) controlled fixture write, max 2 fixtures, per the M1.2.c precedent; (4) a decision records the new canonical discovery targets; (5) 2.5.b.2 read-only discovery implementation scope with the page-1 guardrail restated on `pagination.has_more`; (6) 2.5.b.3 separate CPO runtime approval.

**Non-use:** This decision does not approve runtime code, provider calls (either provider), API routes, migrations, Supabase writes, provider-link writes, enrichment writes, env flags, Scout usage, Analyst usage, UI usage, Place Bet, probability, implied probability, edge, EV, recommendation, or betting signal.

**FP-001:** Coverage evidence and re-targeting are identity/scope decisions only, not model probability, edge, EV, recommendation, or any betting signal.

Reference: `docs/sportmonks-plan-coverage-gate-result-and-discovery-retarget-m1-2-e-2-b.md`

---

## Decision #042 - M1.2.e.2.b.2 API-Football EPL Dry-Run & Controlled Write Scope
**Date:** 2026-07-07
**Proposed by:** CPO + Founder
**Status:** Scope approved for operator execution. Write flag stays default OFF; the write itself is a single operator-gated call.

**Context:** Decision #041 re-targets mapping discovery to the England Premier League and requires new canonical fixtures via the validated API-Football fixture-sync path (M1.2.c precedent). PR #116 fixed the prerequisite adapter gap: league-filtered requests now require and send `season`, and multi-page responses throw a redacted `pagination overflow` error instead of silently truncating.

**Decision:** The operator may run single-day API-Football dry-run probes (league 39, season 2026, 1 request each, max 4 attempts) to find an EPL 2026-27 match day with 1-2 fixtures, then perform ONE controlled write for that day: single provider, single day, `SPORTS_FIXTURE_SYNC_WRITE_ENABLED` set only for that call and removed immediately after, `WRITE_FIXTURE_SYNC_M1_2_B` confirmation, scope cap 2 fixtures (operator-checked via `report.providers[0].fetched`; code cap 25). The operator also records the API-Football account plan name observed in the dashboard, closing the plan question left OPEN by Decision #039.

**Approval trail:** Founder/CPO granted blanket conversation approval on 2026-07-07 for the Decision #041 sequence; execution remains operator-gated by `SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN`. Runbook: `docs/sports-operator-runbook-m1-2-e-2-b-2.md`.

**Non-use:** This decision does not approve other leagues/seasons/providers, writes above 2 fixtures, odds/results/enrichment calls, env flags beyond the single write call, Scout usage, Analyst usage, UI usage, Place Bet, probability, implied probability, edge, EV, recommendation, or betting signal.

**FP-001:** Fixture identity is not a betting signal.

Reference: `docs/api-football-epl-dry-run-and-controlled-write-scope-m1-2-e-2-b-2.md`

---

## Decision #043 - M1.2.e.2.b.2 SportMonks Mapping Discovery Implementation Scope
**Date:** 2026-07-07
**Proposed by:** CPO + Founder
**Status:** Implementation merged via PR #117. Execution operator-gated (2.5.b.3). ZERO writes by construction.

**Context:** Decisions #037/#040/#041 define the read-only SportMonks mapping discovery: find the SportMonks fixture ID for canonical EPL fixtures without knowing that ID, within hard request/pagination/redaction guardrails.

**Decision:** BetTracker implements `POST /api/admin/sports/mapping/sportmonks-discovery` (PR #117). The approved scope is structurally pinned in the route schema: `dryRun: true`, provider `sportmonks`, `sportmonksLeagueId: '8'` (EPL per Decision #040 docs evidence), 1-2 canonical fixture UUIDs, max 2 provider requests, confirmation `RUN_SPORTMONKS_MAPPING_DISCOVERY_M1_2_E_2_B_2`. Guardrails enforced in code and tests: same-matchday targets share one `fixtures/date/{UTC}` request with `filters=fixtureLeagues:8`, `include=participants;league;state`, `per_page=50`; `pagination.has_more === true` stops the run and blocks mapping (v3 has no `total` field); the token travels only in the `Authorization` header; the `timezone` parameter is omitted so the date bucket stays UTC; match keys are read from `canonical_fixtures` + `fixture_provider_links.raw_provider_payload` at runtime; confidence rubric exact/high/medium/needs_review with ambiguity blocking; sanitized report only; `writes: "none"`.

**Execution:** After the Decision #042 write exists, the operator runs discovery per the runbook. Only a single exact/high candidate sets `eligibleForProviderLink: true`; everything else blocks mapping with zero writes. The sanitized report is recorded in the ledger; a controlled provider-link write is a later, separately scoped decision.

**Approval trail:** Founder/CPO blanket conversation approval 2026-07-07; operator-gated by bearer token.

**Non-use:** This decision does not approve provider-link writes, enrichment calls or writes, page 2+, crawls, fallback endpoints, retries, Scout usage, Analyst usage, UI usage, Place Bet, probability, implied probability, edge, EV, recommendation, or betting signal.

**FP-001:** Mapping discovery is identity evidence only.

Reference: `docs/sportmonks-mapping-discovery-implementation-scope-m1-2-e-2-b-2.md`

---

## Decision #044 - M1.2.e.2.b.2 EPL Controlled Write & SportMonks Discovery Execution Record
**Date:** 2026-07-09
**Proposed by:** Founder (operator) + Claude
**Status:** Execution record. No new scope approved; the controlled provider-link write remains a separately scoped decision (#045 candidate).

**Context:** Decisions #042/#043 approved the operator-gated EPL dry-run/controlled-write sequence and the read-only SportMonks mapping discovery run. The founder executed both on 2026-07-09 per `docs/sports-operator-runbook-m1-2-e-2-b-2.md`, with Claude driving the calls under the founder's live supervision.

**Decision:** BetTracker records the execution results in `docs/sportmonks-discovery-execution-record-m1-2-e-2-b-2.md`:
- Dry-runs (3 of max 4): 2026-08-14 → 0 fixtures, 2026-08-15 → 0, **2026-08-21 → 1** (EPL 2026-27 opening day; write day selected).
- Controlled write: 1 canonical fixture + 1 `api_football` provider link inserted, 0 failures (run `fixture-sync-2026-07-09T04-41-34-153Z-ddowlgtd`); write flag removed and production redeployed immediately after.
- New canonical fixture `92afd570-399a-48b9-915a-e1ffaf52a71c`: Arsenal vs Coventry City, Premier League 2026-27 R1, kickoff 2026-08-21 19:00 UTC, `api_football:1557367` (exact).
- Discovery run `sportmonks-mapping-discovery-2026-07-09T04-58-46-908Z-8i1oc162`: 1 of 2 provider requests, page 1, `has_more: false`, single candidate at kickoff → **`matched` / `high` / `eligibleForProviderLink: true`** — SportMonks fixture **19722203** ("Arsenal vs Coventry City", league 8, season 28083). Zero writes (`writes: "none"`).

**Deviations recorded:** (D1) first write call ran before the env-flag redeploy propagated — `writeEnabled: false`, zero writes, one extra API-Football fetch consumed (total 5 requests, inside the approved 4-probe + 1-write envelope). (D2) production `SPORTMONKS_TOKEN` was invalid (two sanitized 401s, no budget consumed, no token leakage); replacement token validated out-of-band with one `leagues/8` metadata request from the operator machine, then env corrected. Both deviations and the operational hygiene follow-ups (delete local token scratch files incl. OneDrive copy; rotate operator token) are detailed in the execution record.

**Plan question CLOSED:** the founder reported the API-Football dashboard plan as **Ultra** (2026-07-09), closing the plan-name question left OPEN by Decisions #039/#042.

**Next step:** controlled provider-link write `sportmonks:19722203 → 92afd570-399a-48b9-915a-e1ffaf52a71c` (single `fixture_provider_links` row) — Decision #045 candidate; requires its own scope approval and implementation. Nothing is written manually.

**Non-use:** This decision does not approve provider-link writes, enrichment calls or writes, additional provider calls, page 2+, retries, odds usage, Scout usage, Analyst usage, UI usage, Place Bet, probability, implied probability, edge, EV, recommendation, or betting signal.

**FP-001:** Mapping discovery output is identity evidence only — not model probability, edge, EV, recommendation, or any betting signal.

Reference: `docs/sportmonks-discovery-execution-record-m1-2-e-2-b-2.md`

---

## Decision #045 - M1.2.e.2.b.3 Controlled SportMonks Provider-Link Write Scope
**Date:** 2026-07-09
**Proposed by:** Founder + Claude
**Status:** Scope approved for operator execution (founder conversation approval 2026-07-09). Write flag default OFF; the write itself is a single operator-gated call.

**Context:** Decision #044 recorded the discovery result for canonical fixture `92afd570-399a-48b9-915a-e1ffaf52a71c` (Arsenal vs Coventry City, PL 2026-27 R1, kickoff 2026-08-21 19:00 UTC): single candidate, confidence `high`, `eligibleForProviderLink: true` → SportMonks fixture `19722203`. Decision #043 requires the provider-link write to be separately scoped — this is that scope.

**Decision:** BetTracker implements `POST /api/admin/sports/mapping/provider-link` writing at most ONE `fixture_provider_links` row, both sides structurally pinned (zod literals + module constants): canonical `92afd570-…a71c` ↔ `sportmonks:19722203`, `mapping_confidence: high`, `mapping_method: name_time_match`, provenance-only `raw_provider_payload` (discovery run id + Decision #044 sanitized candidate). Guardrails: ZERO provider calls (evidence-based write, network asserted untouched in tests); triple write gate (`dryRun:false` + `SPORTS_PROVIDER_LINK_WRITE_ENABLED` env flag + confirmation `WRITE_SPORTMONKS_PROVIDER_LINK_M1_2_E_2_B_3`); operator bearer token (503/401); DB preflight re-verifies discovery preconditions at write time (fixture exists, football+scheduled, kickoff minute unchanged, api_football provenance link present, no conflicting sportmonks link in either direction) and blocks on drift; identical existing link short-circuits as idempotent `alreadyLinked` with zero writes; sanitized report only.

**Tests:** 10 new provider-safety cases (scope pinning, confirmation, auth, flag-off block, exact pinned row, idempotency, both conflict directions, kickoff drift) — suite 77/77, wired into CI per PR #119.

**Execution:** operator runbook in the reference doc (dry-run preflight → flag on → single write call → flag off → Claude verifies the row and records execution in the ledger).

**Non-use:** This decision does not approve enrichment calls or writes, odds calls/ingestion/usage, additional links, other fixtures/providers/leagues, page 2+, retries, Scout usage, Analyst usage, UI usage, Place Bet, probability, implied probability, edge, EV, recommendation, or betting signal.

**FP-001:** A provider-link row is identity evidence only — not model probability, edge, EV, recommendation, or any betting signal.

Reference: `docs/sportmonks-provider-link-write-scope-m1-2-e-2-b-3.md`

---

## Decision #046 - M1.2.e.2.b.3 Provider-Link Write Execution Record
**Date:** 2026-07-10
**Proposed by:** Founder (operator) + Claude
**Status:** Execution record. No new scope approved.

**Context:** Decision #045 approved the controlled single-row provider-link write (implementation PR #125). The founder executed it on 2026-07-10, with Claude driving the calls and — at the founder's live instruction — the Vercel dashboard steps (token-rotation redeploy, flag deletion, post-deletion redeploy) via the founder's authenticated browser.

**Decision:** BetTracker records the execution results in `docs/sportmonks-provider-link-write-execution-record-m1-2-e-2-b-3.md`:
- Preflight dry-run: all 6 checks passed, `alreadyLinked: false`, zero writes (run `…vryd3pd4`).
- Write: **1 `fixture_provider_links` row inserted, 0 failures** (run `sportmonks-provider-link-write-2026-07-10T14-13-04-277Z-mkuvx3k4`); row verified in production immediately after.
- Canonical fixture `92afd570-…a71c` (Arsenal vs Coventry City, kickoff 2026-08-21 19:00 UTC) now carries BOTH provider links: `api_football:1557367` (exact) + `sportmonks:19722203` (high, name_time_match, provenance → discovery run `…8i1oc162`). **First complete dual-provider mapping chain — the M1.2 mapping path is proven end-to-end.**
- **ZERO provider calls** in the entire execution (`providerRequestsUsed: 0` in both reports).
- `SPORTS_PROVIDER_LINK_WRITE_ENABLED` deleted + production redeployed immediately after the write.

**Deviations recorded:** (D3) the write flag had been pre-set to `true` by the founder on 2026-07-09 (ahead of the runbook's flag-on step, after the PR #125 merge summary) — gate ordering deviation only; the token + pinned body + confirmation + DB preflight still gated the write. Operator token rotated as planned Decision #044 hygiene (old OneDrive-exposed token dead); two costless 401s during propagation.

**Non-use:** This decision does not approve further provider-link writes, enrichment calls or writes, odds calls/ingestion/usage, Scout usage, Analyst usage, UI usage, Place Bet, probability, implied probability, edge, EV, recommendation, or betting signal.

**FP-001:** A provider-link row is identity evidence only — not model probability, edge, EV, recommendation, or any betting signal.

Reference: `docs/sportmonks-provider-link-write-execution-record-m1-2-e-2-b-3.md`

---

## Decision #047 - Atomic Financial Writes & No-Overdraft Policy
**Date:** 2026-07-10
**Proposed by:** CPO (full audit 2026-07-10) + Founder
**Status:** EXECUTED 2026-07-10. CPO final accept on head `fc1bcd9`; migration applied via Supabase migration tooling and verified (definitions, index, privileges); PR #127 merged (production `1e197f6`); controlled smoke on a dedicated test account passed 7/7 (deposit, exact replay, payload conflict, over-withdrawal block, adjustment rejection, currency sync both ways, balance/transaction integrity). Execution record: `docs/atomic-financial-writes-execution-record-047.md`. Next free decision number: #048.

**Context:** The CPO audit found the risk profile inverted: provider safety is now stronger than the financial write boundaries. P0 items — `/api/bankroll/deposit` was non-atomic (read → compute → update → separate insert; returned success even when the transaction insert failed; concurrent requests could overwrite each other), `create_quick_bet()`/`place_bet_from_decision()` deducted stakes unconditionally (production holds one negative bankroll), `/api/settings` synced currency as an unchecked second write. Audit claims verified against code and `pg_policies` before implementation.

**Decision:** BetTracker adopts the no-overdraft policy (a bet or withdrawal can never take a bankroll below 0; negative balance is not a credit limit; overdraft is not a product feature) and ships migration `016_atomic_financial_writes.sql` + route changes:
- `adjust_bankroll()` — the only approved user deposit/withdrawal path: `FOR UPDATE` row lock, funds guard, balance update + transaction insert in one DB transaction; strict payload-bound idempotency (UUID key REQUIRED; same key + different type/amount/note → `Idempotency conflict`, HTTP 409, zero writes); `previous_balance` audit metadata. User-callable `adjustment` removed per CPO review — operator reconciliation is a separate future controlled flow.
- `set_user_currency()` — atomic profiles + default-bankroll currency sync with an exactly-one-row invariant (zero/multiple default bankrolls raise and roll the profile update back); `/api/settings` fails loudly on sync failure.
- Funds guards in both bet RPCs: conditional locked subtraction (`... AND balance >= stake`), `Insufficient balance` exception rolls back the whole bet flow. Concurrent operations serialize on the row lock — overspend impossible by construction.
- `/api/bankroll/deposit` → single RPC call, sanitized 422/404/500 error mapping, client idempotency key per form session.
- Historical negative bankroll: preserved, `reconciliation_required`; stakes/withdrawals blocked automatically by the guards, deposits open for repair; NO automatic zeroing; hard `CHECK (balance >= 0)` deliberately deferred until after reconciliation.
- CPO review round on PR #127 incorporated before apply: strict required-UUID idempotency with payload binding and 409 conflict; client no-op + refresh on `replayed`; exactly-one-bankroll currency invariant; user-callable `adjustment` removed; route/DB limit parity; quoted YAML step name.
- UI: shared `lib/money.ts` — negative P&L keeps its minus sign (audit item 7), Linked Bet stake uses the bankroll currency instead of hardcoded `$`.

**Tests:** new `test:financial-safety` suite (15 cases) wired into CI alongside provider-safety/FP-001; migration static guards prevent silently dropping the row lock, funds guards, or idempotency index. DB-level concurrency is enforced by construction; live concurrency tests deferred to the #048 verification pass.

**Sequencing:** direct DML on financial tables is NOT revoked here — Decision #048 (Enforce Domain Write Boundaries) lands only after every active caller is on these RPCs and 016 is applied, deployed, and production-smoked.

**Non-use:** This decision does not approve provider calls, enrichment, odds work, RLS changes, settlement changes, or automatic repair of the historical negative bankroll.

**FP-001:** Financial integrity work only — no probability, edge, EV, recommendation, or betting signal surface is touched.

Reference: `docs/atomic-financial-writes-scope-decision-047.md`

---

## Decision #048 - Core Domain Write Boundaries
**Date:** 2026-07-10
**Proposed by:** CPO (audit + preflight corrections) + Founder
**Status:** EXECUTED 2026-07-10. CPO final accept on head `5d3bfb4`. 017 applied + verified → PR #129 merged (production `66aa980`) → new paths verified → 018 applied (fail-closed preflight passed) → post-018 privileges verified (authenticated 0 non-SELECT incl. MAINTAIN, anon 0, one FOR SELECT policy/table, both Analyst RPCs EXECUTE=false for authenticated) → bypass verification under the authenticated role: **10/10 denied** (8 direct DML + 2 Analyst RPCs), own reads work, cross-user reads 0 rows, approved RPCs still work, state invariant after every attempt; blocked-Analyst placement rejected with `decision_not_placeable`. `smoke-047` deleted (cascade verified). Execution record: `docs/domain-write-boundaries-execution-record-048.md`. Next free decision number: #049.

**Context:** Production inventory confirmed the audit: all seven core tables (`profiles`, `bankrolls`, `bankroll_transactions`, `bets`, `bet_legs`, `decisions`, `ai_analysis_runs`) carry `FOR ALL` policies and BOTH `anon` and `authenticated` hold the full table privilege set — multi-tenancy is protected, domain invariants are not. CPO preflight added two mandatory corrections: (1) `profiles` joins the scope — direct profile writes could desync `profiles.currency` from the default bankroll, re-breaking the Decision #047 invariant; (2) `create_decision_with_analysis()` is a user-callable FP-001 bypass — it accepts client-supplied model_probability/implied_probability/edge_percent/recommendation and persists them as `ai_analyst` output while skipping the `/api/ai/analyst` quality gate.

**Decision:** Two-phase boundary enforcement:
- **Phase A (`017_prepare_domain_write_boundaries.sql`, additive):** `persist_analysis_decision(p_user_id, …)` — server-only Analyst persistence, EXECUTE for `service_role` ONLY, `p_user_id` derived exclusively from the authenticated server session; `save_user_settings(…)` — atomic profile settings + default-bankroll currency sync (Decision #047 invariant preserved); `complete_onboarding()`. Routes move in the same PR (`/api/ai/analyst` → admin client, `/api/settings` → single RPC, `/api/onboarding/complete` → RPC), old paths stay alive until Phase B → zero downtime.
- **Phase B (`018_enforce_domain_write_boundaries.sql`, enforcement):** for each core table — `REVOKE ALL` from PUBLIC/anon, `REVOKE INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` from authenticated, `GRANT SELECT`, `FOR ALL` policy replaced by a `FOR SELECT` own-rows policy (production ownership quals preserved, `bet_legs` via parent bet); `create_decision_with_analysis` loses user EXECUTE (kept, dropped later); NO `FORCE ROW LEVEL SECURITY`; `service_role` untouched. Emergency rollback prepared in `docs/decision-048-rollback.sql` (never applied automatically).
- Bypass verification with the retained `smoke-047` account (SAVEPOINT-per-denial), then the account is deleted.

**CPO review round (PR #129) incorporated:** (P1) `REVOKE ALL` + `GRANT SELECT` per table — an enumerated revoke list would leave PostgreSQL 17's `MAINTAIN` privilege behind (prod ACLs = `arwdDxtm`); (P1) `place_bet_from_decision` hardened — pending-only + AI trust gate (`quality_gate.pricingAllowed` AND `trust_view.showPlaceBet` must be `true` for `ai_analyst` decisions; missing/legacy runs fail closed → `decision_not_placeable`, zero writes) — closes the Place-Bet trust-gate RPC bypass; (P1) `update_decision_action` reads the current action `FOR UPDATE` — closes the race against concurrent placement; 018 opens with a fail-closed Phase-A preflight `DO` block (raises before any REVOKE if 017's functions/EXECUTE surfaces are absent); rollback made transactional (`BEGIN`/`COMMIT`); new required CI job `Typecheck & lint`; direct-write sweep now recursive over `app/**/*.ts(x)`.

**Tests:** CI suite `test:domain-write-boundaries` (13 cases after the review round). Settings-route write contract moved there from the financial-safety suite. All suites green: boundaries 13/13, financial 10/10, provider-safety 77/77, FP-001 26/26, tsc clean.

**Recorded OPEN (not silently included):** `market_opportunities` (`FOR ALL` policy granted to role `{public}`; Scout writes directly) and `coaching_sessions` (user-callable INSERT) — separate trust-domain decision before external beta.

**Non-use:** This decision does not approve enrichment, odds, provider calls, FP-001 gate changes, market_opportunities/coaching_sessions changes, or dropping the legacy Analyst RPC.

**FP-001:** Closes a real FP-001 bypass (client-supplied pricing via RPC). No pricing surface is added.

Reference: `docs/domain-write-boundaries-scope-decision-048.md`

---

## Decision #049 - Agent Write Boundaries (Scout & Coach)
**Date:** 2026-07-10
**Proposed by:** Founder + Claude (continuation of the #048 boundary track)
**Status:** EXECUTED 2026-07-10. CPO final accept on head `2ac01e0` (after two review rounds: VADE policy-drift fix, then CPO state-machine/preflight/error hardening). 019 applied + verified → PR #131 merged (production `004ce3c`) → new paths verified (Scout persist forced pricing NULL) → state-machine behavioral 7/7 (link_required, invalid_link, link_not_allowed, invalid_status, valid conversion, idempotent repeat, terminal invalid_transition) → 020 applied (fail-closed preflight passed) → post-020 privileges verified (authenticated 0 non-SELECT incl. MAINTAIN, anon 0, one FOR SELECT policy/table) → bypass 8/8 denied (6 direct DML + 2 server-only persist RPCs), own reads work, cross-user 0, approved update_opportunity_status still works. `smoke-049` + cross-user account deleted (cascade verified). **Completes the DB write-boundary track: #047 + #048 + #049 — no domain table remains directly writable by an authenticated user.** Execution record: `docs/agent-write-boundaries-execution-record-049.md`. Next free decision number: #050.

**Context:** Decision #048 recorded `market_opportunities` and `coaching_sessions` as OPEN. Production inventory confirmed: `market_opportunities` has a `FOR ALL` policy **granted to role `public`** (worse than the core tables) with full `anon`+`authenticated` privileges and direct Scout insert + status-update writes; `coaching_sessions` has a user-callable INSERT policy with full privileges and a direct Coach insert. Both are agent-generated content — the same server-only-persistence shape as the Analyst closed in #048.

**Decision:** Extend the #048 two-phase pattern to both tables:
- **Phase A (`019_prepare_agent_write_boundaries.sql`, additive):** `persist_market_opportunities(p_user_id, p_rows)` and `persist_coaching_session(p_user_id, …)` — server-only (service_role EXECUTE only), `p_user_id` from the authenticated session; the Scout persist RPC **forces `model_probability`/`implied_probability`/`edge_percent` to NULL** regardless of input (FP-001 defense-in-depth, matching PR #122) and caps batches at 25. `update_opportunity_status(p_opportunity_id, p_status, p_linked_decision_id)` — authenticated user action, `auth.uid()`-scoped, status enum validated, linked-decision ownership checked. Routes move in the same PR (Scout → admin client; Scout status → RPC; Coach → admin client); old paths stay alive until Phase B.
- **Phase B (`020_enforce_agent_write_boundaries.sql`):** fail-closed Phase-A preflight, then for both tables `REVOKE ALL` from PUBLIC/anon/authenticated (covers PG17 MAINTAIN) + `GRANT SELECT` + drop the legacy policies (`Users see own opportunities` FOR ALL/public; `coaching_sessions_insert`) + `FOR SELECT` own-rows policies. No FORCE RLS; service_role untouched. Rollback in `docs/decision-049-rollback.sql` (transactional, manual-only).

**Tests:** new CI suite `test:agent-write-boundaries` (10 cases). All suites green: agent 10/10, domain 13/13, financial 10/10, provider-safety 77/77, FP-001 26/26, tsc/lint clean.

**Non-use:** No enrichment, odds, provider-call changes, FP-001 gate changes, changes to the seven #048 core tables, or Scout/Coach model changes.

**FP-001:** Hardens a real FP-001 surface — the Scout persist RPC structurally forces pricing to NULL even if a future caller supplies it.

Reference: `docs/agent-write-boundaries-scope-decision-049.md`

---

## Decision #050 - Registration Invite Flow (pre-hijack fix)
**Date:** 2026-07-10
**Proposed by:** Founder (product choice) + Claude
**Status:** PARTIALLY EXECUTED 2026-07-10 (CPO accept). Migration 021 applied + verified (enum += invited, invited_at, 3 existing rows intact) → PR #133 merged (production `60cb28c`) → live routes verified server-side: register non-allowlisted → neutral 200 with 0 stray beta_access/auth.users rows (no enumeration, no side effects), password-in-body ignored, invalid email 400, complete-invite unauth 401, set-password reachable. **The SMTP email round-trip is PENDING a founder test** (approve test email → request → receive → click → set password → dashboard; verify approved→invited→used; verify non-allowlisted gets neutral msg + NO email; verify Supabase Invite template action link + "Enable email signups" OFF) — cannot be automated. Execution record: `docs/registration-invite-flow-execution-record-050.md`. Next free decision number: #051.

**Context:** CPO audit P1 (the last remaining P1) — `/api/auth/register` created a user with `email_confirm: true` and a caller-supplied password without proving email ownership, so anyone who knew an allowlisted address could pre-register it and hijack the invited account. Founder product decision (2026-07-10): **invite + set-password flow** (Supabase `inviteUserByEmail`).

**Decision:** Registration becomes an email-only, allowlist-gated invite request:
- `POST /api/auth/register` (email only, no password) → rate-limit + allowlist; only `approved`/`invited` proceed; sends `inviteUserByEmail(email, { redirectTo: /auth/callback?next=/auth/set-password })`; marks the row `invited`. **Every branch returns ONE neutral message** ("an invite link is on its way") — closes allowlist enumeration.
- Ownership proof: the invite email reaches only the real mailbox; an attacker can at most cause an email to be sent to the real owner, never receive the link → pre-hijack closed.
- `/auth/callback` honours a same-origin `next` param (open-redirect guarded).
- `/auth/set-password` (new, session-gated) sets the password via `updateUser`, then calls `POST /api/auth/complete-invite` (authenticated) which marks `beta_access` `used` — consumed only after ownership + intent are proven; idempotent per user; 403 for foreign/revoked.
- Migration 021: widens `beta_access.status` CHECK to include `invited`, adds `invited_at`. Lifecycle `approved → invited → used`.
- The password path (`createUser({ email_confirm: true, password })`) is removed; login Register tab is now email-only.

**Tests:** new CI suite `test:auth-invite` (17 cases). All suites green: auth 17/17, agent 12/12, domain 13/13, financial 10/10, provider-safety 77/77, FP-001 26/26, tsc/lint clean, full `next build` OK.

**Execution requirement:** `inviteUserByEmail` uses Supabase SMTP (already configured — magic-link works). A real email round-trip must be tested by the founder (approve test email → request → receive → click → set password → dashboard; verify row `approved→invited→used`; verify a non-allowlisted email gets the neutral message and NO email) before production is trusted. Founder also verifies the Supabase Invite email template action link and keeps "Enable email signups" OFF.

**Non-use:** No change to password Sign-In or Magic-Link login, the allowlist admin process, or email-template design.

**FP-001:** N/A (auth/identity surface, no pricing).

Reference: `docs/registration-invite-flow-scope-decision-050.md`

---

## Decision #051 - FP-001 Legacy Pricing Quarantine
**Date:** 2026-07-10
**Proposed by:** CPO (audit item 5) + Claude
**Status:** EXECUTED 2026-07-10 (CPO accept, PR #135). Pre-apply refinement: `ai_analysis_runs` matched by non-null pricing VALUE not key presence (31 by key incl. 14 null-valued → 17 real), aligning with the reviewed 78. Migration 022 applied + verified: decisions 20→0, market_opportunities 41→0, ai_analysis_runs (non-null value) 17→0; `fp001_pricing_quarantine` = 78 rows (service-role only, RLS, 0 anon/auth grants); 14 runs retain null-valued keys (harmless). Execution record: `docs/fp001-legacy-quarantine-execution-record-051.md`. Next free decision number: #052.

**Context:** "Code is protected better than data." PR #122 stopped Scout/Coach from using legacy pricing and the gate blocks display, but fabricated pre-gate numbers still sit in the DB. Inventory (2026-07-10): 20 `decisions` (all ai_analyst, newest 2026-07-04), 41 `market_opportunities` (all rows, newest 2026-07-01), and 17 `ai_analysis_runs.output_json` (none carry a quality_gate) carry model/implied/edge. Pricing has been blocked on 100% of runs, so no verified pricing has ever existed — every value is fabricated. The UI hides them, but the raw values remain readable by future analytics/migration/Coach.

**Decision:** Migration `022_fp001_legacy_quarantine.sql` — backup + scrub (CPO's recommended option):
- Audit table `fp001_pricing_quarantine` (service-role only, RLS on, no anon/authenticated grants) preserves every scrubbed value (reversible).
- Back up **before** scrubbing, per surface: `decisions` + `market_opportunities` pricing columns → NULL; `ai_analysis_runs.output_json` model/implied/edge keys stripped.
- Cutoff guard `created_at < '2026-07-07'` (gate/PR #122 ship date) so re-running never scrubs a future verified row.
- Expected: 0 live readable pricing across all three surfaces; quarantine holds 20+41+17 = 78 rows.
- No live trust-marker column (the quarantine table is the audit record; post-scrub NULL already means "no trustworthy pricing"); no schema change to the pricing columns; values preserved, not deleted.

**Safety:** No read path breaks — Coach already ignores legacy edge_percent (PR #122), the Analyst/decision/Scout surfaces gate display on the quality gate (NULL → blocked surface, already what legacy rows show), analytics reads bet P&L not decision pricing.

**Tests:** new CI suite `test:fp001-quarantine` (5 static cases). Live before/after counts verified during execution.

**Non-use:** No gate change, no Scout/Coach/Analyst logic change, no deletion of the fabricated values, no live marker column.

**FP-001:** Directly closes the FP-001 data residue — removes the last place fabricated pricing is readable as if real.

Reference: `docs/fp001-legacy-quarantine-scope-decision-051.md`

---

## Decision #052 - Global (Durable) Rate Limits
**Date:** 2026-07-10
**Proposed by:** CPO (audit) + Claude
**Status:** EXECUTED 2026-07-10. CPO final accept on head `33ac046` (after two review rounds: VADE self-DoS drain → check-then-consume; CPO fail-closed limiter + per-key advisory lock + strict validation + IP hashing + neutral coach message + bounded cleanup; plus a Vercel deploy-miss re-triggered via empty commit `33ac046`). Migration 023 applied + verified: grants (RLS on, anon/auth 0 table access, RPC service_role only, advisory lock present) + live 20-call burst against the deployed function (limit 5/min+15/hour → 5 allowed, 15 denied, hour counter **5** not 20 — denied consume nothing). PR #137 merged (production `47cbff9`). Execution record: `docs/global-rate-limits-execution-record-052.md`. Next free decision number: #053.

**Context:** scanner/analyst/scout/coach/register rate-limited with an in-memory Map — per-instance on Vercel serverless (cold start resets, scaling multiplies the cap), so the Anthropic-spend and register-enumeration caps were not actually enforced across the fleet.

**Decision:** Postgres-backed shared counter (no new infra):
- Migration 023: `api_rate_limits` table (service-role only, RLS, 0 anon/auth grants) + `rate_limit_check(p_key, p_windows)` RPC (SECURITY DEFINER, service_role only) — fixed-window atomic counter (`INSERT … ON CONFLICT DO UPDATE count+1`), denies if any window over limit, `retry_after` = until longest-blocked window resets, ~1% opportunistic expired-bucket cleanup.
- Shared helper `lib/rate-limit.ts` `enforceRateLimit(key, windows)` — **fail-closed** on any limiter failure (RPC/store error or malformed response → `unavailable: true`; routes return 503 before any Anthropic spend or invite work). All keys are `sha256`-hashed before storage; register keys use a canonicalized client IP. `RATE_LIMITS` centralizes env-tunable windows (defaults unchanged: scanner 5/min+30/day, analyst 10/min+200/day, scout 3/min+50/day, coach 20/day, register 5/min+15/hour). *(Corrected post-merge: this bullet originally described the rejected pre-review fail-open draft; the CPO review reversed it before migration 023 was applied — see the execution record.)*
- All five routes drop the in-memory Map + local checkRateLimit and call the helper (AI routes key by user.id, register by client IP); 429 + Retry-After unchanged.

**Tests:** new CI suite `test:rate-limit` (12 cases at merged head `33ac046`: helper RPC call + mapping, FAILS CLOSED on RPC error / missing admin client / malformed responses, `canonicalClientIp` validation, config sanity, no-in-memory-Map source sweep across all five routes including the `unavailable → 503` branch, register canonical-IP keying, neutral Coach 429 message, and migration static guards including the per-key advisory lock plus two-phase check-then-consume). The auth-invite suite's obsolete in-memory 429 test was removed. All suites green: rate-limit 12/12, auth 16/16, agent 12/12, domain 13/13, financial 10/10, provider-safety 77/77, FP-001 26/26, quarantine 5/5, full build + tsc/lint clean. *(Corrected post-merge from the rejected pre-review "7 cases / fail-open" text.)*

**Non-use:** No limit-value change, no Redis/marketplace integration, no route logic change beyond the limiter call, no sliding-window.

**FP-001:** N/A (infra hardening).

Reference: `docs/global-rate-limits-scope-decision-052.md`

---

## Decision #053 — Project State & Migration Reconciliation
**Date:** 2026-07-11  
**Proposed by:** CPO + Lead Engineer  
**Approved by:** Founder/CPO scope approval  
**Status:** EXECUTED / CLOSED 2026-07-11. PR #139 squash-merged as `a925085`; production deployment READY. No runtime code, migrations, provider calls, Supabase writes, or environment changes were made by Decision #053.

**Decision:** Reconcile source-of-truth documentation with production reality through Decision #052, record migration drift without applying anything, and close superseded draft PRs without merging stale branches.

**Why:**
- `PROJECT_STATE.md` was last updated on 2026-07-07 and still claimed production had zero SportMonks links after Decisions #045–#046 had completed the controlled provider-link write.
- README still told operators to run only `001_initial_schema.sql`, despite tracked migrations through 023 and known bootstrap drift.
- Decision #052 retained rejected fail-open wording and an obsolete 7-test count, while the executed implementation is fail-closed with 12 cases.
- PR #90 and PR #106 remained open draft branches even though their numbering or evidence state was superseded.

**Scope:** Documentation/status/migration inventory and PR disposition only. No runtime code, migration application, Supabase writes, provider calls, environment changes, enrichment, odds calls, or betting signals.

**Reconciled facts:**
- Decisions #044–#046 completed the controlled EPL fixture, SportMonks discovery, and exact/high provider-link chain.
- Decisions #047–#049 completed atomic financial writes and removed direct authenticated writes from core and agent-domain tables.
- Decision #050 is deployed and route-verified, but its founder SMTP round-trip remains pending.
- Decision #051 quarantined 78 legacy FP-001 pricing records and removed readable fabricated pricing from live domain surfaces.
- Decision #052 deployed durable, fail-closed, cross-instance rate limits and passed a real parallel production contention test.

**Migration outcome:** No migration was applied. The missing 008 number, untracked historical objects, policy-name drift, review-only files, timestamped production ledger, and destructive 001 bootstrap risk are recorded in `docs/migration-state-reconciliation-053.md`.

**PR disposition:**
- PR #106 is closed as superseded; its `/odds/mapping` filter conclusion is already present in main.
- PR #90 is closed without merge; the policy is not adopted, Decision #020 is never reused, and any revival requires a fresh PR under #055 or later.

**Numbering:** Decision #054 is reserved for CSP Enforcement & CSP Report Hardening. Decision #020 and retired #032 are not reused.

**Consequences:**
- `PROJECT_STATE.md`, README, the numbering ledger, and migration reconciliation become the current operational documentation set.
- The enrichment identity blocker is removed; the remaining gate is explicit runtime approval plus trust validation.
- Decision #050's SMTP round-trip remains a visible founder action and is not falsely marked complete.
---

## Decision #054 — CSP Report Hardening & Security Headers, Phase A
**Date:** 2026-07-11
**Proposed by:** CPO + Lead Engineer
**Approved by:** CPO autonomous-window scope
**Status:** PHASE A IMPLEMENTED / AWAITING CPO REVIEW

**Decision:** Harden CSP report ingestion and add baseline HTTP security headers while keeping CSP in Report-Only mode.

**Why:**
- Production CSP reports violations but does not block them, which is appropriate for observation, while the old report endpoint accepted an unlimited raw body and logged `script-sample` plus unredacted URLs.
- The application lacked explicit `nosniff`, Referrer-Policy, X-Frame-Options, and Permissions-Policy headers.
- Enforcing CSP before classifying real sources and designing a Next.js-compatible nonce/hash strategy risks breaking hydration, authentication, analytics, or observability.

**Phase A:**
- bounded 32 KB request-body reader using both Content-Length preflight and streamed enforcement;
- legacy `application/csp-report` and Reporting API normalization;
- allowlisted, bounded structured fields with URL query/fragment removal;
- `script-sample`, raw payloads, cookies, credentials, and request headers are never logged;
- durable fail-closed rate limits through Decision #052;
- reviewed `204 / 400 / 413 / 415 / 429 / 503` route contract;
- baseline `X-Content-Type-Options`, Referrer-Policy, X-Frame-Options, and Permissions-Policy headers;
- CSP remains `Content-Security-Policy-Report-Only`; `unsafe-inline` remains unchanged.

**Phase B:** Not implemented. It requires production Report-Only evidence, source classification, a reviewed nonce/hash strategy, compatibility smoke for Next.js hydration/auth/Supabase/PostHog/Sentry, and separate CPO approval.

**Scope:** No migration, Supabase write, provider call, production environment change, enrichment, odds work, or betting-signal change. FP-001 remains active.

Reference: `docs/csp-security-hardening-scope-decision-054.md`
---

*Last updated: 2026-07-11*
*Owner: All (each role contributes)*
