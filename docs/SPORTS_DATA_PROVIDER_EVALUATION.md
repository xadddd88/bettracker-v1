# SPORTS_DATA_PROVIDER_EVALUATION.md

> **Type:** Research-only decision document. No code, no integration, no DB schema, no Scout v2.
> **Context:** `PRODUCT_VISION_GAP.md` (BetTracker AI → future LineHunter AI).
> **Goal:** Select a **sports data provider strategy for Phase 1** — the gate that unlocks calendar-driven Scout v2, deep football/tennis analysis, market-aware bet variations, current-odds snapshots, auto-settlement, public previews, and future learning/calibration.
> **Sports in scope:** Football (soccer) first, Tennis second.
> **Decision owner:** Dima / CPO.
> **Prepared:** 2026-07-01. All pricing/coverage/limits are provider-published or third-party-reported values current as of this date and **must be re-confirmed on the provider's own pricing page before contracting** (see §9).

---

## 1. Executive Summary

**Recommended Phase 1 strategy: adopt the API-Sports family as the single primary provider — `API-Football` for football and `API-Tennis` for tennis.**

This is the only *affordable* option that covers **both football and tennis** with **fixtures + results + pre-match/live odds + stable numeric IDs** under one vendor, one auth model, and one consistent data shape. Combined beta cost is roughly **$40–$100/month** across both sports, versus **$5,000–$10,000+/month** for the enterprise odds/settlement providers. [api-football pricing], [api-tennis pricing via SportsAPI], [lsports cost guide]

- **Best all-in-one option:** **API-Sports (API-Football + API-Tennis).** One family, both sports, fixtures/results/odds/IDs, trivial beta cost. This is the recommendation.
- **Best split strategy if we outgrow it:** **SportMonks (deep football, incl. xG & TXOdds premium odds) + API-Tennis (tennis)**, optionally enriched by **TheOddsAPI** for multi-bookmaker line movement. Split raises integration cost and introduces two ID systems, so **defer** until football analysis depth or odds granularity becomes the real bottleneck. [sportmonks pricing], [sportmonks premium odds]
- **Enterprise tier (defer):** **Sportradar** (official, 50+ sports incl. tennis+football) and **OpticOdds** (real-time automated bet grading/settlement across 100+ sportsbooks) are the quality/settlement benchmarks but are form-gated and start at ~$5k–$10k+/month — revisit only when auto-settlement accuracy or "official odds" become revenue-critical. [sportradar pricing], [opticodds pricing]
- **Main risks with the recommendation:**
  1. **Results latency** — API-Football final results can lag **up to 48h** for lower-coverage competitions, which constrains auto-settlement to top leagues. [api-football coverage]
  2. **Odds depth** — API-Sports odds are adequate for a snapshot but shallower on bookmaker breadth and line-movement than SportMonks-Premium/TheOddsAPI/OpticOdds.
  3. **Two products, not one endpoint** — football and tennis are separate API-Sports products (separate keys/quotas), though the data model and conventions are shared.
- **Decision needed from founder/CPO:** approve API-Sports for Phase 1, and approve the **auto-settlement scope limit** (top leagues + safe markets only) described in §5 and §8.

---

## 2. Product Requirements

What Phase 1 data must support (derived from `PRODUCT_VISION_GAP.md`):

| Requirement | Why it matters | Minimum bar |
|---|---|---|
| **Football fixtures / calendar** | Scout v2 must be fixture-driven, not LLM-fabricated | Real upcoming fixtures by league + date, days ahead |
| **Tennis fixtures / calendar** | Same, for ATP/WTA/Grand Slam | Real upcoming matches with tournament/round context |
| **Results / match status** | Auto-settlement + calibration | Final result + a status lifecycle (NS → live → FT) |
| **Odds snapshot** | Market-aware bet variations, value signals | At least pre-match main-market odds per fixture |
| **Stable fixture IDs** | Shared key across Scout → Analyst → Bet → Settlement | Persistent numeric/string ID reused across endpoints |
| **Deep-analysis inputs** | Football/tennis Analyst v2 | Form, H2H, standings, stats; surface/ranking for tennis |
| **Auto-settlement feasibility** | Remove manual-only settlement | Reliable result + status + result timestamp |
| **Beta cost** | Pre-revenue | Low fixed monthly cost, no enterprise minimum |
| **Production scale path** | Post-beta | Clear upgrade tier or migration path |
| **Future compat** (mobile / public / i18n) | Public previews + multilingual | Data must be cacheable and locale-neutral (IDs/UTC) |

**Non-goals for this doc:** picking specific markets to build, DB schema, sync code, or Scout v2 logic. Those follow the provider decision.

