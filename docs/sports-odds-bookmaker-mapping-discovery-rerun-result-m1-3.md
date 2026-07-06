# M1.3 Bookmaker & Mapping Discovery Rerun Result

Status: PARTIAL / SAFE / NOT DONE

Last updated: 2026-07-06

## Scope

This document records the separately approved production reference discovery rerun after PR #98 merged missing-name handling for bookmaker rows.

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
actualProviderRequests: 2
writeSkipped: true
paginationOverflow: true
stopReasons:
  - provider pagination total exceeds approved page-1 budget for /odds/mapping
```

Endpoint results:

```txt
/odds/bookmakers:
  requestAttempted: true
  paging.current: 1
  paging.total: 1
  resultsCount: 33
  paginationOverflow: false
  responseShapeValid: true
  bookmakerRowsTotal: 33
  validBookmakerRows: 32
  invalidBookmakerRows: 0
  invalidBookmakerRowReasons: []
  partialBookmakerRows: 1
  partialBookmakerRowReasons:
    - missing name
  nonFatalWarnings:
    - bookmaker row missing name
  discoveredBookmakers count: 32

/odds/mapping:
  requestAttempted: true
  paging.current: 1
  paging.total: 11
  resultsCount: 100
  paginationOverflow: true
  responseShapeValid: true
  mappingCoverage count: 100
  stop reason: page 2 not approved
```

## Bookmaker Output

The sanitized runtime output reported 32 discovered bookmaker entries.

This status record intentionally does not reconstruct or invent individual bookmaker ids/names because the approved result summary supplied only the count. If this record is expanded later, only exact sanitized runtime pairs may be added:

```txt
providerBookmakerId
name
```

No raw provider payload, account-level provider data, token, secret parameter, or odds price may be added.

## Interpretation

- PR #98 missing-name handling worked.
- Bookmaker discovery is now safe with one partial warning.
- The missing-name bookmaker row stayed out of `discoveredBookmakers`.
- Mapping discovery ran and returned page 1 successfully.
- The route correctly returned `success=false` because a fatal guardrail stop reason was present for `/odds/mapping` pagination.
- The route correctly stopped because `/odds/mapping` reported `paging.total=11` and page 2 is not approved.
- This is partial safe discovery, not full successful discovery.
- No page 2 was requested.
- No odds values endpoint was called.
- No fixture-specific odds endpoint was called.
- No writes occurred.

## Safety Confirmation

The rerun did not surface or create:

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
M1.3 Bookmaker Discovery: SAFE / PARTIAL WARNING
M1.3 Mapping Discovery: PARTIAL / SAFE
M1.3 Bookmaker & Mapping Discovery: PARTIAL / SAFE / NOT DONE
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

Do not auto-fetch remaining mapping pages.

Before any page 2+ calls, open a separate mapping pagination strategy/scope. That scope must explicitly decide:

- whether page 2+ calls are needed
- provider request budget
- stop conditions
- sanitized report shape
- storage and non-use constraints
- FP-001 guardrails

Any further runtime provider call requires separate CPO approval. This includes:

- rerunning `/odds/bookmakers`
- rerunning `/odds/mapping`
- trying page 2 or later pages
- calling odds values endpoints
- calling fixture-specific odds endpoints
- adding odds writes or storage
- adding env flags
- using bookmaker or mapping data in Scout, Analyst, or UI
- generating probability, implied probability, edge, EV, recommendation, or betting signals
