# Finished Fixture Eligibility & Result-Presence Dry-Run Scope — Decision #059

## Status

**EXECUTED / CLOSED by merge of the Decision #059 PR — DOCS / EVIDENCE ONLY.**

Founder approval: `APPROVE #059`.

This decision implements nothing. It records the eligibility verdict for a future zero-write result-presence dry-run and pins that run's fail-closed contract. Provider calls 0; Supabase writes 0; runtime code 0.

## Objective

Determine whether exactly one eligible canonical **finished** fixture exists for a future zero-write result-presence dry-run (Decision #057 promotion gate 1), and define — without implementing — the fail-closed contract that the future run must satisfy.

## 1. Repository audit (schema and existing paths)

All claims proven from the repository at `main = a4ea1ea`; detailed line-level evidence is in Decision #057 (`docs/results-ingestion-settlement-trust-contract-decision-057.md` §1.5, §1.8).

- `canonical_fixtures.status` CHECK (`supabase/migrations/013_sports_data_foundation.sql`): `scheduled | live | finished | postponed | cancelled | abandoned | retired | walkover`. **`finished` is the only value that can satisfy the final/finished eligibility criterion**; `retired`/`walkover` are tennis outcomes and additionally carry a mandatory manual-review rule; every other value is non-final.
- `fixture_provider_links` (013): `mapping_confidence CHECK (exact|high|medium|low|needs_review)`, `UNIQUE (provider, provider_fixture_id)`, `UNIQUE (canonical_fixture_id, provider)`.
- `fixture_results` (013): exists in schema, service-role-only (RLS with no policies), and is read/written by **zero** application code. It has no schema version, finality state, or revision lineage (Decision #057 G7/G8).
- Status normalization DOES exist upstream of identity sync: the API-Football adapter maps `FT`/`AET`/`PEN` (and long-form "finished") to `finished` (`lib/providers/adapters/api-football.ts:69`), and the API-Tennis adapter likewise maps final provider statuses to `finished` (`lib/providers/adapters/api-tennis.ts:67`).
- The gated fixture-sync write path (`SPORTS_FIXTURE_SYNC_WRITE_ENABLED`, operator-run) CAN update `canonical_fixtures.status` for an already-linked fixture: `canonicalFixtureRow` carries `status` (`lib/providers/fixture-sync.ts:123`) and the existing-link branch updates the canonical row in place (`lib/providers/fixture-sync.ts:179`).
- That path writes `canonical_fixtures` and `fixture_provider_links` only — it never writes `fixture_results`. No result-ingestion or result-normalization write path exists (Decision #057 §1.5/§1.8).
- A `finished` status by itself proves neither a normalized result, nor finality, nor freshness in the Decision #057 Layer B sense — those require the separately gated result-normalization contract (#057 §8).
- Precedent contracts reused here: Decision #034 (canonical-linked identity-gated single request), #056 (presence-only sanitized report), #057 (Layer A/B/C separation; provider finality alone never authorizes anything downstream).

Consequence for eligibility: a candidate's "final/finished" status can only be proven by `canonical_fixtures.status = 'finished'`. A past kickoff with `status = 'scheduled'` is NOT evidence of finality — the local status may simply be stale until a status refresh through the reviewed, gated sync path is separately authorized and run, so any inference from kickoff time alone fails closed.

## 2. Production inventory (read-only, 2026-07-14)

Performed as three read-only `SELECT`s against exactly three sports tables (`canonical_fixtures`, `fixture_provider_links`, `fixture_results` count only). **No bets, users, bankroll, or financial data were read. Zero writes.**

### canonical_fixtures — 3 rows, all `sport = football`

| Canonical fixture ID | Kickoff (UTC) | Status |
|---|---|---|
| `92afd570-399a-48b9-915a-e1ffaf52a71c` | 2026-08-21 19:00 | `scheduled` |
| `5a42d721-b517-4251-8448-d62bff513c19` | 2026-12-31 12:30 | `scheduled` |
| `3c37358c-69d0-4964-beac-029d61f7b7b2` | 2026-12-31 14:30 | `scheduled` |

### fixture_provider_links — 4 rows

| Canonical fixture | Provider | Provider fixture ID | Confidence |
|---|---|---|---|
| `92afd570-…` | api_football | `1557367` | exact |
| `92afd570-…` | sportmonks | `19722203` | high |
| `5a42d721-…` | api_football | `1576052` | exact |
| `3c37358c-…` | api_football | `1576053` | exact |

### fixture_results

`0` rows.

## 3. Eligibility verdict

Criteria (all must hold; any uncertainty fails closed):

| Criterion | Result |
|---|---|
| sport = football | PASS for all 3 fixtures |
| kickoff already in the past (vs 2026-07-14) | **FAIL for all 3** — earliest kickoff is 2026-08-21 19:00 UTC (+38 days); the other two are 2026-12-31 |
| local status is unambiguously final (`finished`) | **FAIL for all 3** — every status is `scheduled`; `fixture_results` is empty, so no local result evidence exists either |
| exact/high provider link exists | PASS for all 3 (api_football exact; `92afd570-…` additionally sportmonks high) |
| provider + fixture ID usable for one fixture-by-ID request | PASS for all 3 |

### VERDICT: **ELIGIBILITY BLOCKED**

**Exact blocker:** production contains zero canonical fixtures whose kickoff has passed and zero fixtures in a final state. All three canonical fixtures are future, `scheduled`, unplayed matches; `fixture_results` has no rows. There is nothing a result-presence dry-run could legitimately target today — and per §1, even a past kickoff with a stale `scheduled` status would not suffice without a separately authorized status refresh through the reviewed sync path.

**What was NOT done (per instructions):** no fixture, provider link, or result row was created; no provider was called; nothing was mutated to manufacture eligibility.

**Unblock paths (each requires its own future decision; none is authorized here):**

1. Wait until an already-linked fixture (earliest: `92afd570-…`, kickoff 2026-08-21 19:00 UTC) has been played, then separately authorize a status refresh / re-verification through the EXISTING reviewed path — the gated fixture-sync update branch, whose adapters already normalize final provider statuses (`FT`/`AET`/`PEN` → `finished`).
2. Separately approve mapping an already-finished historical fixture through the approved identity flow (Decision #044–#046 pattern: discovery → confidence-gated link write).

Either path is followed by a repeated bounded inventory / result-presence eligibility check before any runtime authorization. No provider calls and no writes happen under Decision #059 itself.

## 4. Future dry-run contract (defined, NOT implemented)

When an eligible fixture exists, the result-presence dry-run must satisfy every clause below. This section authorizes nothing — implementation, runtime execution, normalization/storage, and settlement each require separate future decisions.

1. **Pinned scope:** exactly one canonical fixture ID and exactly one exact/high provider link (provider + provider fixture ID), pinned as literals in the decision that approves implementation. No fixture selection at runtime.
2. **Request budget:** at most ONE provider fixture-by-ID request. No retry, no pagination, no crawl, no fallback endpoint, no alternate provider on failure. Any first outcome consumes the budget.
3. **DB preflight before token load:** canonical fixture and provider link are re-verified via service-role reads BEFORE the provider token is read from the environment (Decision #034/#056 pattern). Any preflight failure → sanitized blocked report, zero provider calls.
4. **Identity validation fails closed:** provider response must match the pinned fixture identity (fixture ID, sport, kickoff within approved tolerance). Present-but-invalid identity fields block, exactly as in Decision #034 v3.
5. **Finality/freshness classification fails closed:** provider state maps through an explicit classification to `final | not_final | unknown`; `unknown` or ambiguous states, and missing/invalid source freshness (`sourceUpdatedAt` distinct from `collectedAt`; `collectedAt` is never source freshness), are reported as such and block any downstream use. Provider finality alone authorizes nothing (Decision #057 §5).
6. **Sanitized presence-only report.** Allowed report contents, exhaustively: canonical/provider IDs; normalized ISO timestamps; status/finality classification values; boolean presence flags and bounded counts (e.g. "score fields present: true/false").
7. **Forbidden report contents:** raw provider payload (in the response, logs, or persistence); team, player, or venue names; scores as values beyond presence flags are NOT required and default to excluded unless the implementing decision explicitly approves score presence semantics; odds; predictions; probability, implied probability, edge, EV, recommendation, Place Bet, or any betting signal; any inferred settlement outcome for any bet (FP-001 and Decision #057 Layer C remain fully gated).
8. **Writes: none.** No `fixture_results` row, no `canonical_fixtures.status` update, no enrichment write, no bet/leg/bankroll mutation. The run is Layer A observation only (Decision #057 §2) and produces a report, not state.
9. **Separate future decisions required for:** implementation PR; production runtime authorization (single-use, per the #034/#056 precedent); result normalization/storage (Layer B, Decision #057 §8 storage contract + migration); any settlement work (Layer C, Decision #057 gates 3–5).

## 5. Explicit non-use (this decision)

```txt
provider calls: 0
Supabase writes: 0
Supabase reads: 3 read-only SELECTs on canonical_fixtures / fixture_provider_links / fixture_results(count) only
bets / users / bankroll / financial data read: none
migrations / schema / env changes: 0
API routes / lib / runtime code / tests: 0
result ingestion / normalization writes: 0
bet / leg / settlement / bankroll mutations: 0
odds / Scout / Analyst / UI changes: 0
fixtures / links / results created: 0
Decision #056 runtime: NOT APPROVED / NOT RUN
Decision #050 SMTP round-trip: PENDING
CSP Phase B: NOT APPROVED
FP-001: ACTIVE
```

## References

- `docs/results-ingestion-settlement-trust-contract-decision-057.md` — trust layers, freshness/finality rules, storage contract, promotion gates
- `docs/sportmonks-structural-presence-dry-run-scope-decision-056.md` — presence-only sanitized report precedent
- `docs/sports-football-enrichment-read-only-dry-run-scope-m1-2-e.md` — Decision #034 identity-gate precedent
- `supabase/migrations/013_sports_data_foundation.sql` — canonical_fixtures / fixture_provider_links / fixture_results schema
