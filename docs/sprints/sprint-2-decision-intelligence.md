# Sprint 2 — Decision Intelligence MVP

Status: Accepted ✅

## Goal

Implement the first real Decision Intelligence loop.

## Core Loop

```
User enters event
→ AI Analyst returns structured analysis
→ Decision is saved immediately
→ User chooses Place / Watch / Skip
→ Optional Bet is created from Decision
→ All records linked in DB
```

## Completed

**Database**
- Migration 002 applied
- Tables: `decisions`, `ai_analysis_runs`, updated `bets`
- Atomic RPCs:
  - `create_decision_with_analysis`
  - `place_bet_from_decision`
  - `update_decision_action`

**API**
- `POST /api/ai/analyst`
  - Sport-aware prompts (7 sports)
  - Rate limiting: 10/min, 50/day
  - Server-side implied probability
  - Server-side edge calculation
  - Forced honesty disclaimer
  - Immediate decision persistence
- `POST /api/ai/scanner`
  - Claude Vision OCR
  - Express/parlay support
  - Canonical SportCode mapping

**UI**
- `/ai` page
  - Scanner drop zone (paste/upload)
  - Sport selector (Football/Tennis/CS2/Basketball/Ice Hockey/MMA/Other)
  - Language selector (auto/uk/ru/en/es/fr/de/ar)
  - Analysis result card with ScoreBar
  - Inline Place / Watch / Skip actions
- `/decisions/[id]`
  - AI analysis detail
  - Model probability, implied probability, edge
  - Factor analysis with ScoreBar
  - Linked bet display
  - Place / Watch / Skip actions
- Dashboard
  - Bankroll deposit / withdrawal widget

## Smoke Test

```
Skip      ✅
Watch     ✅
Place Bet ✅
Scanner express coupon ✅
```

## CPO Verdict

Sprint 2 accepted. BetTracker AI now has a complete Decision Intelligence loop:

```
AI Analysis
→ Decision created immediately
→ User action captured
→ Optional bet created
→ Bankroll updated atomically
→ Full traceability preserved
```

This is no longer "AI adviser next to a tracker" — it is a Decision Support Platform.