---

## 3. Provider Comparison Table

| Provider | Football fixtures | Tennis fixtures | Results | Odds | Deep-analysis data | Auto-settlement fit | Pricing fit (beta) | API quality | Main risk | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|
| **API-Sports — API-Football** | ✅ 1,200+ leagues | — (separate product) | ✅ (some lag ≤48h) | ✅ pre-match + live | ✅ form, H2H, standings, stats, predictions | ⚠️ good for top leagues | ✅✅ free–$19/mo | Good, well-documented | Results lag on minor comps; shallow odds | **Primary (football)** |
| **API-Sports — API-Tennis** | — | ✅ ATP/WTA/ITF | ✅ scores/results | ✅ pre-match | ✅ standings, stats, H2H | ⚠️ decent | ✅ $40–$80/mo | Good, same family | Odds shallower than specialists | **Primary (tennis)** |
| **SportMonks** | ✅ 2,200+ leagues, deep (xG) | ❌ **no tennis** | ✅ states lifecycle | ✅ Standard + Premium (TXOdds, 42 mkts / 145+ books) | ✅✅ deepest football stats | ✅ states + odds history | ⚠️ €39–€219/mo (football only) | Very good | No tennis → still need 2nd provider | **Defer / football-depth upgrade** |
| **Sportradar** | ✅ official | ✅ official | ✅ official, low latency | ✅ official odds comparison | ✅✅ enterprise | ✅✅ best | ❌ ~$10k+/mo | Excellent | Cost + commercial licensing | **Defer (enterprise)** |
| **TheOddsAPI** | ⚠️ odds events only | ⚠️ odds events, match-winner mainly | ❌ no deep results | ✅✅ many books, line movement | ❌ odds only | ❌ no grading | ✅ free–~$199/mo (credit-based) | Simple, clean | Odds-only; credits burn fast | **Optional odds enrichment** |
| **OpticOdds** | ✅ (odds context) | ✅ (odds context) | ✅ real-time grading | ✅✅ 100+ books, in-play | ⚠️ odds/props/injuries | ✅✅ automated grading | ❌ ~$5k+/mo | Excellent | Cost + form-gated | **Defer (settlement upgrade)** |

Legend: ✅✅ best-in-class · ✅ meets bar · ⚠️ partial/conditional · ❌ not suitable / missing. See §9 for pricing-confirmation caveats.

---

## 4. Provider Deep Dives

### 4.1 API-Sports — API-Football (recommended primary, football)

- **Coverage:** 1,200+ leagues/cups; fixtures, livescores, standings, events, line-ups, players, statistics, predictions, and pre-match + live odds; real-time matches updated every ~15s. [api-football coverage]
- **Stable IDs:** persistent numeric IDs for fixture, league, team, player — reusable across all endpoints (the shared-ID property Scout→Settlement needs).
- **Odds:** pre-match odds (`getOdds`, `getBookmakers`, `getBets`, `getMapping`) plus in-play odds (`getodds/live`); a per-competition `coverage` flag signals whether odds/stats/lineups exist for that league-season. [api-football odds/coverage]
- **Results/settlement caveat:** competitions without livescore keep status `NS` and only get a **final result up to 48h after the match** — so results are not uniformly low-latency. [api-football coverage]
- **Pricing (published):** Free = 100 requests/day; **Pro $19/mo = 7,500 req/day**; scaling tiers up to ~1.5M req/day (custom). Rate limits scale by plan (Free 10 req/min → higher tiers 300–1,200 req/min). [api-football pricing], [api-football ratelimit]
- **Verdict:** the cheapest credible way to get football fixtures + results + odds + stable IDs in one place. Ideal Phase-1 football spine.

### 4.2 API-Sports — API-Tennis (recommended primary, tennis)

- **Coverage:** ATP, WTA, ITF, Grand Slam / Masters / Challenger; livescore, schedules & results, stats, standings, pre-match odds. [api-tennis review]
- **Same family as API-Football** — shared conventions and ID style reduce integration cost vs. mixing unrelated vendors.
- **Pricing (reported):** Starter $40/mo (8,000 req/day), Premium $60/mo (80,000 req/day), Business $80/mo (200,000 req/day). [api-tennis pricing via SportsAPI]
- **Verdict:** the pragmatic tennis choice for beta — same mental model as football, low cost, covers the fixtures/results/odds bar. Odds depth is shallower than specialist tennis-odds feeds, acceptable for v1.

### 4.3 SportMonks (deepest football; **no tennis**)

