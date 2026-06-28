# Sprint 6 — Coach Agent

Status: Accepted ✅

---

## Goal

Build the Coach agent: a retrospective analysis layer that reviews the user's betting history, identifies behavioural patterns, and delivers specific, honest advice for improving decision quality.

Coach is not Analyst. Analyst evaluates a specific bet before it is placed.
Coach reflects on what has already happened and asks: *why did you perform the way you did?*

```
Analyst: "This bet has +8.6% edge at 55% confidence"
Coach:   "Your soccer singles are +14% ROI but your parlays are -22%. Stop parlays until sample improves."
```

---

## Why

Without Coach, the product tracks performance (Sprint 4) but does not help users improve.
With Coach, the product closes the learning loop:

```
Scout → Opportunity → Decision → Bet → Settlement → Analytics → Coach → better Decisions
```

Coach is the reason a serious bettor keeps using the product long-term. It is the only agent that gets more valuable as the user accumulates more history.

---

## Core Loop

```
User opens /coach
→ Selects period (7d / 30d / 90d / all-time)
→ Optionally adds focus notes ("I think I'm overbet on soccer accumulators")
→ Coach runs: aggregates stats → sends structured summary to Claude → gets back advice
→ Coaching session persisted
→ User reviews: summary, calibration grade, strengths, weaknesses, recommendations
→ User acts on a recommendation (or dismisses it)
→ Next session compares against previous
```

---

## Scope

### 1. Database — Migration 005

New table `coaching_sessions`. Run manually in Supabase SQL Editor.

```sql
CREATE TABLE coaching_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_days          integer NOT NULL,   -- 7, 30, 90, 0 = all-time
  period_start         date,
  period_end           date,
  bets_analysed        integer NOT NULL DEFAULT 0,
  decisions_analysed   integer NOT NULL DEFAULT 0,
  summary              text NOT NULL,
  calibration_grade    text CHECK (calibration_grade IN ('excellent','good','fair','poor')),
  strengths            jsonb NOT NULL DEFAULT '[]',  -- string[]
  weaknesses           jsonb NOT NULL DEFAULT '[]',  -- string[]
  recommendations      jsonb NOT NULL DEFAULT '[]',  -- CoachRecommendation[]
  patterns             jsonb,                         -- identified patterns snapshot
  metrics_snapshot     jsonb,                         -- key metrics at session time
  focus_notes          text,                          -- user input, nullable
  model_name           text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own sessions"
  ON coaching_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_coaching_sessions_user
  ON coaching_sessions (user_id, created_at DESC);
```

`updated_at` not needed — coaching sessions are immutable after creation.

---

### 2. API — POST /api/coach

Runs the Coach agent, persists the session, returns it.

**Request body:**
```ts
{
  period_days:  7 | 30 | 90 | 0   // 0 = all-time
  focus_notes?: string             // max 500 chars, optional
}
```

**Rate limit:** 2 per rolling 24-hour window per user. Coach is compute-heavy — it processes history and calls Claude.

**What Coach aggregates before calling Claude (server-side, no raw data sent to AI):**
```ts
{
  period:               { days: number; bets_count: number; decisions_count: number }
  overall:              { roi: number | null; win_rate: number | null; net_profit: number; avg_odds: number | null }
  by_sport:             { sport: string; bets: number; win_rate: number | null; roi: number | null }[]
  by_market_type:       { market: string; bets: number; win_rate: number | null; roi: number | null }[]
  by_source:            { source: string; bets: number; win_rate: number | null; roi: number | null }[]
  by_bet_type:          { type: 'single' | 'parlay' | 'system'; bets: number; win_rate: number | null; roi: number | null }[]
  confidence_buckets:   { bucket: string; bets: number; win_rate: number | null }[]  -- calibration check
  edge_buckets:         { bucket: string; bets: number; win_rate: number | null }[]  -- edge accuracy check
  stake_buckets:        { bucket: string; bets: number; roi: number | null }[]
  streak:               { current_streak: number; streak_type: 'win' | 'loss' | 'none' }
  scout_funnel:         { scouted: number; watchlisted: number; converted: number; dismissed: number }
  recent_form:          { last_5: ('won' | 'lost' | 'void' | 'pending')[]; last_10_roi: number | null }
  has_ai_analyst_bets:  boolean
  insufficient_data:    boolean   -- true if < 5 settled bets
}
```

This summary is computed server-side from Supabase queries. **No raw event names, team names, or decision reasoning are sent to Claude.** Coach works purely on aggregated statistical patterns.

**Response:**
```ts
{
  success: true
  data: CoachingSession
}
```

**Model:** `ANTHROPIC_MODEL_COACH` env var. Falls back to `ANTHROPIC_MODEL_ANALYST`.

