# Sports Data Provider Decision

> **CPO/Founder decision.**
> This is a decision record and architecture plan. It does not authorize
> integration code, schemas, migrations, or Supabase changes. Nothing here
> starts Scout v2 implementation.

---

## 1. Decision

**Football provider strategy: Option 2 — Split.**

- **API-Football / API-Sports Ultra** — broad football calendar, odds, and
  results. This is the breadth source for Scout: fixtures across leagues,
  odds availability, and result data at scale.
- **SportMonks** — deep football enrichment layer: xG, pressure/momentum
  metrics, predictions, and richer match facts for fixtures that need
  deeper analysis.
- **API-Tennis Business** — tennis source of truth: fixtures, odds, and
  results for tennis, end to end.

Football is intentionally split across two providers because breadth
(Scout/calendar coverage) and depth (deep analysis inputs) are different
requirements best served by different providers. Tennis uses a single
provider because API-Tennis already covers the full tennis need.

---

## 2. Why not SportMonks-only

SportMonks gives simpler provider IDs and strong per-match depth, but it is
not broad enough on its own to drive Scout/calendar breadth across the full
range of leagues and fixtures the product needs to surface. Using it alone
would narrow Scout's coverage.

---

## 3. Why not API-Football-only

API-Football is broad and cost-effective for calendar/odds/results coverage,
but it does not provide the deep football intelligence layer (xG, pressure,
predictions, richer match facts) that the Football Analyst v2 vision
requires. Using it alone would leave deep analysis under-supported.

---

## 4. Architecture principle

- The application uses **internal canonical fixture IDs** as the source of
  truth for identity across the product.
- **Provider IDs are never used as the primary application identity.** They
  are always secondary, mapped references.
- Each canonical fixture stores provider links:
  - `api_football_fixture_id`
  - `sportmonks_fixture_id`
  - `api_tennis_event_id`
- Each mapping carries a `mapping_confidence` value, since fixture identity
  across providers is matched (team names, kickoff time, competition), not
  guaranteed to align by ID.

This principle protects the product from being locked into any single
provider's ID scheme and allows providers to be added, swapped, or dropped
without breaking canonical fixture identity.

---

## 5. Phase 1 implications

Phase 1 technical plan now exists in `PHASE_1_TECHNICAL_PLAN.md` and was
merged as PR #63. Implementation still requires CPO review/accept per PR.
Phase 1 work needs to include:

- Provider abstraction layer (uniform internal interface over API-Football,
  SportMonks, and API-Tennis)
- Fixture sync (pull and reconcile fixtures into canonical records)
- Odds snapshot storage (timestamped, provider-attributed)
- Result sync (pull and reconcile results into canonical records)
- Mapping layer (canonical fixture ↔ provider ID, with `mapping_confidence`)
- Cache strategy (avoid re-fetching stable data; respect provider rate limits)
- **No AI-generated fixtures** — fixtures only ever come from providers

None of this is implemented by this document.

---

## 6. Football data flow

- API-Football pulls broad fixtures, odds, and results across covered
  leagues — this is Scout's primary breadth source.
- SportMonks enriches football fixtures that have been mapped to a
  canonical fixture, adding xG, pressure/momentum, predictions, and deeper
  match facts.
- If SportMonks enrichment is missing or unavailable for a given fixture,
  the system degrades to **basic mode** — analysis proceeds using
  API-Football data only, without the enrichment layer, rather than
  failing or fabricating enrichment data.

---

## 7. Tennis data flow

- API-Tennis handles tennis fixtures, odds, results, H2H, and player data
  end to end — there is no split provider strategy for tennis.

---

## 8. Auto-settlement implications

- Broad football settlement can start from API-Football result data.
- SportMonks can enrich or cross-check mapped marquee matches, adding a
  second signal for high-visibility fixtures.
- Tennis settlement starts from API-Tennis result data.
- Only markets confirmed safe for v1 (see `SPORTS_INTELLIGENCE_ARCHITECTURE.md`,
  Layer 7 — Settlement Engine) are eligible for auto-settlement. No
  auto-settlement is implemented by this document.

---

## 9. Security note

- `SPORTMONKS_TOKEN` was rotated after briefly appearing in an open field.
- Provider tokens are stored as **Vercel Sensitive env vars**.
- Code must **never log provider tokens or token-bearing request URLs**.
- SportMonks `api_token` must be redacted in logs/errors.
- No provider keys may use `NEXT_PUBLIC_` exposure.

This document does not read, print, or reference the value of any token. No
provider integration is implemented by this document.

---

## 10. Do not implement yet

- No Scout v2 code
- No DB migration
- No provider client
- No cron
- No auto-settlement

Phase 1 technical plan now exists and was merged as PR #63. Implementation
still requires CPO review/accept per PR. Do not merge PR #66 or apply
migration 013 until CPO review accepts it explicitly.