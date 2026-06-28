# AI Analyst Rules

## Role

AI Analyst provides structured decision support.

It does not guarantee betting outcomes.

## Required Output Fields

AI Analyst must return:
- `model_probability` — estimated win probability (%)
- `implied_probability` — derived from odds server-side (1/odds * 100)
- `edge_percent` — model_probability - implied_probability (server-side)
- `confidence_score` — 0–100
- `risk_level` — low / medium / high
- `recommendation` — bet / watch / skip / no_value
- `reasoning` — plain text explanation
- `factors` — array of { name, score, detail }
- `disclaimer` — honesty disclaimer (always present)

## Server-Side Rules

The following must be calculated server-side, never trusted from AI output:
- `implied_probability = 1 / offered_odds * 100`
- `edge_percent = model_probability - implied_probability`

## Persistence Rule

A Decision must be saved **immediately** after analysis, before user acts.

```
User enters event
→ AI Analyst returns structured analysis
→ Decision is saved immediately
→ User chooses Place / Skip / Watch
→ Optional Bet is created from Decision
→ All records linked in DB
```

## Disclaimer Rule

An honesty disclaimer must always be included in every analysis response.

Example meaning:
> This is decision support, not a guarantee. Sports outcomes are uncertain. Bet responsibly.

## Rate Limiting

- 10 requests per minute per user
- 50 requests per day per user

## Model

Use `ANTHROPIC_MODEL_ANALYST` env var. Never hardcode model name.

## Web Search

`web_search_used` is forced to `false` in Sprint 2. Disclaimer always injected regardless.