---

### 3. Coach Agent — Prompt and Output Schema

#### System prompt rules

- Coach is retrospective, not predictive. It cannot tell the user which bets to place.
- Coach must distinguish between small sample (< 20 bets) and statistically significant findings.
- Coach must never claim outcomes are predictable or that following advice will lead to profit.
- Coach must never suggest increasing stake sizes or chasing losses.
- Coach must never use: "guaranteed", "sure", "lock", "must", "all-in", "chase", "recover", "free money".
- If data is insufficient (< 5 bets), Coach must say so clearly rather than inventing patterns.
- Recommendations must be specific and actionable — not generic platitudes.
- Calibration grade must honestly reflect whether confidence scores predicted outcomes.
- Disclaimer must always be included.

#### Output schema (Zod-validated)

```json
{
  "summary": "2–4 sentence overall assessment of the period",
  "calibration_grade": "excellent | good | fair | poor | null",
  "strengths": [
    "Specific thing working well — with data reference"
  ],
  "weaknesses": [
    "Specific thing dragging performance — with data reference"
  ],
  "recommendations": [
    {
      "priority": "high | medium | low",
      "action": "Short, specific, actionable instruction",
      "detail": "1–3 sentences explaining the pattern and why this action helps"
    }
  ],
  "patterns": {
    "best_sport": "tennis",
    "best_market": "match_winner",
    "worst_bet_type": "parlay",
    "calibration_note": "Confidence scores above 65 correlate with 68% win rate vs 52% below"
  },
  "disclaimer": "Honest statement about sample size, variance, and that past performance does not predict future results"
}
```

`strengths` and `weaknesses`: 0–5 each. If period is too short for meaningful patterns, return 0 and explain in summary.
`recommendations`: 1–5, ordered by priority descending.
`patterns`: flexible object, keys are suggestive not exhaustive.
`calibration_grade`: optional — model may return null when calibration data is insufficient (e.g., fewer than 10 bets with recorded confidence scores). Zod: `z.enum(['excellent','good','fair','poor']).optional().nullable()`. DB column is already nullable.

**Zod validation:** validate entire output before persisting. On failure: return error, do not persist partial data.

---

### 4. UI — /coach page

New route: `app/(app)/coach/page.tsx` — server component for latest session, client component `CoachView.tsx` for interactivity.

**Layout (top to bottom):**

1. **Header**
   - Title: "Coach"
   - Subtitle: "Retrospective performance analysis"

2. **Run Coach form** (`CoachView.tsx` — client component)
   - Period selector: 7 days / 30 days / 90 days / All time
   - Focus notes textarea (optional): "What do you want to focus on?"
   - "Get coaching" button with loading state
   - Disabled if insufficient data (< 5 settled bets) — show "Add at least 5 settled bets first"
   - Rate limit message if 2/day exceeded

3. **Latest session card** (most recent coaching session, if any)
   - Period label + date
   - Summary paragraph
   - Calibration grade badge (🟢 Excellent / 🟡 Good / 🟠 Fair / 🔴 Poor)
   - **Strengths** (green checkmarks)
   - **Weaknesses** (amber warning icons)
   - **Recommendations** cards: priority badge + action + detail (expandable)
   - Disclaimer (small, at bottom)

4. **Past sessions** (collapsed list, most recent first)
   - Shows date + period + summary (truncated to 1 line)
   - Click to expand full session
   - Max 10 sessions shown, no pagination in Sprint 6

**Empty state (no coaching sessions yet):**
```
🧠  No coaching sessions yet
Run Coach after you've settled at least 5 bets.
[Get coaching]
```

---

### 5. Nav update

Add **Coach** to:
- `components/ui/Sidebar.tsx` — after Analytics, before Bankroll.
  Order: Dashboard → AI Analyst → Scout → Bets → Analytics → **Coach** → Bankroll → Settings.
- **Mobile nav: no change.** Mobile nav is at 5 items and layout would be cramped. Coach is accessible via sidebar on desktop. Sprint 6.1 can revisit mobile placement.

Nav label: "Coach"
Route: `/coach`
Icon: 🧠

---

### 6. Types

Add to `types/index.ts`:
```ts
export interface CoachRecommendation {
  priority: 'high' | 'medium' | 'low'
  action:   string
  detail:   string
}

export type CalibrationGrade = 'excellent' | 'good' | 'fair' | 'poor'

export interface CoachingSession {
  id:                   string
  user_id:              string
  period_days:          number
  period_start?:        string
  period_end?:          string
  bets_analysed:        number
  decisions_analysed:   number
  summary:              string
  calibration_grade?:   CalibrationGrade
  strengths:            string[]
  weaknesses:           string[]
  recommendations:      CoachRecommendation[]
  patterns?:            Record<string, unknown>
  metrics_snapshot?:    Record<string, unknown>
  focus_notes?:         string
  model_name?:          string
  created_at:           string
}
```