- **Coverage:** 2,200+ leagues, strong live data, and the deepest football stats set (incl. xG); States endpoint gives a clean fixture lifecycle for settlement. [sportmonks football api]
- **Odds:** Standard odds feed on all plans; **Premium Odds feed via TXOdds** — 42 markets from 145+ bookmakers; in-play refresh ~1s, pre-match ~every 10 min; odds history retained up to 7 days after kickoff incl. opening odds and change history (useful for line movement). [sportmonks premium odds], [sportmonks odds faq]
- **Pricing:** football tiers ~€39–€219/mo depending on league scope and region (Europe vs Worldwide, Basic/Standard/Advanced). Yearly ~20% off. [sportmonks pricing]
- **Blocker for us:** **SportMonks does not currently offer tennis** — so it can never be a single-provider solution for our two sports. Choosing it means SportMonks (football) **+** a separate tennis provider = two ID systems. [sportmonks tennis coverage]
- **Verdict:** best *football* upgrade if/when API-Football's stat depth or odds granularity limits Analyst v2. Defer until that's the proven bottleneck.

### 4.4 Sportradar (enterprise benchmark)

- **Coverage:** 50+ sports incl. football and tennis, official licensed feeds, odds comparison, low-latency results, widgets/editorial — B2B. [sportradar coverage]
- **Pricing:** no public pricing; enterprise contracts commonly **$10,000+/month**, negotiated by sport/volume/scale; season-by-season adjustments. [sportradar pricing], [lsports cost guide]
- **Verdict:** the quality and official-data benchmark, and the right answer at real scale or when "official odds"/regulatory trust matter — but wildly over-scoped and over-priced for a paused pre-beta. Defer.

### 4.5 TheOddsAPI (odds aggregation only)

- **Coverage:** 11+ sports incl. soccer and tennis; ~40 mainstream bookmakers (Bet365, DraftKings, FanDuel, William Hill…). Tennis is **mainly match-winner** with limited spreads/totals. [theoddsapi tennis], [theoddsapi coverage]
- **Model:** credit-based — each `/odds` call costs `markets × regions` credits, so querying many markets/regions burns the allowance fast. Free = 500 credits/month; paid tiers scale up (third-party report: ~$20 → ~$199/mo for 20k → 12M credits — **confirm on official pricing page**). [theoddsapi pricing (3rd-party)]
- **No fixtures depth, no results/grading, no stats.** It is an odds layer, not a spine.
- **Verdict:** optional **odds-enrichment** later — cheap multi-bookmaker line movement to strengthen the market-aware bet builder — layered on top of an API-Sports spine. Not a primary provider.

### 4.6 OpticOdds (real-time odds + automated settlement)

- **Coverage:** 100+ sportsbooks across 25+ sports incl. soccer and tennis; pre-match, in-play, player props, injuries, lineups, historical odds, limits. [opticodds coverage]
- **Settlement:** grades bets in real time across **Won / Lost / Refunded / Half Won / Half Lost** the moment markets resolve — exactly the auto-settlement engine we'd otherwise build ourselves. [opticodds grading]
- **Pricing:** form-gated, reported to **start ~$5,000/month**. [opticodds pricing]
- **Verdict:** the strongest *settlement/market-aware* answer, and the natural upgrade when auto-settlement reliability becomes revenue-critical. Defer for beta on cost.

---

## 5. Auto-Settlement Implications

Auto-settlement needs three things from the provider: a **stable fixture_id**, a **result_status lifecycle**, and a **trustworthy final result with a timestamp**. Under the recommended API-Sports spine:

- **Safe v1 markets (auto-settle):**
  - Football **1X2 / Match Result** (home / draw / away) — deterministic from final score.
  - Tennis **Match Winner** — deterministic from completed-match result.
- **Unsafe / manual-review markets (v1):** Asian handicaps, over/under lines, BTTS, correct score, set/game handicaps, player props, anything voided by retirement/walkover/abandonment.
- **fixture_id requirement:** the *same* provider ID must be stamped on the object at Scout time and carried through Analyst → Bet → Settlement. API-Sports numeric IDs satisfy this within each sport; **football and tennis IDs live in separate namespaces**, so store `sport + provider_fixture_id` as the composite key.
- **result_status lifecycle:** map provider statuses to an internal enum — e.g. `NS` (not started) → `LIVE/1H/HT/2H` → `FT` (finished) → `settled`; plus abnormal terminals `PST` (postponed), `CANC`, `ABD` (abandoned), `WO` (walkover, tennis), `RET` (retired, tennis).
- **Settlement edge cases to handle manually in v1:** ≤48h result lag on low-coverage football competitions (gate auto-settle to leagues with livescore coverage only); tennis retirements/walkovers (many books void — do **not** auto-settle); postponed/rescheduled fixtures (result never arrives against original datetime); provider score corrections after settlement (need an audit trail + reversal path).
- **Confidence-score rule (v1):** auto-settle only when `market ∈ safe-set AND status == FT AND competition ∈ livescore-covered`; everything else → manual review queue. [api-football coverage]

