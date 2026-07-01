# Phase 1 Technical Plan — Sports Data Foundation

> **Status: CPO ACCEPT IN PRINCIPLE — minor changes incorporated below before M1 build.**
> This is a technical planning document only. It does not authorize code,
> schemas, migrations, Supabase changes, or Scout v2 implementation. M1 build
> does not start from this document alone — see Section 14, Decisions Before
> M1.

Builds on `DATA_PROVIDER_DECISION.md` (accepted split football provider
strategy: API-Football + SportMonks; API-Tennis for tennis) and
`SPORTS_INTELLIGENCE_ARCHITECTURE.md` (target layered architecture).

---

## 1. Purpose

Define the technical shape of Phase 1: the sports data foundation that
every later phase (Scout v2, Analyst v2, Market-Aware Bet Builder, Auto
Settlement) depends on. Phase 1 delivers real fixtures, odds, and results
behind a canonical, provider-agnostic data model — nothing more.

---

## 2. Scope for M1

M1 (first Phase 1 milestone) covers:

- Provider abstraction layer
- Fixture sync
- Odds snapshot storage
- Result sync
- Mapping layer (canonical fixture ↔ provider IDs, with `mapping_confidence`)
- Cache strategy

M1 explicitly does **not** cover Scout v2 UI/ranking, deep Analyst logic, the
Market-Aware Bet Builder, or auto-settlement execution — those are later
phases that consume this foundation.

**No AI-generated fixtures.** Every fixture, odds price, and result in the
system originates from a provider. AI is never a source of fixture/odds/
result truth.

---

## 3. Architecture principles

- Internal **canonical fixture IDs** are the application's source of truth
  for identity.
- **Provider IDs are never the primary application identity** — they are
  always secondary, mapped references, carried alongside the canonical
  record.
- Every provider mapping carries a `mapping_confidence` value, since
  cross-provider identity is matched (teams/players, kickoff time,
  competition), not guaranteed to align by ID.

---

## 4. Canonical entity model (concepts only — no migrations)

- **canonical_fixtures** — the internal source-of-truth fixture record
- **fixture_provider_links** — maps a canonical fixture to provider IDs
  (`api_football_fixture_id`, `sportmonks_fixture_id`,
  `api_tennis_event_id`) with `mapping_confidence`
- **odds_snapshots** — timestamped, provider-attributed price captures
- **fixture_results** — canonical result records, sourced from provider
  result data
- **football_enrichment** — SportMonks-sourced deep football data (xG,
  pressure/momentum, predictions, match facts), linked only to fixtures
  with a trusted mapping
- **market_catalog** — canonical market types and their provider-name
  mappings (see Section 7)

### Raw provider payload / debugging metadata

Provider-ingested tables should preserve enough raw/provider metadata to
debug mapping and data changes over time. This applies to
`fixture_provider_links`, `odds_snapshots`, `fixture_results`, and
`football_enrichment`:

- `raw_provider_payload jsonb` where appropriate — the provider's original
  response for the ingested record
- `provider_updated_at` if the provider exposes it — when the provider last
  changed the record
- `ingested_at` — when our system pulled/wrote the record
- Provider request/source metadata (which endpoint, which provider, which
  sync run) **without logging secrets** — no tokens, no full auth headers

This metadata exists to debug mapping drift and data discrepancies after
the fact, not to duplicate provider data as a second source of truth.

---

## 5. Provider abstraction layer

A uniform internal interface sits in front of API-Football, SportMonks, and
API-Tennis, so the rest of the system (fixture sync, odds sync, result
sync, enrichment) does not depend on any single provider's request/response
shape. Each adapter is responsible for:

- Translating provider responses into canonical shapes
- Attaching raw payload metadata (Section 4) for debugging
- Sanitizing all errors before they leave the adapter (Section 11)

---

## 6. Sync flows

### Fixture sync
- API-Football pulls broad fixtures across covered football leagues
- API-Tennis pulls tennis fixtures
- New fixtures are mapped to canonical fixtures (creating one if no match
  exists) via `fixture_provider_links`, with `mapping_confidence` assigned

### Odds snapshot storage
- Each odds pull is stored as a new `odds_snapshots` row — snapshots are
  never overwritten, since odds movement itself is a signal
- Snapshots carry provider, market (raw + normalized), timestamp, and
  price

### Result sync
- API-Football and API-Tennis results are pulled and written to
  `fixture_results`, keyed to the canonical fixture
- SportMonks may cross-check mapped marquee football fixtures (Section 8)

---

## 7. Market normalization

**Concept: `market_catalog` / market normalization.**

Provider market names must map to internal canonical market types before
they are usable anywhere else in the product (settlement, bet builder,
analysis). Raw provider market names are stored alongside the canonical
mapping for debugging.

Examples:

| Provider | Raw market name | Canonical market type |
|---|---|---|
| API-Football | "Match Winner" | `football_1x2` |
| API-Tennis | "Home/Away" | `tennis_moneyline` |

