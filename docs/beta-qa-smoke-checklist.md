# Beta QA Smoke Checklist

**Purpose:** Manual post-deploy smoke to verify the JSON extraction fix (PR #35) is working correctly on production before declaring Beta Ready.

**Who runs this:** Dima  
**When:** After each deploy that touches `/api/coach`, `/api/ai/analyst`, or `/api/scout`  
**Report format:** `[PASS]` or `[FAIL: brief description]`  
**Report to:** CPO before Beta launch

---

## Pre-check

- [ ] Production URL loads: https://btdk.app
- [ ] You can log in with your beta account
- [ ] Bankroll has a balance (required for Risk Evaluator on Analyst flow)

---

## A. Coach — Russian (RU)

1. Navigate to `/coach`
2. Select period: **Last 30 days**
3. Enter focus notes in Russian: `Хочу улучшить ROI на одиночных ставках`
4. Click **Run Coach**

**Expected:**
- [ ] Coach session card renders — no "invalid JSON" or "Coach returned invalid JSON" error
- [ ] Summary text is in Russian
- [ ] At least one Recommendation visible and in Russian

**Report:** `[PASS]` / `[FAIL: ...]`

---

## B. Coach — Ukrainian (UK)

1. Navigate to `/coach`
2. Select period: **Last 30 days**
3. Enter focus notes in Ukrainian: `Хочу покращити ROI на одиночних ставках`
4. Click **Run Coach**

**Expected:**
- [ ] Coach session card renders — no "invalid JSON" error
- [ ] Summary text is in Ukrainian
- [ ] At least one Recommendation visible and in Ukrainian

**Report:** `[PASS]` / `[FAIL: ...]`

---

## C. AI Analyst — Russian (RU)

1. Navigate to `/ai`
2. Fill in:
   - Sport: **Tennis**
   - Event: `Тест матч RU`
   - Market: `Победитель`
   - Offered odds: `1.85`
   - Output language: **ru**
3. Click **Analyze**

**Expected:**
- [ ] Analysis card appears — no "AI returned invalid JSON" error
- [ ] `reasoning` text is in Russian
- [ ] Factor names (`factors[].name`) are in Russian
- [ ] `recommendation` is one of: `bet` / `skip` / `watch` / `no_value` (English enum — must NOT be translated)
- [ ] Navigate to `/decisions` — new decision appears in the list

**Report:** `[PASS]` / `[FAIL: ...]`

---

## D. AI Analyst — Ukrainian (UK)

1. Navigate to `/ai`
2. Fill in:
   - Sport: **Tennis**
   - Event: `Тест матч UK`
   - Market: `Переможець`
   - Offered odds: `1.85`
   - Output language: **uk**
3. Click **Analyze**

**Expected:**
- [ ] Analysis card appears — no "AI returned invalid JSON" error
- [ ] `reasoning` text is in Ukrainian
- [ ] Factor names are in Ukrainian
- [ ] `recommendation` is still an English enum value (not translated)

**Report:** `[PASS]` / `[FAIL: ...]`

---

## E. Scout — Russian regression

Confirms that PR #35 did not regress Scout (Scout code was not touched).

1. Navigate to `/scout`
2. Fill in:
   - Sport: **Tennis**
   - Context: `Уимблдон эта неделя`
   - Timeframe: **This week**
   - Output language: **ru**
3. Click **Scout**

**Expected:**
- [ ] 1–5 candidate cards appear — no "Scout returned invalid JSON" error
- [ ] `reasoning` text is in Russian
- [ ] `opportunity_type` is one of: `value` / `contrarian` / `pattern` / `general` (English — must NOT be translated)
- [ ] `risk_level` is one of: `low` / `medium` / `high` (English — must NOT be translated)

**Report:** `[PASS]` / `[FAIL: ...]`

---

## F. PostHog verification

Go to [eu.posthog.com](https://eu.posthog.com) → BetTracker → **Events (Live)**:

After running the above smoke tests, check for:

- [ ] `coach_completed` event visible twice (once for RU, once for UK)
- [ ] `ai_analysis_completed` event visible twice (once per Analyst run)
- [ ] `scout_completed` event visible for the Scout RU run
- [ ] **No** `coach_failed` event with `error_type: ai_parse`
- [ ] **No** `ai_analysis_failed` event with `error_type: ai_parse`
- [ ] **No** `scout_failed` event with `error_type: anthropic_invalid_json`

**Report:** `[PASS]` / `[FAIL: which events missing or ai_parse errors present]`

---

## G. Vercel runtime logs

Go to Vercel dashboard → **bettracker** project → **Logs** tab → filter last 30 minutes:

- [ ] No unhandled errors in `/api/coach` logs
- [ ] No unhandled errors in `/api/ai/analyst` logs
- [ ] No `"invalid JSON"` or `"no_json_found"` or `"ai_parse"` in server logs
- [ ] No unexpected 502 responses from AI routes

**Report:** `[PASS]` / `[FAIL: paste the log line]`

---

## H. Sentry check

Go to **Sentry** → BetTracker project → **Issues** → filter last 1 hour:

- [ ] No new unhandled exceptions introduced
- [ ] No errors matching `"invalid JSON"` or `"no_json_found"` or `"ai_parse"`

**Report:** `[PASS]` / `[FAIL: paste Sentry issue title]`

---

## Summary report template

Copy and fill in; send to CPO:

```
Beta QA Smoke — [DATE] — Production (btdk.app)
Branch deployed: main (post-PR #35)

A. Coach RU:      [PASS] / [FAIL: ...]
B. Coach UK:      [PASS] / [FAIL: ...]
C. Analyst RU:    [PASS] / [FAIL: ...]
D. Analyst UK:    [PASS] / [FAIL: ...]
E. Scout RU:      [PASS] / [FAIL: ...]
F. PostHog:       [PASS] / [FAIL: ...]
G. Vercel logs:   [PASS] / [FAIL: ...]
H. Sentry:        [PASS] / [FAIL: ...]

Overall: [BETA READY] / [BLOCKED: list failed items]
```

---

## Known open issues (not blocking Beta, documented separately)

| ID | Description | Priority |
|----|-------------|----------|
| BUG-1 | Risk Evaluator stake field shows 100 visually but requires explicit re-type before Check Risk accepts it | Medium |
| UX-1 | ROI / Win Rate metric differs between Dashboard and Analytics | Low |
| UX-2 | Next Best Action "Watchlisted" link missing `?filter=watchlisted` param | Low |
| UX-3 | Feedback modal Escape key does not close the modal | Low |
| UX-4 | Star rating appears all-filled on modal open | Low |
| BUG-3 | `favicon.ico` 404 on all pages | Low |
