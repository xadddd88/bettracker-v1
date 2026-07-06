# M1.3 Bookmaker & Mapping Discovery Result

Status: PARTIAL / SAFE

Last updated: 2026-07-06

## Scope

This document records the first separately approved production reference discovery run after PR #92 merged and deployed.

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
  discoveredBookmakers count: 32, as reported by sanitized output

/odds/mapping:
  requestAttempted: false
  mappingCoverage: []
  reason: stopped after bookmaker response shape guard
```

## Bookmaker Output

The sanitized runtime output reported 32 discovered bookmaker entries.

This status record intentionally does not reconstruct or invent individual bookmaker ids/names that were not supplied with the approved result summary. If this record is expanded later, only sanitized pairs may be added:

```txt
providerBookmakerId
name
```

No raw provider payload or account-level provider data may be added.

## Interpretation

- The bookmaker endpoint is reachable.
- The endpoint returned bookmaker ids/names in sanitized output.
- The route correctly marked the result as `success=false` because `stopReasons` was non-empty.
- The route correctly stopped before `/odds/mapping` because the bookmaker response shape did not match expected evidence.
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

## Current State After Run

```txt
M1.3 Bookmaker Discovery: PARTIAL / SAFE
M1.3 Mapping Discovery: NOT RUN
M1.3 Bookmaker & Mapping Discovery: NOT DONE
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

Any further runtime provider call requires separate CPO approval.

This includes:

- rerunning `/odds/bookmakers`
- calling `/odds/mapping`
- trying page 2
- calling odds values endpoints
- calling fixture-specific odds endpoints
- adding odds writes or storage
- adding env flags
- using bookmaker or mapping data in Scout, Analyst, or UI
- generating probability, implied probability, edge, EV, recommendation, or betting signals
