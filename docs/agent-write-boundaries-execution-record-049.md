# Execution Record — Agent Write Boundaries (Decision #049)

## Status

EXECUTED 2026-07-10 · CPO final accept on PR #131 head `2ac01e0` · sanitized record, rides
under Decision #049 (no new ledger number).

## Sequence executed (CPO-approved order)

1. **Migration 019 applied** via Supabase migration tooling
   (`prepare_agent_write_boundaries_019`).
2. **019 verification** — all green: `persist_market_opportunities` and
   `persist_coaching_session` EXECUTE = service_role only (authenticated & anon false);
   `update_opportunity_status` EXECUTE = authenticated (anon false) and contains the locked
   state machine (`FOR UPDATE`, `invalid_transition`, `ai_analyst`, `link_not_allowed`);
   partial unique index `uq_market_opp_linked_decision` present.
3. **PR #131 merged** (squash → `004ce3c`).
4. **Production READY** (deploy of `004ce3c`). Route sanity: PATCH `/api/scout/<uuid>`
   unauthenticated → 401; PATCH `/api/scout/not-a-uuid` → 400 (UUID validation).
5. **New paths verified** (service-role RPCs the routes call, + FP-001 check): a Scout batch
   persisted through `persist_market_opportunities` with input carrying
   `model_probability: 93, edge_percent: 18` stored those fields as **NULL** and status as
   `discovered` — the forced-NULL/structural-status defense held.
6. **State-machine behavioral tests** (authenticated role, dedicated `smoke-049`):

   | Case | Result |
   |------|--------|
   | convert without link | `link_required` ✓ |
   | convert with another user's decision | `invalid_link` ✓ |
   | link supplied for `watchlisted` | `link_not_allowed` ✓ |
   | system status `expired` via user path | `invalid_status` ✓ |
   | valid conversion (owned ai_analyst decision) | OK ✓ |
   | exact conversion repeat | idempotent no-op (OK) ✓ |
   | dismiss after conversion (terminal) | `invalid_transition` ✓ |

7. **Migration 020 applied** (`enforce_agent_write_boundaries_020`) — the fail-closed
   Phase-A preflight (full grant matrix + both RLS-enabled checks) passed.
8. **Post-020 privilege verification:** `authenticated` 0 non-SELECT privileges across both
   tables (MAINTAIN included), SELECT present on both; `anon` 0 privileges; exactly one
   `FOR SELECT` own-rows policy per table.

## Bypass verification (authenticated role, smoke-049)

| Check | Result |
|-------|--------|
| Direct `UPDATE`/`INSERT`/`DELETE` on `market_opportunities` | denied |
| Direct `INSERT`/`UPDATE` on `coaching_sessions` | denied |
| `TRUNCATE market_opportunities` | denied |
| `persist_market_opportunities` executed by authenticated | denied |
| `persist_coaching_session` executed by authenticated | denied |
| **Total denied** | **8 / 8** |
| Own reads (`market_opportunities`) | work (1 row) |
| Cross-user reads | 0 rows |
| Approved RPC `update_opportunity_status` (dismiss) under authenticated | works → status `dismissed` |

Concurrent conversion/dismiss is serialized by the `FOR UPDATE` row lock in
`update_opportunity_status` and `persist`/state transitions (enforced by construction; the
terminal-state guard makes a losing racer fail with `invalid_transition`).

## Cleanup

`smoke-049` (`…049`) and the cross-user account (`…b9`) deleted from `auth.users`; cascade
verified — 0 rows remain in users, market_opportunities, decisions.

## Result

Both agent tables the CPO recorded OPEN in #048 are now SELECT-only for authenticated with
server-only persistence. **The DB write-boundary track is complete end-to-end:** #047
(atomic financial writes) + #048 (seven core tables) + #049 (two agent tables). No table in
the domain remains directly writable by an authenticated user.

## Recorded follow-up

Schema drift noted during review (tracked 005 `coaching_sessions` policy name vs production
split policies) — a later reconciliation pass should make tracked migrations match
production. Standing manual-migration process risk.

## Holds unchanged

Football enrichment, odds work, new provider calls, Scout/Analyst provider-data usage and
new betting-signal surfaces remain on HOLD.
