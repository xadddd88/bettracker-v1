# Sprint 2 Plan — Decision Intelligence MVP

> Level 3 Document. Engineering reference.  
> Status: **DRAFT — pending CPO approval before implementation starts**

---

## Goal

Prove the core product thesis:

> BetTracker AI is not a bet diary. It is a decision-making system.

A user should be able to get an AI-powered analysis of a betting opportunity, save it as a structured Decision, then place or skip — with the full loop recorded. Sprint 2 delivers the smallest version of that loop.

**Definition of Success:** User can go from "I'm looking at a match" → AI analysis → saved Decision → placed Bet, with every step linked in the database.

---

## Pre-Sprint Gate (before any coding)

- [ ] `npm run lint` — zero errors
- [ ] `npm run build` — zero errors
- [ ] All Sprint 1 smoke test steps still work on latest main

---

## Deliverables

### 1. AI Analyst page (`/ai`)

**User flow:**
1. User opens `/ai`
2. Enters: event name, sport, market, offered odds, optional notes
3. Clicks "Analyze"
4. Claude returns structured analysis (see schema below)
5. User reviews → clicks "Place Bet", "Skip", or "Watch"
6. Decision + optional Bet saved atomically

**Analysis output schema** (matches `decisions` table):
```
model_probability    — Claude's estimated win probability (0–100%)
implied_probability  — derived from offered odds (1/odds × 100)
edge_percent         — model_probability − implied_probability
confidence_score     — 0–100, Claude's certainty
risk_level           — low / medium / high
recommendation       — bet / skip / watch / no_value
reasoning            — plain-text explanation (2–4 sentences)
factors[]            — 6–10 named factors, each scored −3 to +3
```

**API route:** `POST /api/ai/analyst`

- Auth required
- Input: `{ event_name, sport, market_type, offered_odds, bookmaker?, notes? }`
- Output: analysis JSON + saved `ai_analysis_runs` record
- Model: `claude-sonnet-4-6`
- Web search: optional, controlled by `profiles.web_search_enabled`

**New RPC:** `create_decision_from_analysis()`

```sql
-- Inserts decision + ai_analysis_runs in one transaction
-- Returns { decision_id, analysis_run_id }
-- Accepts final_action: 'pending' | 'placed' | 'skipped' | 'watchlisted'
-- If final_action = 'placed': also calls create_quick_bet() logic
```

---

### 2. Decision detail view (`/decisions/[id]`)

Shows the full Decision record:

- Event + market + odds
- AI probability vs implied probability → edge bar
- Confidence score + risk badge
- Recommendation chip (bet/skip/watch/no_value)
- Reasoning text
- Factors grid (name + score bar)
- Linked bet status (if placed)
- Action buttons: **Place Bet**, **Mark Skipped**, **Watch**, **Edit odds**

---

### 3. Analytics v0 (`/analytics`)

**Not** a full analytics dashboard. Only metrics that directly support learning from decisions:

| Metric | Source |
|--------|--------|
| Total bets | `bets` |
| Pending bets | `bets WHERE status = 'pending'` |
| Win rate | settled bets |
| Total staked | sum of stakes |
| Total P&L | sum of pnl (settled only) |
| ROI | P&L / staked |
| Bankroll balance | `bankrolls.balance` |
| Avg edge (AI decisions) | `decisions.edge_percent` avg |

Layout: 4 stat cards (top) + simple bet list (bottom, same as `/bets`).  
No charts in Sprint 2. Charts = Sprint 3.

---

### 4. AI analysis logging

Every call to `/api/ai/analyst` writes to `ai_analysis_runs`:

```
agent_type      = 'analyst'
model_name      = 'claude-sonnet-4-6'
input_snapshot  = { event_name, sport, market_type, offered_odds, ... }
output_json     = full Claude response
output_summary  = reasoning field (short)
confidence_score = from Claude output
web_search_used = true/false
decision_id     = linked after decision is created
```

This is the foundation for future Coach agent ("your AI recommended X but you placed Y").

---

## Definition of Ready

A task is ready when:
- Product logic approved by CPO
- UX described (no wireframe required for Sprint 2, description is enough)
- Technical approach agreed with Lead Engineer
- Acceptance criteria written

## Definition of Done

- [ ] Code works
- [ ] No TypeScript errors (`npm run build` clean)
- [ ] Tested on desktop + mobile
- [ ] `ai_analysis_runs` written for every analyst call
- [ ] Decision and Bet linked in DB
- [ ] No regressions in Sprint 1 features (scanner, quick bet, bets list)
- [ ] `docs/dev.md` changelog updated

---

## Out of Scope (Sprint 2)

| Feature | Sprint |
|---------|--------|
| Charts / visualizations | Sprint 3 |
| Scout agent (odds comparison) | Sprint 3 |
| Coach agent (performance review) | Sprint 3 |
| Multi-bankroll UI | Sprint 3 |
| shadcn/ui migration | Sprint 2+ (evaluate mid-sprint) |
| Parlay support | Sprint 3 |
| Bet settlement / result entry | Sprint 3 |
| Supabase type generation | Sprint 2 (tech debt, low priority) |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Claude response not matching expected JSON schema | Zod validation on API output; retry with structured prompt if parse fails |
| AI Analyst page too slow (cold start + LLM latency) | Streaming response UI; show partial output while generating |
| `create_decision_from_analysis()` RPC complexity | Build as two separate server calls first (simpler), then consolidate if stable |
| Web search adds latency | Off by default; user can enable in settings |
| Sprint scope creep (adding Coach, full Analytics) | Hard stop: CPO must approve any scope addition mid-sprint |

---

## Task Breakdown (Lead Engineer)

- [ ] `POST /api/ai/analyst` route (Claude call + Zod output validation + ai_analysis_runs write)
- [ ] `/ai` page — analyst form + streaming/loading UI + analysis display
- [ ] `create_decision_from_analysis()` RPC (or server-side two-step first)
- [ ] Decision detail page `/decisions/[id]`
- [ ] Action buttons: Place / Skip / Watch (update `decisions.final_action`)
- [ ] `/analytics` page — 4 stat cards + bankroll balance
- [ ] TypeScript types: `AIAnalysisRun` already exists; add `AnalystRequest`, `AnalystResponse`
- [ ] Update `dev.md` changelog

---

*Created: 2026-06-26*  
*Author: Lead Engineer*  
*CPO review: pending*