---

### 7. PostHog Events

Add to `lib/analytics/events.ts`:
```ts
COACH_STARTED:    'coach_started'
COACH_COMPLETED:  'coach_completed'
COACH_FAILED:     'coach_failed'
COACH_PAGE_VIEWED: 'coach_page_viewed'
```

`coach_started`: `{ period_days, has_focus_notes, bets_analysed }`
`coach_completed`: `{ period_days, calibration_grade, recommendation_count, strengths_count, weaknesses_count }`
`coach_failed`: `{ period_days, error_type }`

Do not send: summary text, recommendations, strengths, weaknesses, focus notes (may contain personal context).

---

## Implementation preferences

- Server component (`page.tsx`) fetches the most recent 10 coaching sessions and passes them to `CoachView.tsx`.
- `CoachView.tsx` is a client component — handles form, POST, display of results, expand/collapse of past sessions.
- Aggregation (stats computation) is done server-side in the API route before calling Claude — never sends raw bet/decision data to the model.
- `insufficient_data: true` when settled bets < 5 — API returns a 422 with a clear message before calling Claude.
- Rate limit check is the first thing after auth — return 429 with `Retry-After` before any DB queries.
- All coaching sessions are immutable — no PATCH route needed.
- `metrics_snapshot` stores a copy of the aggregated stats at the time of coaching (for audit trail and future comparison features).
- Output language: Coach uses `'auto'` — it infers language from the focus notes (same logic as Analyst/Scout). No user-selectable language picker in Sprint 6.

---

## Validation

- `npm run lint`
- `npm run build`
- Smoke test: Run coach with 0 bets → insufficient data message. Run with bets → session renders. Past sessions list collapses/expands. Desktop sidebar shows Coach.

---

## Acceptance Criteria

**Coach agent**
- [ ] POST /api/coach authenticated, rate-limited (2/day)
- [ ] Stats aggregated server-side, no raw event data sent to Claude
- [ ] Zod validation before persistence, no partial saves on schema failure
- [ ] Insufficient data (< 5 settled bets) returns 422, no Claude call
- [ ] Session persisted to `coaching_sessions`, returned in response
- [ ] Disclaimer always present in AI output

**Database**
- [ ] Migration 005 applied: `coaching_sessions` table with RLS
- [ ] User can only see their own sessions (RLS enforced; no PATCH/DELETE routes)
- [ ] Sessions immutable (no UPDATE path)

**UI**
- [ ] `/coach` page loads with run form and (optionally) latest session
- [ ] Period selector works, focus notes optional
- [ ] Coach session card shows: summary, grade, strengths, weaknesses, recommendations
- [ ] Calibration grade badge colour-coded
- [ ] Recommendations expandable
- [ ] Past sessions list loads and expands/collapses
- [ ] Empty state correct
- [ ] Coach in sidebar between Analytics and Bankroll
- [ ] Mobile nav unchanged

**Guardrails**
- [ ] Coach prompt: never suggests chasing losses, increasing stakes, or guaranteeing profits
- [ ] Small-sample caveat present in output when bets < 20
- [ ] disclaimer always present

**Analytics**
- [ ] `coach_started`, `coach_completed`, `coach_failed` fire on server

---

## Non-Scope (Sprint 6)

- Comparison between coaching sessions ("you improved ROI by 4% since last session")
- Coach-triggered alerts or push notifications
- Automated scheduled coaching (weekly digest)
- Mobile nav update for Coach
- Natural language coaching chat (follow-up Q&A)
- Risk Manager (separate sprint)
- Coach export (PDF)
- Recommendation tracking ("did you follow this advice?")

---

## CPO Acceptance Notes (2026-06-28)

Accepted with 4 amendments applied to this document:

1. **`calibration_grade` nullable** — Zod output schema uses `.optional().nullable()`; model must return null when fewer than 10 bets have recorded confidence scores. DB column was already nullable. Prevents hallucinated calibration on thin data.

2. **Rate limit is rolling 24-hour window** — not UTC midnight reset. Consistent with Scout (3/min, 15/day) and Analyst rate limiters throughout the codebase.

3. **Output language: 'auto', not user-selectable** — Coach infers language from focus notes. Consistent with Analyst/Scout. No language picker UI needed in Sprint 6.

4. **Empty state and gate copy uses "settled bets"** — pending bets contribute nothing to calibration analysis. Using "settled" is accurate and sets correct user expectations.
