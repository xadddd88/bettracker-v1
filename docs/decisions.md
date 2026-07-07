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

*Last updated: 2026-07-07*
*Owner: All (each role contributes)*
