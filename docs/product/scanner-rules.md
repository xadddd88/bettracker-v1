# Scanner Rules

## Role

Scanner parses pasted or uploaded betting slips and coupons via Claude Vision.

## Supported Inputs

- Pasted image (Ctrl+V into drop zone)
- Uploaded image file
- Single bet coupon
- Express / parlay / multi-leg coupon

## Required Output

Scanner output must normalize:
- `sport` — canonical SportCode
- `event_name` — exact as shown; for express: all legs joined with ` + `
- `market_type` — as shown; for express: `"Экспресс (N ног)"`
- `selection` — selected outcome; for express: all selections joined with ` + `
- `odds` — total/combined odds as number
- `stake` — if clearly visible, else null
- `bookmaker` — if visible, else null

## Sport Taxonomy

Scanner must use canonical sport taxonomy:

```
soccer
tennis
cs2
basketball
ice_hockey
mma
other
```

## Alias Mapping

```
football        → soccer
hockey          → ice_hockey
counter-strike  → cs2
ufc             → mma
```

## Express / Parlay Handling

For multi-leg coupons:
- `event_name`: all team names joined with ` + `
- `market_type`: `"Экспресс (N ног)"` or `"Express (N legs)"`
- `odds`: combined/total coefficient shown on coupon
- `selection`: all selections joined with ` + `

## Rules

- Scanner must never persist non-canonical sport labels.
- `odds` must be a number, never a string.
- Return `null` for any field not clearly visible.
- Return ONLY JSON, no markdown, no explanation.
