# M1.3 Mapping Pagination Strategy

Status: STRATEGY / SCOPE ONLY

Last updated: 2026-07-06

## Scope

This document defines strategy before any additional `/odds/mapping` page calls.

This is documentation/status strategy only:

- no runtime code
- no provider calls
- no `/odds/mapping` rerun
- no page 2 fetch
- no odds writes
- no Supabase writes
- no migrations or env flags
- no Scout, Analyst, or UI changes
- no probability, implied probability, edge, EV, recommendation, or betting signal

Check against FP-001 before any future implementation or runtime approval.

## Current Known Result

The latest separately approved production reference discovery after PR #98 returned:

```txt
actualProviderRequests: 2
```

`/odds/bookmakers`:

```txt
requestAttempted: true
paging.current: 1
paging.total: 1
resultsCount: 33
responseShapeValid: true
bookmakerRowsTotal: 33
validBookmakerRows: 32
partialBookmakerRows: 1
nonFatalWarnings:
  - bookmaker row missing name
```

`/odds/mapping`:

```txt
requestAttempted: true
paging.current: 1
paging.total: 11
resultsCount: 100
responseShapeValid: true
paginationOverflow: true
mappingCoverage count: 100
stopReason:
  provider pagination total exceeds approved page-1 budget for /odds/mapping
```

Confirmed safety outcome:

```txt
page 2 was not requested
odds values endpoint was not called
fixture-specific odds endpoint was not called
no writes
no raw payload
no betting signals
```

## Why Full Mapping Is Not Automatically Approved

The page 1 result proves that `/odds/mapping` is reachable and that the sanitized page 1 response shape is usable. It does not prove that fetching all remaining mapping pages is necessary, cost-effective, or useful for the current product stage.

Full mapping is not automatically approved because:

- `paging.total=11` means full current discovery would require 10 additional provider requests.
- Mapping pages may include leagues, seasons, fixtures, bookmakers, or markets that BetTracker does not currently use.
- Reference mapping alone does not create odds coverage, model inputs, pricing validity, or user-facing value.
- The current active path still forbids odds writes, Scout/Analyst/UI usage, and betting signals.
- FP-001 requires that reference discovery never become probability, edge, EV, recommendation, Place Bet visibility, or any betting signal.

## Strategy Options

### Option A - Stop At Page 1 Sample Only

Request budget:

```txt
additional provider requests: 0
```

Behavior:

- Keep page 1 as the current reference sample.
- Do not fetch page 2.
- Use page 1 evidence only to refine sanitizer expectations and future scope.

Pros:

- No additional quota usage.
- No new runtime risk.
- Preserves current safety boundary.

Cons:

- Mapping discovery remains partial.
- Page 1 may not cover provider mappings relevant to BetTracker's current canonical fixtures.

### Option B - Controlled Full Mapping Discovery Pages 1-11

Request budget:

```txt
additional provider requests: 10
total mapping pages in current response: 11
```

Behavior:

- Fetch mapping pages 2 through 11 under a separately approved runtime scope.
- Keep sanitized report only.
- Do not write storage.

Pros:

- Captures complete current mapping reference for this endpoint response.
- Can reveal full provider mapping shape and page consistency.

Cons:

- Uses 10 additional provider requests.
- May collect large amounts of irrelevant mapping data.
- May require extra diagnostics if later pages contain shape variants.
- Does not directly unlock odds writes, Analyst, Scout, UI, or betting signals.

### Option C - Narrowed Mapping Discovery With Provider-Supported Filters

Request budget:

```txt
additional provider requests: TBD after endpoint/filter evidence
```

Behavior:

- First confirm whether `/odds/mapping` supports filters that can narrow by league, season, fixture, bookmaker, bet, or similar provider fields.
- Only then approve a filtered runtime scope.

Pros:

- Potentially lower quota usage.
- Better aligned with BetTracker's actual fixture/provider scope.
- Reduces irrelevant league and season noise.

Cons:

- Requires provider evidence before runtime.
- If filters are unsupported or ambiguous, this may not reduce request count.

### Option D - Canonical-Fixture-First Mapping Discovery

Request budget:

```txt
additional provider requests: TBD after canonical fixture scope and endpoint support are confirmed
```

Behavior:

- Start from known `canonical_fixtures` and exact `api_football` provider links.
- Discover only mapping relevant to known fixtures or known near-term fixture scope if the provider endpoint supports such narrowing.
- Keep output sanitized and non-user-facing.

Pros:

- Best alignment with actual BetTracker data.
- Avoids broad provider reference crawl.
- Reduces risk of storing or acting on irrelevant mappings.

Cons:

- Depends on endpoint support for useful filters.
- May require a separate read-only preflight over canonical fixtures.

## Risk Analysis

### Quota Usage

Full mapping would require 10 additional requests based on the latest `paging.total=11`. On a constrained provider plan, this is material and must be explicitly budgeted.

### Response Size

Page 1 returned 100 mapping rows. Full discovery could return roughly 1,100 rows if later pages are similarly sized. That is still manageable as a report, but it is not automatically useful.

### Stale Mappings

Provider mapping data can change. A broad snapshot without a refresh strategy may become stale and misleading.

### Irrelevant Leagues

Full mapping can include leagues, seasons, and fixtures unrelated to BetTracker's current canonical fixture set.

### No Direct User Value Yet

Reference mapping does not create priced analysis, odds coverage, model inputs, or user-facing value by itself.

### FP-001 False Precision Risk

FP-001 remains the control case. Mapping availability must not become:

- model probability
- implied probability
- edge
- EV
- recommendation
- Place Bet visibility
- Scout score
- Analyst pricing
- UI betting signal

## Recommendation

Prefer strategy before runtime. Do not fetch page 2 automatically.

Recommended next decision:

```txt
Choose Option C or D only after provider filter evidence is available.
```

If no useful provider filters exist, Option B may be considered later, but only with a separate CPO-approved budget, stop conditions, sanitized report shape, and explicit non-use constraints.

## Non-Use Rule

Mapping reference data does not unlock:

- model probability
- implied probability
- edge
- EV
- recommendation
- Place Bet
- Scout score
- Analyst pricing
- UI betting signal
- odds writes
- Supabase writes

Reference discovery remains technical evidence only.

## Next Approved Step

The next step is not a runtime call.

Before any page 2+ calls, open a separate implementation/runtime scope that includes:

- selected strategy
- approved provider request budget
- endpoint/filter evidence if using Option C or D
- exact request body
- stop conditions
- sanitized report fields
- no raw provider payload
- no token or account data
- no odds prices
- no Supabase writes
- no Scout, Analyst, or UI usage
- no probability, edge, EV, recommendation, or betting signal
- FP-001 check

Do not merge or run that future scope without CPO approval.
