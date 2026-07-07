# M1.2.b — API-Football Fixture Dry-Run

**Date:** 2026-07-01
**Status:** Approved, pending implementation
**PR:** `feat: M1.2.b API-Football fixture dry-run (no writes)`
**Scope:** Real `fetchFixtures()` for API-Football only + a manual dry-run script. No Supabase reads or writes, no cron, no routes, no other provider/method touched.

---

## Goal

Prove that real fixture data can be fetched from API-Football and mapped into our canonical shape (`CanonicalFixtureDraft`), before any of that data is written anywhere. This is the first M1.2 slice that makes a real, data-bearing provider call (M1.2.a's `pingSmoke()` only checked auth/connectivity). Following the CPO decision record's "football deep first" priority, API-Football is the only provider touched.

---

## What is NOT in scope

- SportMonks or API-Tennis `fetchFixtures()` — remain scaffold-only (still throw), unchanged from M1.2.a.
- `ApiFootballAdapter.fetchOdds()` / `fetchResults()` — remain scaffold-only.
- Any Supabase access — no reads (no dedup/diff against existing `canonical_fixtures` or `fixture_provider_links`), no writes.
- Cron, scheduled execution, or an API route. This stays a manual script, same pattern as `scripts/provider-smoke.ts`.
- Migrations or schema changes.
- Scout / Analyst / settlement / UI changes.
- A `--season` CLI override or configurable competition list — the script targets EPL + Champions League, next 7 days, computed default season, hardcoded. Revisit if that assumption breaks in practice.

---

## 1. `ApiFootballAdapter.fetchFixtures()`

**Endpoint:** `GET https://v3.football.api-sports.io/fixtures` with query params `league`, `season`, `from`, `to`. Auth via the existing `x-apisports-key` header (unchanged from `pingSmoke()`).

**Season parameter:** API-Football's `/fixtures` requires `season` (a year) alongside `league`. Computed as `new Date(params.dateFrom).getFullYear()` — no override in this slice.

**Request/response flow:** Uses the existing `providerFetch<T>()` helper from `lib/providers/http.ts` — same timeout (8s default) and `sanitizeProviderError()` handling as every other adapter call. One request per competition ID passed in `params.competitionIds`; a failure on one competition does not abort the others (handled by the caller — the script — not inside `fetchFixtures()` itself, which fetches one competition per call as its `params` signature already implies via `competitionIds?: string[]` — for this slice, the script calls `fetchFixtures()` once per competition ID rather than passing multiple IDs in one call, keeping per-competition error isolation simple).

**Mapping to `CanonicalFixtureDraft`:**

| API-Football field | Canonical field | Notes |
|---|---|---|
| `fixture.id` | `providerFixtureId` (via `ProviderMeta`) | stringified |
| `fixture.date` | `kickoffAt` | ISO string, passed through as-is |
| `fixture.status.short` | `status` | via lookup table below |
| `teams.home.name` | `homeRef` | |
| `teams.away.name` | `awayRef` | |
| `league.name` | `competitionName` | |
| `league.country` | `competitionCountry` | |
| `league.season` | `season` | stringified |
| `league.round` | `round` | |
| `fixture.venue.name` | `venue` | |
| (full raw object) | `rawProviderPayload` (via `ProviderMeta`) | kept in memory only, never logged |

**Status code lookup table** (API-Football → our `FixtureStatus`):

| API-Football `status.short` | Canonical `FixtureStatus` |
|---|---|
| `TBD`, `NS` | `scheduled` |
| `1H`, `HT`, `2H`, `ET`, `BT`, `P`, `LIVE` | `live` |
| `FT`, `AET`, `PEN` | `finished` |
| `PST` | `postponed` |
| `CANC` | `cancelled` |
| `ABD` | `abandoned` |
| (anything else) | `scheduled` + a logged warning naming the unmapped code (code only, not the full raw payload) |

Unmapped codes never throw — a dry-run should surface a warning, not crash the whole run over one unfamiliar status string.

---

## 2. `scripts/fixture-sync-dry-run.ts`

Same compile/run pattern as `scripts/provider-smoke.ts`: added to `tsconfig.scripts.json`'s `include`, compiled to `build/provider-smoke/` (existing `outDir`, shared with the smoke script — no new build config needed), run via a new npm script `fixture-sync:dry-run`.

**Behavior:**
1. For each entry in `COMPETITION_MAP` (`lib/providers/competitions.ts`) that has an `api_football` ID: compute `dateFrom` = today, `dateTo` = today + 7 days, call `ApiFootballAdapter.fetchFixtures({ competitionIds: [id], dateFrom, dateTo })`.
2. On success: print the competition's canonical name, the fixture count, and up to 3 sample fixtures (`kickoffAt`, `homeRef` vs `awayRef`, `status`).
3. On failure: print the competition's canonical name and the sanitized `ProviderError`'s `kind`/`httpStatus`/message (already redacted by `sanitizeProviderError`) — never the raw URL or response body — then continue to the next competition.
4. Exit code: `0` if every competition succeeded, `1` if any failed. Same convention as `provider-smoke.ts`.

No `console.log` of `rawProviderPayload` anywhere in the script. No Supabase import in this file.

---

## 3. Testing / validation

Extends the existing `scripts/test-provider-safety.mjs` pattern (or a new sibling script) with, all offline / no network:

- The status-code lookup table is a pure function — unit-tested directly for each known code plus one unmapped code (asserting fallback to `scheduled` + a warning, not a throw).
- Regression guard: `ApiFootballAdapter.fetchOdds()`/`fetchResults()` and every SportMonks/API-Tennis method still reject instantly with a scaffold-only message (extends the existing M1.2.a test of the same shape).
- No `NEXT_PUBLIC` provider keys introduced (extends the existing grep-based check — already passes since no new env vars are added).

Required validation gates, same as M1.2.a: `npx tsc --noEmit`, `npm run build`, the extended `test:provider-safety` (or new test script), and `npm run fixture-sync:dry-run` run only if `API_FOOTBALL_KEY` is actually available — if not, report the missing var name only, same convention as `provider-smoke.ts`.

---

## Open questions / follow-ups (not blocking this slice)

- Whether/how to persist dry-run output for CPO review (currently: console output only, not saved to a file or PR comment).
- Season-boundary edge case: a 7-day window that spans a season rollover (e.g. late July/August) could need two `season` values — not handled in this slice, flagged for whoever builds the write path.
- Dedup/diff-against-DB logic and the actual write path are explicitly deferred to a later M1.2 phase.
