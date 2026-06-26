# Sprint 2 Plan — Decision Intelligence MVP

> Level 3 Document. Engineering reference.  
> Status: **APPROVED — implementation may begin after docs patch commit**  
> CPO Review: approved, plan patched 2026-06-26 (two rounds)

---

## Goal

Prove the core product thesis:

> BetTracker AI is not a bet diary. It is a decision-making system.

A user should be able to get an AI-powered analysis of a betting opportunity, save it as a structured Decision, then place or skip — with the full loop recorded.

**Definition of Success:** User can go from "I'm looking at a match" → sport-aware AI Analyst analysis → saved Decision → placed or skipped, with every step linked in the database. Output language is user-selected.

---

## Pre-Sprint Gate

- [x] `npm run lint` — zero errors ✅ 2026-06-26
- [x] `npm run build` — zero errors ✅ 2026-06-26
- [x] Sprint 1 smoke test still passes on main ✅ 2026-06-26

---

## Scope: Core vs Optional

**Rule: Analytics v0 does not start until AI Analyst → Decision → Action loop works end-to-end.**

### Sprint 2 Core (required)

1. AI Analyst form (`/ai` page) — sport-aware, locale-aware
2. Analyst API (`POST /api/ai/analyst`) — sport module + rate limit + honesty rule
3. Save Decision + ai_analysis_run atomically via RPC
4. Decision detail page (`/decisions/[id]`)
5. Action buttons: Place Bet / Skip / Watch

### Sprint 2 Optional (starts only after Core is complete)

6. Analytics v0 (`/analytics`) — decision-centered metrics only

---

## Deliverables

### 1. AI Analyst page (`/ai`)

**User flow:**
1. User opens `/ai`
2. Selects sport: `tennis` / `soccer` / `cs2`
3. Selects output language: `auto` / `uk` / `ru` / `en` / `es` / `fr` / `de` / `ar`
4. Enters: event name, market, selection (optional), odds, optional notes
5. Clicks "Analyze"
6. AI Analyst returns structured analysis
7. User reviews → clicks "Place Bet", "Skip", or "Watch"
8. Decision + ai_analysis_run saved atomically; Bet created if action = placed

**Analysis output schema** (maps to `decisions` table):
```
model_probability    — estimated win probability (0–100%)
implied_probability  — derived from offered odds (1/odds × 100)
edge_percent         — model_probability − implied_probability
confidence_score     — 0–100
risk_level           — low / medium / high
recommendation       — bet / skip / watch / no_value
reasoning            — plain-text in user's selected language (2–4 sentences)
factors[]            — 6–10 named factors, each scored −3 to +3
disclaimer           — present when web search is off (honesty rule)
```

**Structured JSON fields remain canonical regardless of output language.**  
Example: `recommendation = "bet"` even when reasoning is in Ukrainian.

---

### 2. Sport-Aware Analyst System Prompt

AI Analyst uses: **base system prompt + injected sport module + market module**

**Sport modules (Sprint 2):**

*Tennis module covers:* surface, serve/return quality, break points, tie-break frequency, fatigue, H2H, indoor/outdoor, BO3/BO5 format, recent form, injury risk

*Soccer module covers:* home/away split, team style, xG if available, form, injuries/lineups if provided, motivation, schedule congestion, weather, cards/corners for relevant markets, tactical mismatch

*CS2 module covers:* map pool, map veto, BO1/BO3/BO5, LAN/online split, roster changes, player form, CT/T side strength, pistol rounds, economy control, H2H, recent map-specific form

*Fallback:* `generic_sport_analyst` for any sport not in the above list

---

### 3. Analyst API (`POST /api/ai/analyst`)

- Auth required
- Rate limited (see Rate Limit section)
- Input: `{ sport, event_name, market_type, selection?, line?, offered_odds, bookmaker?, notes?, output_language? }`
- Output: Zod-validated analysis JSON
- Model: `process.env.ANTHROPIC_MODEL_ANALYST` — never hardcoded in product logic
- Web search: controlled by `profiles.web_search_enabled`
- AI honesty disclaimer injected when web search is off

**Canonical data rule:** All structured fields in output use canonical codes:
- `recommendation: "bet"` not `"Ставити"`
- `risk_level: "medium"` not `"Середній"`
- `sport_code: "soccer"` not `"Футбол"`

---

### 4. Two atomic RPCs (migration 002)

**RPC 1: `create_decision_with_analysis()`**

Creates atomically:
- `decisions` record (`final_action = 'pending'`)
- `ai_analysis_runs` record (linked to decision)

