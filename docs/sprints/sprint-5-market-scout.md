# Sprint 5 — Market Scout MVP

Status: Draft 📝

---

## Goal

Build the Scout agent: a discovery layer that finds markets worth deeper research
**before** the user has identified a specific match.

Scout is not Analyst. Analyst evaluates a Decision the user already has in mind.
Scout surfaces research candidates the user has not yet considered.

```
Scout: "Here are 4 markets worth analysing this weekend"
Analyst: "This specific bet has +8.6% edge at 55% confidence"
```

---

## Why

Without Scout, the product only helps users evaluate bets they already found.
With Scout, the product helps users find the bets worth evaluating.

This closes the full opportunity loop:

```
Scout → Opportunity → Decision → Bet → Settlement → Analytics
```

Scout is the entry point that makes BetTracker AI a proactive tool, not just a tracker.

---

## Core Loop

```
User opens /scout
→ Selects sport / describes context / sets timeframe
→ Scout agent runs (with optional web search)
→ 3–5 research candidates returned and persisted as market_opportunities
→ User reviews candidates
→ User clicks "Analyse" on a candidate
→ /ai Analyst form opens pre-filled with opportunity data
→ Analyst creates a Decision
→ Opportunity status updated to converted_to_decision
→ Normal Decision → Bet → Settlement → Analytics flow
```

---

## Scope

### 1. Database — Migration 004

New table `market_opportunities`. Run manually in Supabase SQL Editor.

