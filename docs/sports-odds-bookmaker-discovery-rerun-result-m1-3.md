# M1.3 Bookmaker Discovery Rerun Result

Status: PARTIAL / SAFE

Last updated: 2026-07-06

## Scope

This document records the separately approved production reference discovery rerun after PR #94 merged the bookmaker discovery shape adapter.

Approved production route:

```txt
POST https://btdk.app/api/admin/sports/odds/reference-discovery
```

Approved body:

```json
{
  "dryRun": true,
  "endpoints": ["bookmakers", "mapping"],
  "maxProviderRequests": 2,
  "operatorConfirm": "RUN_BOOKMAKER_MAPPING_DISCOVERY_M1_3"
}
```

Approved runtime budget:

```txt
max provider requests: 2 total
page 1 only for each endpoint
stop if paging.total > 1 on either endpoint
no page 2
no odds values endpoint
no fixture-specific odds call
```

## Sanitized Result

Top-level result:

```txt
HTTP status: 200
success: false
dryRun: true
provider: api_football
scope: bookmaker_mapping_reference
estimatedProviderRequests: 2
actualProviderRequests: 1
writeSkipped: true
paginationOverflow: false
stopReasons:
  - provider response shape differs from expected evidence for /odds/bookmakers
```

Endpoint result:

```txt
/odds/bookmakers:
  requestAttempted: true
  paging.current: 1
  paging.total: 1
  resultsCount: 33
  paginationOverflow: false
  responseShapeValid: false
  discoveredBookmakers count: 32

/odds/mapping:
  requestAttempted: false
  mappingCoverage: []
  reason: stopped after bookmaker response shape guard
```

## Bookmaker Output

The sanitized runtime summary reported 32 discovered bookmaker entries.

The individual sanitized bookmaker id/name list was not included in the supplied result record for this PR. This document therefore does not reconstruct, infer, or add bookmaker entries.

If the exact sanitized runtime list is supplied later, only exact pairs from that runtime output may be appended in this shape:

```txt
providerBookmakerId
name
```

No raw provider payload, account-level provider data, token, secret parameter, or odds price may be added.

## Interpretation

- `/odds/bookmakers` is reachable.
- Bookmaker extraction succeeded for 32 sanitized id/name pairs.
- At least one reported row likely has unexpected or malformed shape, so the endpoint shape remains not clean.
- PR #96 diagnostics later narrowed the issue to one non-clean bookmaker row with `invalidBookmakerRowReasons=["missing name"]`.
- The route correctly marked the result as `success=false` because `stopReasons` was non-empty.
- The route correctly stopped before `/odds/mapping`.
- This is a safe partial discovery, not a full successful discovery.
- No page 2 was requested.
- No odds values endpoint was called.
- No fixture-specific odds endpoint was called.
- No writes occurred.

## Safety Confirmation

The run did not surface or create:

- raw provider payload
- API key
- operator token
- account data
- secret query parameters
- odds prices
- probability
- implied probability
- edge
- EV
- recommendation
- Scout signal
- Analyst signal
- UI signal
- betting signal
- Supabase writes

## Current State After Rerun

```txt
M1.3 Bookmaker Discovery: PARTIAL / SAFE
M1.3 Mapping Discovery: NOT RUN
M1.3 Bookmaker & Mapping Discovery: NOT DONE
M1.3 Bookmaker Discovery Shape Adapter: PARTIAL / NEEDS FOLLOW-UP
M1.3 Bookmaker Missing Name Handling Policy: PROPOSED / DESIGN ONLY
M1.3 odds writes: NOT STARTED
SPORTS_ODDS_SYNC_WRITE_ENABLED: NOT ADDED / NOT ENABLED
Scout / Analyst / UI odds usage: NOT STARTED
betting signals from odds: NOT STARTED
FP-001 guardrail: ACTIVE
```

## FP-001 Guardrail

Reference discovery does not unlock:

- model probability
- implied probability
- edge
- EV
- recommendation
- Place Bet
- Scout score
- Analyst pricing
- UI betting signal

Check against FP-001 before any future feature uses bookmaker, mapping, market, odds, or line movement data.

## Next Gate

M1.3 Bookmaker & Mapping Discovery remains not done.

Any further runtime provider call requires separate CPO approval. This includes:

- rerunning `/odds/bookmakers`
- calling `/odds/mapping`
- trying page 2
- calling odds values endpoints
- calling fixture-specific odds endpoints
- adding odds writes or storage
- adding env flags
- using bookmaker or mapping data in Scout, Analyst, or UI
- generating probability, implied probability, edge, EV, recommendation, or betting signals

## Missing Name Policy Link

PR #97 proposes a docs-only Hybrid policy for bookmaker rows where `providerBookmakerId` exists but `name` is missing.

The proposed policy keeps missing names non-fatal for reference discovery only, while blocking partial bookmaker rows from:

- bookmaker allowlist
- odds writes
- odds storage
- market catalog mapping
- Scout usage
- Analyst usage
- UI usage
- probability
- implied probability
- edge
- EV
- recommendation
- Place Bet
- betting signal

Reference: `docs/sports-odds-bookmaker-missing-name-policy-m1-3.md`
