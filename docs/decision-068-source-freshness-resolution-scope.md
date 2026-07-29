# Decision #068 — SportMonks Source Freshness Resolution Scope

Date: 2026-07-29  
Proposed by: CPO  
Approved by: Founder (conversation approval, 2026-07-29)  
Status: EXECUTED / CLOSED — scope only. Implementation, provider calls, writes, env changes, migrations, deployment gates, and downstream product usage are not started.

## Context

Decision #056 completed the one approved canonical-linked SportMonks Class A structural-presence dry-run. The run made exactly one read-only provider request, returned `success: true`, `responseStatus: ok`, `requestCount: 1`, `writes: none`, and consumed the Supabase execution ledger for deployment SHA `240e3e9916299fd21a71d3c1b5b8ec562ab9316f`.

The useful result is narrow:

- the linked fixture identity and Class A structural relationship presence can be checked safely;
- the report stayed sanitized;
- no database writes happened;
- no retry or second dispatch is authorized.

The blocker is equally important: the provider fixture source `updated_at` was missing or invalid. `collectedAt` is only the time BetTracker collected the response and must not be treated as provider source freshness.

## Decision

BetTracker will split source freshness resolution from football enrichment storage and from downstream product use.

The next implementation may only add a source-freshness resolution gate. It must prove whether the approved provider endpoint exposes a documented provider-source timestamp that can be parsed, validated, reported, and later used as freshness evidence.

This scope does not authorize football enrichment writes. It does not authorize Analyst, Scout, UI, odds, probability, edge, EV, recommendations, Place Bet, settlement, or any betting signal.

## Required Evidence Before Runtime

Before any new production provider call, a future implementation PR must document:

1. The exact provider endpoint and include set.
2. The exact response field(s) that represent provider source freshness.
3. The semantics of those field(s): what entity they update, timezone/format, nullable behavior, and known absence behavior.
4. Whether the field is available on the current account plan.
5. The parsing contract for valid, absent, and present-invalid timestamps.
6. The sanitized report shape, with no raw provider payload.

If the provider docs/account evidence cannot prove a source freshness field, the implementation must fail closed and leave downstream usage blocked.

## Runtime Gate For A Future PR

A future runtime may be proposed only as a separately approved read-only dry-run with all of these constraints:

- canonical fixture: `92afd570-399a-48b9-915a-e1ffaf52a71c`;
- provider fixture: SportMonks `19722203`;
- provider requests: maximum `1`;
- retries, pagination, fallback endpoints, broad search, and crawl: prohibited;
- database writes: `none`;
- raw payload, names, logos, descriptions, markets, predictions, odds, and tokens in logs/responses: prohibited;
- source freshness must come from a documented provider field, never from `collectedAt`;
- response must distinguish `providerSourceFreshness`, `collectedAt`, and `freshnessUsableForDownstream`;
- a fresh execution ledger/authorization must be created if the future runtime needs one; the Decision #056 ledger entry is consumed and cannot be reused.

## Write Gate

No write-mode may begin until a later decision separately approves all of the following:

1. Source freshness proof from the read-only gate.
2. Schema review for the target storage destination.
3. A controlled write plan with explicit row cap, idempotency behavior, rollback/cleanup stance, and post-write verification.
4. Continued non-use by Analyst, Scout, UI, probability, edge, EV, recommendations, Place Bet, and settlement until a later trust-validation milestone.

The existing `football_enrichment` table must not be assumed to be the correct destination merely because it exists.

## Non-Authorization

This decision authorizes no:

- provider call;
- GitHub Actions workflow dispatch;
- Supabase migration or data write;
- Vercel env/config change;
- production deployment gate;
- SportMonks retry/rerun of Decision #056;
- football enrichment write;
- odds/result/settlement work;
- Analyst/Scout/UI product use;
- probability, implied probability, edge, EV, recommendation, Place Bet, or betting signal.

## Consequences

- Decision #056 remains closed and cannot be rerun under its consumed authorization.
- Source freshness becomes the named next sports-data blocker.
- The next implementation should be narrow: prove freshness semantics first, then separately consider storage.
- Decision #069 is the next unreserved decision number.
