# Analyst Trust UX Patch Design

## Goal

Make blocked/no-price AI Analyst output trustworthy, localized, status-aware, and free from hidden pricing artifacts.

## Scope

- Do not enable `SPORTS_FIXTURE_SYNC_WRITE_ENABLED`.
- Do not run write mode.
- Do not start M1.2.c.
- Do not add odds, results, SportMonks, enrichment, cron, fixture writes, or provider status lookup.
- No Supabase writes beyond the existing Analyst decision persistence path.

## Approved Approach

Use a server-owned shared Analyst Trust View Model. When `qualityGate.pricingAllowed === false`, BetTracker must not render raw AI reasoning or raw AI factor analysis as the primary analysis. The server builds deterministic safe blocked-mode content from structured fields:

- quality gate
- per-leg fixture status
- support level
- missing data
- actionability
- safe explanation
- safe next steps

This is structural prevention. String replacement may still be used as a defensive guard, but the primary blocked-mode UI, PDF, share text, and decision detail output must come from the deterministic trust view model.

## Event Actionability

PR #74 does not perform provider lookup.

- `unknown` status means status unverified, pricing blocked, Watch visible.
- `live`, `finished`, `cancelled`, `abandoned`, `postponed`, `retired`, `walkover`, or `not_bettable` means not actionable, Place Bet hidden, and Watch hidden or disabled.
- If event time or status is unavailable, add missing data item `event start time / fixture status`.

## Ukrainian Labels

For `output_language = uk`, all Analyst result labels in UI, PDF, share, decision detail, and quality gate sections must use Ukrainian labels:

- `NO PRICE`: `БЕЗ ОЦІНКИ`
- `unsupported mixed-sport parlay`: `непідтримуваний експрес із різних видів спорту`
- `Unsupported / partially supported bet`: `Ставка не підтримується або підтримується частково`
- `High Risk`: `Високий ризик`
- `risk warning`: `Попередження про ризик`
- `Data coverage`: `Покриття даних`
- `Missing data checklist`: `Перелік відсутніх даних`
- `Leg`: `Нога`
- `soccer`: `футбол`
- `tennis`: `теніс`
- `status unverified`: `статус не перевірено`
- `not actionable`: `неактуально`
- `event already started or finished`: `подія вже почалась або завершилась`
- `Confidence`: `Впевненість`
- `Factor Analysis`: `Фактори ризику`
- `Download PDF`: `Завантажити PDF`
- `Copy to share`: `Скопіювати для поширення`
- `Watch`: `Спостерігати`
- `Skip`: `Пропустити`
- `Place Bet`: `Зробити ставку`

Proper names of teams, players, bookmakers, and original coupon text remain unchanged.

## Blocked Mode Output

Blocked/no-price mode must show:

- top-level no-price or not-actionable label
- data coverage score
- per-leg structured rows/cards:
  - leg number
  - sport
  - event
  - market / selection
  - fixture status
  - support level
  - missing data
  - actionability
- safe explanation for why no price is available
- safe next steps describing what data is required

Blocked/no-price mode must not show:

- `Model probability`
- `Implied probability`
- `Edge`
- `EV`
- `expected value`
- `negative edge`
- `real probability`
- `28.0%`
- `45.5%`
- `45.45%`
- `-17.4%`
- `21.6%`
- `25-30%`
- Ukrainian or Russian equivalents that imply a precise calculated price, including `реальна ймовірність`, `імплікована ймовірність`, `негативний край`, or `очікуване значення`

## Acceptance Fixture

Event:

```text
Сучжоу Донгву - Гуандун ДжейЗі-Пауер + Qingdao West Coast - Shanghai Port + Alex De Minaur - Zachary Svajda
```

Market:

```text
Експрес (3 ноги)
```

Selection:

```text
Гуандун ДжейЗі-Пауер + Over (2.0) + Alex De Minaur -4.0
```

Odds:

```text
2.2
```

Language:

```text
Ukrainian
```

Expected:

- all visible labels are Ukrainian
- no English Analyst result labels except proper names and original coupon terms
- leg 3 is tennis / `теніс`
- status/actionability appears per leg
- unknown status renders `статус не перевірено`
- missing checklist appears per leg
- Place Bet hidden
- Watch visible only while status is unknown/unverified
- Skip visible
- UI, PDF, share, and decision detail follow the same rules