No downstream feature (Settlement, Bet Builder, Analyst) should ever read
a raw provider market name directly — always the canonical type.

---

## 8. Settlement — safe v1 markets

Auto-settlement eligibility per market, for v1:

- **Football 1X2** — safe v1
- **Double Chance** — safe only with explicit selection mapping (each
  double-chance selection must map deterministically to a settlement
  outcome; no implicit inference)
- **Draw-No-Bet** — safe only if a draw result maps to void / stake
  returned; this must be an explicit rule, not assumed
- **Over/Under** — only half-goal lines first (e.g. 2.5 / 3.5); whole
  lines are excluded from v1 (see below)
- **Whole-line totals / Asian totals / Asian handicaps** — deferred until
  push support is explicit; not eligible for v1 auto-settlement
- **Tennis moneyline** — safe only for normally completed matches
- **Tennis retired / walkover / abandoned** — v1 must mark these
  `needs_manual_review`, never auto-settle

**Before enabling auto-settlement for Draw-No-Bet, totals, or handicaps,
settlement rules must explicitly define won/lost/void/push behavior** for
every selection — no market goes live on inferred or default behavior.

This section governs eligibility only; the settlement engine itself is not
built in Phase 1 M1 (see Section 2).

---

## 9. Mapping layer & review queue

- A fixture/entity mapping with confidence `needs_review` must **never**
  be used to drive enrichment, betting recommendations, or auto-settlement.
- Only **exact** or **high** confidence mappings may drive SportMonks
  enrichment.
- **Medium** confidence mappings may be displayed internally (for review/
  debugging) but must not affect user-facing analysis until promoted to
  high/exact.
- **Basic mode fallback is required**: when a football fixture's
  enrichment mapping is not trusted (medium or below, or missing), the
  system proceeds using API-Football data only — it does not block, guess,
  or fabricate enrichment.

---

## 10. Tennis participant naming

`canonical_fixtures` uses a neutral conceptual participant model, not a
football-shaped home/away model:

- `participant_a_ref` / `participant_b_ref` are the neutral, sport-agnostic
  fields
- `home_ref` / `away_ref` apply only where the sport has genuine home/away
  semantics (football)
- Tennis fixtures use `player_1`/`player_2` or `participant_a`/`participant_b`
  — never `home`/`away`, since tennis has no home/away concept

---

## 11. Provider secret hygiene

Guardrails for all provider integration work (M1 and beyond):

- Provider tokens are **server-side only** — never exposed to the client
- **No `NEXT_PUBLIC_` provider keys**, under any circumstance
- **Never log provider tokens**, in application logs, error messages, or
  CI output
- **Never log raw request URLs containing `api_token`** — redact query
  strings before logging any request URL
- **Redact SportMonks `api_token`** in all errors and logs
- Adapter errors must be **typed and sanitized** before propagating —
  raw provider error bodies are not surfaced verbatim if they may contain
  request parameters or tokens

See `DATA_PROVIDER_DECISION.md` Section 9 — `SPORTMONKS_TOKEN` rotation is
required before any integration work begins.

---

## 12. Cache strategy

- Stable/semi-stable provider data (competitions, teams, players, venues)
  is cached and refreshed on a low-frequency schedule, not re-fetched per
  request
- Fixture/odds/result sync runs on a scheduled cadence appropriate to each
  data type's volatility (fixtures: hourly-scale; odds: much more frequent;
  results: post-fixture polling)
- Cache strategy must respect each provider's rate limits — sync frequency
  is bounded by provider plan limits, not by product desire for freshness

---

## 13. Scope: first competitions (CPO confirmed)

**Football (Phase 1):**
- World Cup 2026 / international marquee events
- UCL / Euro club competitions where covered
- Top-5 EU leagues where available via API-Football
- SportMonks enrichment only where mapping confidence is exact/high and coverage exists in the paid SportMonks stack

**Tennis (Phase 1):**
- ATP / WTA main tour
- Grand Slams / major tournaments where API-Tennis coverage is reliable

Do not attempt "everything" in Phase 1.

---

## 14. Decisions before M1

1. ✅ Confirm SportMonks token rotation complete — CPO/founder confirmed rotated in Vercel.
2. ✅ Confirm first football competitions — CPO confirmed per §13 scope.
3. ✅ Confirm first tennis tournaments/tours — CPO confirmed per §13 scope.
4. ✅ Confirm safe v1 market list with push/void rules — CPO confirmed per §8 restricted list.
5. ✅ Confirm tennis retirement/walkover policy — manual review in v1.
6. ✅ Confirm cron host — Vercel Cron for M1 unless proven insufficient.

M1 build does not start from this document alone. It starts only after this docs PR is merged and CPO gives an explicit M1 implementation prompt.

---

## 15. Out of scope for M1

- No Scout v2 code
- No DB migration
- No provider client implementation
- No cron implementation
- No auto-settlement implementation
- No Supabase changes

This document is planning only.
