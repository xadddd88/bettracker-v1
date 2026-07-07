# Decision Ledger / Numbering Governance

Status: DOCS / STATUS GOVERNANCE ONLY

Last updated: 2026-07-07

## Purpose

This document records occupied, reserved, missing, and next-planned decision numbers so concurrent documentation PRs do not guess or collide.

This is documentation/status governance only:

- no runtime code
- no provider calls
- no migrations
- no Supabase writes
- no env flags
- no enrichment writes
- no Scout/Analyst/UI usage
- no probability, implied probability, edge, EV, recommendation, Place Bet, or betting signal

## Current Ledger State

### Occupied

The following decision numbers are currently occupied in `docs/decisions.md`:

```txt
#001-#019
#021-#031
#033-#037
#039
```

Known recent entries:

| Decision | Status |
| --- | --- |
| #018 | Occupied: Bookmaker and Mapping Discovery Scope Before Reference Calls |
| #019 | Occupied: FP-001 False Precision Regression Case |
| #021 | Occupied: FP-001 Data Coverage Map |
| #031 | Occupied: M1.2.e Football Enrichment Design |
| #033 | Occupied: M1.2.e Football Enrichment Endpoint Evidence |
| #034 | Occupied: M1.2.e Football Enrichment Read-Only Dry-Run Scope |
| #035 | Occupied: M1.2.e.2 SportMonks Canonical Fixture Mapping Scope |
| #036 | Occupied: Decision Ledger / Numbering Governance |
| #037 | Occupied: M1.2.e.2.b Read-Only SportMonks Mapping Discovery Scope |
| #039 | Occupied: odds_snapshots_public Curated View Status Reconciliation & Working-Tree Hygiene |

### Missing

| Decision | Status |
| --- | --- |
| #020 | Missing / intentionally not backfilled in current work |

Decision #020 must not be filled opportunistically. Any future use of #020 requires a dedicated CPO-approved governance decision.

### Reserved

| Decision | Reservation |
| --- | --- |
| #032 | Reserved by the parallel M1.3 API-Football `/odds/mapping` filter evidence track |
| #038 | Reserved by the parallel M1.2.e.2.b.1 SportMonks Mapping Discovery Endpoint Evidence Scope track (PR #112) |

The next free unreserved number is #040 unless a later docs/status governance PR records a new reservation.

## Numbering Rules

Before assigning a decision number:

1. Scan `docs/decisions.md` for existing decision headings.
2. Check this ledger for reserved and missing numbers.
3. Use the next appropriate free or explicitly reserved number.
4. Do not use placeholder numbers such as `#0XX`.
5. Do not close historical gaps unless the PR is explicitly a governance PR for that gap.
6. Do not renumber historical decisions.
7. If a parallel PR needs a decision number, reserve it in this ledger before relying on it.
8. If a reserved PR is abandoned, update this ledger in a docs/status governance PR.

## SportMonks Mapping Scope Status

The SportMonks canonical mapping discovery scope now uses:

```txt
Decision #037 - M1.2.e.2.b Read-Only SportMonks Mapping Discovery Scope
```

Decision #037 is occupied by the docs/status-only M1.2.e.2.b Read-Only SportMonks Mapping Discovery Scope.

Content direction already accepted for that future scope:

- discovery is not SportMonks `GET /v3/football/fixtures/{ID}` because the SportMonks fixture ID is unknown
- discovery must search by canonical fixture date, kickoff window, league/competition if available, participants/team names, and season if available
- candidate endpoint family is SportMonks fixtures by date or fixtures between dates
- exact endpoint remains unconfirmed until official endpoint evidence is recorded
- endpoint-shape evidence is required before runtime
- max provider requests: 2
- page 1 only
- stop if `paging.total > 1`
- no page 2
- no crawl
- no broad search
- no fallback endpoint calls
- match keys must be read from `canonical_fixtures` at runtime
- SportMonks `api_token` must be redacted from logs, reports, Vercel, Sentry, docs, PR bodies, errors, URLs, and console output
- confidence rubric is `exact`, `high`, `medium`, `needs_review`, `failed`
- only `exact` / `high` may become eligible for later controlled provider-link write
- not-found or ambiguous results write zero rows and keep mapping blocked

The future scope does not approve:

- runtime provider calls
- provider-link writes
- enrichment writes
- migrations
- Supabase writes
- env flags
- Scout/Analyst/UI
- probability
- implied probability
- edge
- EV
- recommendation
- Place Bet
- betting signal

FP-001 remains active. Mapping discovery is identity evidence only.