```sql
CREATE TABLE market_opportunities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport_code          text NOT NULL,
  event_name          text NOT NULL,
  market_type         text NOT NULL,
  selection           text,
  line                numeric,
  offered_odds        numeric,
  bookmaker           text,
  opportunity_type    text NOT NULL DEFAULT 'general'
                        CHECK (opportunity_type IN ('value','contrarian','pattern','general')),
  scout_score         integer CHECK (scout_score BETWEEN 0 AND 100),
  model_probability   numeric CHECK (model_probability BETWEEN 0 AND 100),
  implied_probability numeric CHECK (implied_probability BETWEEN 0 AND 100),
  edge_percent        numeric,
  confidence_score    integer CHECK (confidence_score BETWEEN 0 AND 100),
  data_quality_score  integer CHECK (data_quality_score BETWEEN 0 AND 100),
  risk_level          text CHECK (risk_level IN ('low','medium','high')),
  status              text NOT NULL DEFAULT 'discovered'
                        CHECK (status IN (
                          'discovered','research_needed','watchlisted',
                          'converted_to_decision','dismissed','expired'
                        )),
  reasoning           text NOT NULL,
  required_checks     jsonb,   -- string[]
  linked_decision_id  uuid REFERENCES decisions(id) ON DELETE SET NULL,
  web_search_used     boolean NOT NULL DEFAULT false,
  scout_run_input     jsonb,   -- snapshot of what the user asked
  metadata            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE market_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own opportunities"
  ON market_opportunities FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_market_opp_user_status
  ON market_opportunities (user_id, status, created_at DESC);

-- Auto-update updated_at
CREATE TRIGGER trg_market_opp_updated_at
  BEFORE UPDATE ON market_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

`update_updated_at_column()` trigger function already exists from migration 001.

No new RPCs needed. Simple CRUD via Supabase client.

---

### 2. API — POST /api/scout

Runs the Scout agent, persists all returned candidates, returns them.

**Request body:**
```ts
{
  sport:       SportCode          // required
  context:     string             // max 1000 — league, teams, timeframe, notes
  timeframe:   'today' | 'tomorrow' | 'this_week' | 'custom'
  output_language: Locale         // same as Analyst
}
```

**Response:**
```ts
{
  success: true
  data: {
    opportunities: ScoutOpportunity[]
    web_search_used: boolean
    disclaimer: string
  }
}
```

Each `ScoutOpportunity` mirrors `market_opportunities` columns plus the `id` from the persisted row.

**Rate limiting:** 3 per minute, 15 per day per user (Scout runs are expensive).

**Web search:** Controlled by `ANTHROPIC_WEB_SEARCH_ENABLED=true` env var.
- When `true`: Scout uses Anthropic web search tool (`web_search_20250305`).
- When `false` or unset: Scout uses provided context + training knowledge only.
- `web_search_used` persisted on each opportunity row.

**Model:** `ANTHROPIC_MODEL_SCOUT` env var. Falls back to `ANTHROPIC_MODEL_ANALYST`.

---

### 3. Scout Agent — Prompt and Output Schema

#### System prompt rules

- Scout surfaces research candidates, not final recommendations.
- Scout MUST include `required_checks` — explicit steps the user must verify before running Analyst.
- Scout must never claim certainty about outcomes.
- Scout must never encourage chasing losses.
- If no strong candidates exist, Scout must say so — minimum 1 candidate, not forced to 5.
- Responsible betting guardrails are non-negotiable (same as Analyst: no "guaranteed", "sure", "lock", "must bet").
- Confidence score must honestly reflect data quality — low when web search not used.
- `data_quality_score` reflects how much real-time data was available (0 = no live data, 100 = full current data).
- Disclaimer must always be included.

#### Sport modules

Scout uses the same sport modules as Analyst (soccer / tennis / cs2 / basketball / ice_hockey / mma / generic). Inject based on `sport` input.

#### Output schema (JSON, 1–5 candidates)

```json
{
  "candidates": [
    {
      "event_name":          "Real Madrid vs Barcelona",
      "market_type":         "match_winner",
      "selection":           "Barcelona",
      "offered_odds":        null,
      "opportunity_type":    "value",
      "scout_score":         72,
      "model_probability":   38,
      "implied_probability": null,
      "edge_percent":        null,
      "confidence_score":    50,
      "data_quality_score":  40,
      "risk_level":          "medium",
      "reasoning":           "Barcelona's away form this season is historically undervalued by markets...",
      "required_checks": [
        "Confirm Lewandowski fitness",
        "Check Real Madrid injury list",
        "Verify current odds before placing"
      ]
    }
  ],
  "disclaimer": "..."
}
```

`offered_odds`, `implied_probability`, `edge_percent` are nullable — Scout may not have access to current odds.

`scout_score` = overall worthiness of researching this opportunity (0–100). Not a win probability.

**Zod validation:** validate entire output server-side before persisting. On schema failure: return error, do not persist partial data.

---

### 4. UI — /scout page

New route: `app/(app)/scout/page.tsx` — server component wrapper, client form component.

**Layout (top to bottom):**

1. **Header**
   - Title: "Scout"
   - Subtitle: "Find markets worth analysing"
   - CTA: "Run Scout" button (triggers form submit)

2. **Scout Form** (client component `ScoutForm.tsx`)
   - Sport selector (same as Analyst)
   - Context textarea — "What are you looking for?" (e.g. "Top soccer fixtures this weekend, focus on underdog value")
   - Timeframe selector: Today / Tomorrow / This week
   - Language selector (same as Analyst)
   - Submit button with loading state

3. **Results — Opportunity Cards**
   After Scout runs, results appear below the form.
   Each card:
   - Sport icon + event name + market + selection
   - Scout score badge (colour-coded: green ≥70, yellow 40–69, gray <40)
   - Opportunity type tag (value / contrarian / pattern / general)
   - Risk level
   - Model probability (if available)
   - Reasoning (truncated, expandable)
   - Required checks (bulleted list)
   - Actions: **[Analyse →]** (primary) · **[Watchlist]** · **[Dismiss]**

4. **Saved Opportunities list** (below form, always visible)
   - Shows all non-dismissed, non-expired opportunities for the user
   - Sorted: most recent first
   - Status indicator on each card: discovered / research_needed / watchlisted / converted
   - Dismissed opportunities hidden by default

**Empty state (no opportunities yet):**
```
🔍  No scouted opportunities yet
Run Scout to find markets worth analysing.
[Run Scout]
```

---

### 5. Opportunity → Analyst Bridge

When user clicks **Analyse →** on an opportunity card:

1. Navigate to `/ai` with query params:
   ```
   /ai?scout_id=<uuid>&sport=soccer&event=Real+Madrid+vs+Barcelona&market=match_winner&selection=Barcelona&odds=
   ```
2. The `/ai` page reads these params and pre-fills the Analyst form.
3. On successful Analyst run → Decision created.
4. After decision creation, call `PATCH /api/scout/[id]` to set:
   ```json
   { "status": "converted_to_decision", "linked_decision_id": "<decision_id>" }
   ```

**PATCH /api/scout/[id]** — update opportunity status.
```ts
// Body
{ status: OpportunityStatus; linked_decision_id?: string }
```
Auth-gated. User can only update their own opportunities.

---

### 6. Nav update

Add **Scout** to:
- `components/ui/Sidebar.tsx` — between AI and Bets (or after AI)
- `components/ui/MobileNav.tsx` — add Scout tab with 🔍 icon

Nav label: "Scout"
Route: `/scout`
Icon: 🔍

---

### 7. Types

Add to `types/index.ts`:
```ts
export type OpportunityStatus =
  'discovered' | 'research_needed' | 'watchlisted' |
  'converted_to_decision' | 'dismissed' | 'expired'

export type OpportunityType = 'value' | 'contrarian' | 'pattern' | 'general'