---

## 6. Market-Aware Bet Builder Implications

Can the provider feed a value/edge calculation? Per-provider capability for the odds inputs the bet builder needs:

| Odds input | API-Sports (Football/Tennis) | SportMonks (football) | TheOddsAPI | OpticOdds |
|---|---|---|---|---|
| Current pre-match odds | ✅ | ✅ | ✅ | ✅ |
| In-play / live odds | ✅ (football; ~15s) | ✅ (~1s) | ⚠️ limited | ✅ |
| Bookmaker / source attribution | ✅ (per-book) | ✅ (145+ via Premium) | ✅ (~40 books) | ✅ (100+ books) |
| Odds timestamp | ⚠️ snapshot-based | ✅ (change history) | ✅ | ✅ |
| Best-price across books | ⚠️ derive client-side | ✅ derive from feed | ✅ | ✅ |
| Line movement / opening→closing | ⚠️ limited | ✅ (opening + history 7d) | ✅ | ✅ |
| Market breadth (FB/tennis) | ⚠️ main markets | ✅ 42 markets (football) | ⚠️ tennis mostly match-winner | ✅✅ deep |
| Fair-odds / edge input quality | ⚠️ OK for v1 | ✅ | ✅ | ✅✅ |

**Implication:** API-Sports supports a **credible v1 bet builder** (current odds, per-book, main markets, simple best-price). For **line-movement / closing-odds / sharp-vs-public** signals, layer **TheOddsAPI** (cheap) or move football to **SportMonks Premium** — but only when the product actually surfaces those signals to users. Don't pre-buy depth Scout v2 won't yet use.

---

## 7. Scout v2 Implications

Provider selection is what changes Scout from *fabrication* to *fixture-first*:

1. **Retrieve** real upcoming fixtures from the provider (API-Football / API-Tennis), filtered by sport, league/tour, date window, and importance.
2. **Attach** odds + available markets to each real fixture (same provider first; enrich later).
3. **Rank** candidates by value/opportunity signals computed from real odds (and, later, model output).
4. **Explain** with AI **only after** real data retrieval — the LLM annotates and ranks; it never invents matches or IDs.
5. **Guarantee** every Scout candidate carries a real `sport + provider_fixture_id`, so it flows cleanly into Analyst → Bet → Settlement.

Net: the LLM's job shrinks from "generate matches" to "explain and prioritize a real, provider-sourced fixture list." The provider is the source of truth; the model is the commentary layer.

---

## 8. Recommended Phase 1 Architecture (research-level, not implementation)

- **Provider choice:** **API-Sports** — API-Football (football) + API-Tennis (tennis). One family, two keys.
- **Odds:** start with API-Sports built-in pre-match odds. **Defer** TheOddsAPI enrichment and OpticOdds until the bet builder/settlement actually needs deeper books or automated grading.
- **Sync cadence (starting point, to be tuned against rate limits):**
  - Fixtures/calendar: pull a rolling **N-day window** a few times per day.
  - Odds: refresh on a schedule ahead of kickoff (tighter as kickoff approaches); live odds only for matches actively in Scout.
  - Results: poll finished fixtures shortly after expected end, with a **retry window up to 48h** for low-coverage football. [api-football coverage]
- **Caching strategy:** cache aggressively keyed on `sport + provider_fixture_id`; store **opening/last-seen odds snapshots** so the same fixture/market reuses prior analysis (ties directly into the AI cost-caching gap in `PRODUCT_VISION_GAP.md`).
- **Store internally:** fixtures, stable IDs, statuses, final results, odds snapshots, and settlement audit records. **Fetch live:** in-play odds/scores only when needed.
- **Football/tennis first markets:** football **1X2**; tennis **Match Winner** — the safe auto-settle set.
- **Defer:** Asian handicaps, totals, props, correct score, set/game handicaps; SportMonks/Sportradar/OpticOdds; live-trading features.

---

## 9. Open Questions for Dima / CPO