Returns: `{ decision_id, analysis_run_id }`

**RPC 2: `place_bet_from_decision()`**

Creates atomically:
- `bets` record
- `bet_legs` record (with `decision_id` populated)
- `bankroll_transactions` record
- Updates `bankrolls.balance`
- Updates `decisions.final_action = 'placed'`

Returns: `{ bet_id }`

`create_quick_bet()` from Sprint 1 remains unchanged for manual quick-add without AI analysis.

---

### 5. Decision detail view (`/decisions/[id]`)

Shows the full Decision record:

- Sport + event + market + selection
- Offered odds
- AI probability vs implied probability → edge indicator
- Confidence score + risk badge
- Recommendation chip (bet / skip / watch / no_value)
- Reasoning text (in user's language)
- Factors grid (name + score)
- Honesty disclaimer (if present)
- Linked bet status (if placed)
- Action buttons: **Place Bet**, **Mark Skipped**, **Watch**

---

### 6. Analytics v0 (`/analytics`) — Optional, decision-centered

Only metrics supported by existing data. No fabricated win rates.

**Always shown:**
| Metric | Source |
|--------|--------|
| Total decisions | `decisions` |
| Placed / Skipped / Watchlisted | `decisions.final_action` counts |
| Decision → Bet conversion rate | placed / total decisions |
| Avg AI edge | `decisions.edge_percent` avg |
| Avg confidence | `decisions.confidence_score` avg |
| Total bets | `bets` |
| Total staked | sum of stakes |
| Pending bets | `bets WHERE status = 'pending'` |
| Bankroll balance | `bankrolls.balance` |

**Shown only when settled bets exist:**
| Metric | Condition |
|--------|-----------|
| Win rate | settled bets > 0 |
| Total P&L | settled bets > 0 |
| ROI / Yield | settled bets > 0 |

If no settled bets: show `"Not enough settled bets yet"` — never show misleading zeros.

No charts in Sprint 2. Charts = Sprint 4.

---

### 7. AI analysis logging

Every `/api/ai/analyst` call writes to `ai_analysis_runs`:
```
agent_type       = 'analyst'
model_name       = from ANTHROPIC_MODEL_ANALYST env
input_snapshot   = { sport, event_name, market_type, offered_odds, output_language, ... }
output_json      = full AI response
output_summary   = reasoning field
confidence_score = from AI output
web_search_used  = true/false
input_language   = detected or user-provided
output_language  = selected by user
decision_id      = linked after decision is created
```

No orphan analysis records — if decision save fails, analysis run is rolled back within the same transaction.

---

## AI Honesty Rule

**When web search is disabled or no live data is available, AI Analyst must include:**

> "This analysis is based only on the information provided by the user and does not include live injuries, team news, recent form updates, or current line movement."

This rule is enforced in the system prompt — not optional.

---

## Responsible Betting Guardrails

The AI Analyst must **never:**
- Guarantee outcomes ("100% зайдет", "железно", "sure bet", "lock")
- Recommend chasing losses
- Suggest aggressively increasing stake
- Claim certainty it does not have
- Use language: guaranteed, 100%, must bet, all-in, recover your loss, revenge bet

The AI Analyst must **always:**
- Explain uncertainty
- Present edge as a probability estimate, not a guarantee
- Include `confidence_score` that reflects actual certainty
- Use `recommendation: 'no_value'` when edge is negative or marginal
- Treat Skip as a valid, positive outcome

Enforced via system prompt in `/api/ai/analyst` — not just documentation.

---

## Rate Limit / Cost Guard

`/api/ai/analyst` must have server-side rate limiting before Sprint 2 ships:

```
Per user:
  - 10 requests / minute
  - 50 requests / day

Implementation:
  - Simple in-memory counter for Sprint 2 (Redis in Sprint 3)
  - Return HTTP 429 with Retry-After if exceeded

Tracked in ai_analysis_runs:
  - user_id
  - model_name
  - created_at
  - input size (character count)
  - output size (character count)
```

No AI endpoint ships without rate limiting. Hard rule.

---

## Entitlement-Ready Design

AI endpoints must be designed so entitlement checks can be added without rewrites:
- No hardcoded "all users have all AI features forever"
- Analyst API should accept future `sport_code` entitlement check (Sprint 5+)
- Function signatures and middleware should have a clear place for entitlement injection

---

## Definition of Done — Sprint 2

Sprint 2 is done when all of the following pass:

1. `/ai` page works on desktop and mobile
2. User can select sport: tennis / soccer / cs2
3. User can select output language: auto / uk / ru / en / es / fr / de / ar
4. User can enter event + market + selection + odds
5. AI Analyst returns validated structured JSON
6. Invalid AI output is rejected by Zod and does not corrupt DB
7. AI Analyst response includes honesty disclaimer when web search is off
8. AI Analyst follows responsible betting guardrails (enforced in system prompt)
9. `create_decision_with_analysis()` saves decision + ai_analysis_run atomically
10. Decision detail page exists and is reachable from `/ai` after analysis
11. Decision detail page shows: sport, event, market, selection, odds, implied probability, model probability, edge, confidence, risk, recommendation, reasoning, factors, disclaimer
12. User can mark Decision as skipped
13. User can mark Decision as watchlisted
14. User can place a single bet from Decision through `place_bet_from_decision()`
15. Bet is linked to Decision through `bet_legs.decision_id`
16. Bankroll balance updates only through DB/RPC — never from frontend
17. `ai_analysis_runs` written for every Analyst call
18. No orphan AI analysis records unless explicitly marked as failed
19. Analytics v0 only shows metrics supported by existing data
20. No win rate / ROI claims if there are no settled bets
21. Rate limit enforced on `/api/ai/analyst` (10/min, 50/day per user)
22. All structured JSON fields canonical (codes, not localized labels)
23. `npm run build` passes
24. `npm run lint` passes
25. Sprint 1 smoke test still passes (scanner → quick bet → bets list)
26. `docs/dev.md` changelog updated
27. `docs/sprint-2-plan.md` marked completed after final CPO review

---

## Task Breakdown (Lead Engineer)

**Core:**
- [ ] `POST /api/ai/analyst` — sport module injection, honesty rule, guardrails, Zod output validation, rate limiting, `ai_analysis_runs` write
- [ ] `/ai` page — sport selector, language selector, analyst form, streaming/loading UI, analysis display card
- [ ] `create_decision_with_analysis()` RPC (migration 002)
- [ ] `place_bet_from_decision()` RPC (migration 002)
- [ ] Decision detail page `/decisions/[id]`
- [ ] Action buttons: Place / Skip / Watch
- [ ] Add `ANTHROPIC_MODEL_ANALYST` to `.env.local`
- [ ] TypeScript types: `AnalystRequest`, `AnalystResponse`
- [ ] DB schema additions: `input_language`, `output_language`, `raw_event_text` on decisions; `detected_language` on ai_analysis_runs

**Optional (after Core):**
- [ ] `/analytics` page — decision metrics + conditional financial metrics

**Always:**
- [ ] `docs/dev.md` changelog updated

---

## Out of Scope (Sprint 2)

| Feature | Sprint |
|---------|--------|
| Charts / visualizations | Sprint 4 |
| Scout agent | Sprint 5 |
| Coach agent | Sprint 6 |
| Multi-bankroll UI | Sprint 3+ |
| shadcn/ui migration | Evaluate mid-Sprint 2 |
| Parlay support | Sprint 3 |
| Bet settlement / result entry | Sprint 3 |
| Supabase type generation | Sprint 2 tech debt, low priority |
| Redis rate limiting | Sprint 3 |
| Full i18n / translation system | Sprint 3 |
| Arabic RTL | When Arabic locale is activated |
| Monetization / entitlements | Architecture-ready Sprint 2; implementation Sprint 5+ |

---

## Risks

| Risk | Mitigation |
|------|------------|
| AI output not matching Zod schema | Retry with explicit JSON instruction; 2nd failure → return error, do not save partial data |
| Slow analyst response (LLM latency) | Streaming UI; show partial output while generating |
| `place_bet_from_decision()` complexity | Build and test `create_decision_with_analysis()` first; add betting RPC only after decision save is stable |
| Web search adds significant latency | Off by default; user opt-in in settings |
| Analytics showing misleading zeros | Conditional rendering — "Not enough data" gate |
| Rate limit bypass | Server-side only; never trust client-side rate limit |
| Sport module prompt growing too large | Modular injection — only relevant sport loaded, not all at once |
| Sprint scope creep | CPO must approve any scope addition mid-sprint |

---

*Created: 2026-06-26*  
*Patched: 2026-06-26 — Round 1 (CPO required changes)*  
*Patched: 2026-06-26 — Round 2 (multi-sport, multilingual, LineHunter alignment, entitlement-ready)*  
*Author: Lead Engineer*  
*CPO status: approved — implementation may begin after docs patch commit*