export interface MarketOpportunity {
  id: string
  user_id: string
  sport_code: string
  event_name: string
  market_type: string
  selection?: string
  line?: number
  offered_odds?: number
  bookmaker?: string
  opportunity_type: OpportunityType
  scout_score?: number
  model_probability?: number
  implied_probability?: number
  edge_percent?: number
  confidence_score?: number
  data_quality_score?: number
  risk_level?: 'low' | 'medium' | 'high'
  status: OpportunityStatus
  reasoning: string
  required_checks?: string[]
  linked_decision_id?: string
  web_search_used: boolean
  scout_run_input?: Record<string, unknown>
  created_at: string
  updated_at: string
}
```

---

### 8. PostHog Events

Add to `lib/analytics/events.ts`:
```ts
SCOUT_STARTED:    'scout_started'
SCOUT_COMPLETED:  'scout_completed'
SCOUT_FAILED:     'scout_failed'
SCOUT_PAGE_VIEWED: 'scout_page_viewed'
OPPORTUNITY_ANALYSED:  'opportunity_analysed'   // Analyse → clicked
OPPORTUNITY_WATCHLISTED: 'opportunity_watchlisted'
OPPORTUNITY_DISMISSED: 'opportunity_dismissed'
```

`scout_started`: `{ sport, timeframe, has_context, web_search_enabled }`
`scout_completed`: `{ sport, candidate_count, web_search_used }`
`scout_failed`: `{ sport, error_type }`
`opportunity_analysed`: `{ opportunity_id, sport_code, opportunity_type, scout_score_bucket }`
`opportunity_watchlisted`: `{ opportunity_id, sport_code }`
`opportunity_dismissed`: `{ opportunity_id, sport_code }`

`scout_score_bucket`: use `bucketCount` or a new `bucketScore` function (0–39 / 40–69 / 70–100).

Do not send: event_name, reasoning, required_checks, odds, selection.

---

## Implementation preferences

- `/scout` page: server component for the outer shell (fetches saved opportunities), client component `ScoutForm.tsx` for the form + results (needs interactivity).
- Scout agent output must be Zod-validated server-side before any persistence.
- `server-side implied_probability` and `edge_percent` override AI values when `offered_odds` is present (same rule as Analyst).
- All persisted candidates in a single `supabase.from('market_opportunities').insert(candidates)` batch after successful validation.
- Do not persist anything if the Scout API call or Zod validation fails.
- Pre-fill `/ai` form via URL params. The `/ai` page must read `useSearchParams()` and populate fields on mount.
- Rate limit Scout more aggressively than Analyst — Scout calls are longer and use web search.

---

## Validation

- `npm run lint`
- `npm run build`
- Smoke test: Scout form submits, candidates render, "Analyse →" navigates to `/ai` with pre-filled data, opportunity status updates to `converted_to_decision`
- Do not merge before CPO review

---

## Acceptance Criteria

**Scout agent**
- [ ] POST /api/scout authenticated, rate-limited (3/min, 15/day)
- [ ] Scout returns 1–5 candidates in validated JSON
- [ ] All candidates persisted to `market_opportunities` in one batch
- [ ] `web_search_used` correctly set per run
- [ ] Disclaimer always present in response
- [ ] Zod validation failure returns error, no partial persistence

**Database**
- [ ] Migration 004 applied: `market_opportunities` table with RLS
- [ ] User can only see/modify their own opportunities
- [ ] `linked_decision_id` set when opportunity converted

**UI**
- [ ] `/scout` page loads with form and saved opportunities list
- [ ] Scout form submits and shows candidate cards
- [ ] Scout score badge colour-coded correctly
- [ ] Required checks visible on each card
- [ ] "Analyse →" navigates to `/ai` with opportunity data pre-filled
- [ ] Analyst form fields populated from URL params on mount
- [ ] "Watchlist" updates opportunity status to `watchlisted`
- [ ] "Dismiss" updates opportunity status to `dismissed` and hides card
- [ ] After Analyst completes from an opportunity, opportunity status → `converted_to_decision`
- [ ] Scout nav item visible in sidebar and mobile nav
- [ ] Honest empty state when no opportunities exist

**Guardrails**
- [ ] Scout prompt never uses: "guaranteed", "sure bet", "lock", "100%", "must bet", "all-in", "chase"
- [ ] required_checks always present (at least 1 per candidate)
- [ ] disclaimer always present in API response

**Analytics**
- [ ] `scout_started`, `scout_completed`, `scout_failed` fire on server
- [ ] `opportunity_analysed`, `opportunity_dismissed`, `opportunity_watchlisted` fire on client

---

## Non-Scope (Sprint 5)

- Automated or scheduled Scout runs
- Import of fixture lists from CSV / screenshot
- Real-time odds feed (Scout may not have current odds)
- Opportunity expiry automation (status = expired)
- Opportunity sharing or export
- Coach agent (Sprint 6)
- Risk Manager
- Scout from the AI page (it gets its own route)
- Filtering/sorting the opportunities list
- Sprint 5.1: web search hardening and odds sourcing

---

## Open Questions for CPO

1. **Nav placement:** Should Scout appear before or after AI in the sidebar?
2. **Opportunity count:** Is 1–5 candidates per run the right range, or should we allow more?
3. **Pre-fill behaviour:** When navigating Opportunity → Analyst, should we require the user to manually enter odds, or is it OK to leave odds blank (forcing them to look up the current line)?
4. **Expiry:** Should `expired` status be set automatically after N days, or manually? (Suggested: auto after 7 days via cron — Sprint 5.1.)
5. **Web search default:** Should `ANTHROPIC_WEB_SEARCH_ENABLED` default to `true` in production from day 1, or start `false` and enable manually after cost monitoring?