1. **Confirm pricing before contracting.** Sportradar and OpticOdds are quote-only; TheOddsAPI paid-tier numbers here come partly from third-party reporting. Re-verify all figures on each provider's own pricing page (values move). [theoddsapi pricing (3rd-party)], [opticodds pricing], [sportradar pricing]
2. **Auto-settlement scope:** OK to limit v1 auto-settlement to **top leagues + safe markets only**, with everything else in a manual queue? (Driven by the ≤48h result lag.)
3. **Odds depth for v1:** is main-market pre-match odds enough for the first bet builder, or must line movement / closing odds ship in v1 (which would pull in TheOddsAPI or SportMonks Premium sooner)?
4. **Football depth threshold:** what specific analysis inputs (xG, deeper stats) would justify moving football from API-Football to SportMonks?
5. **Tennis odds tolerance:** is match-winner-centric tennis odds acceptable for beta, or do we need set/game markets (→ specialist tennis-odds feed)?
6. **Scale trigger:** what usage/revenue milestone flips us to Sportradar/OpticOdds for official data + automated settlement?
7. **Commercial/licensing:** any jurisdiction where we'd advertise "official odds" (which would force Sportradar/Genius earlier)?
8. **Data retention/ToS:** confirm each provider's caching/storage limits permit the internal storage in §8.

---

## 10. Final Recommendation

- **Choose API-Sports (API-Football + API-Tennis) for Phase 1** because it is the only low-cost option that gives **fixtures + results + odds + stable IDs for both football and tennis** under one vendor and data model, at ~$40–$100/month — enough to unlock Scout v2, deep-analysis inputs, a v1 market-aware bet builder, and safe-market auto-settlement, without an enterprise contract. [api-football pricing], [api-tennis pricing via SportsAPI]
- **Use TheOddsAPI for odds enrichment *only if needed*** — a cheap way to add multi-bookmaker line movement to the bet builder later, layered on the API-Sports spine, not as a primary provider. [theoddsapi pricing (3rd-party)]
- **Defer SportMonks** to a football-depth upgrade (deepest football stats + TXOdds premium odds) — but note it has **no tennis**, so it's a split-strategy component, never a single solution. [sportmonks premium odds], [sportmonks tennis coverage]
- **Defer Sportradar and OpticOdds** to the scale/settlement phase — best-in-class official data and automated bet grading respectively, but ~$5k–$10k+/month and form-gated; revisit when auto-settlement accuracy or official odds become revenue-critical. [sportradar pricing], [opticodds pricing], [opticodds grading]
- **Constrain auto-settlement in v1** to top leagues + safe markets (football 1X2, tennis Match Winner), because API-Football final results can lag up to 48h on low-coverage competitions. [api-football coverage]

**One-line decision:** *Adopt API-Sports for Phase 1 (football + tennis); keep TheOddsAPI as an optional odds layer and SportMonks/Sportradar/OpticOdds as named upgrade paths for depth, official data, and automated settlement.*

> **Do not turn this into an implementation plan yet.** First we need the provider decision. Build plan comes after §10 is approved.

---

## Sources

- API-Football — pricing plans: https://www.api-football.com/pricing
- API-Football — how rate limit works: https://www.api-football.com/news/post/how-ratelimit-works
- API-Football — football coverage (odds, fixture status, ≤48h results): https://api-sports.io/sports/football and https://www.api-football.com/documentation-v3
- API-Sports — main site / plans: https://api-sports.io/
- API-Tennis — review, pricing & data (SportsAPI directory): https://sportsapi.com/api-directory/api-tennis/
- API-Tennis — product site: https://api-tennis.com/
- SportMonks — plans & pricing: https://www.sportmonks.com/football-api/plans-pricing/
- SportMonks — Premium Odds feed (TXOdds, 42 markets / 145+ bookmakers): https://www.sportmonks.com/football-api/premium-odds-feed/
- SportMonks — odds FAQ (update cadence, 7-day history): https://docs.sportmonks.com/v3/faq/odds
- SportMonks — products (football, cricket, F1; tennis not listed): https://www.sportmonks.com/products/
- Sportradar — sports data API coverage: https://sportradar.com/media-tech/data-content/sports-data-api/
- Sportradar — tennis product (marketplace): https://marketplace.sportradar.com/products/6501e20f236aba44b550bdae
- LSports — "How Much Does Sports Data Cost in 2026?" (enterprise pricing context): https://www.lsports.eu/blog/sports-data-cost/
- The Odds API — main site & coverage: https://the-odds-api.com/
- The Odds API — tennis odds coverage: https://the-odds-api.com/sports/tennis-odds.html
- The Odds API — pricing (2026 comparison, third-party): https://oddspapi.io/blog/odds-api-pricing-2026-comparison/
- OpticOdds — sports betting / odds API & sportsbook coverage: https://opticodds.com/sports-betting-api
- OpticOdds — automated real-time bet grading/settlement: https://opticodds.com/copilot
