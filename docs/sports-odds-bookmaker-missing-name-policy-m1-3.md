# M1.3 Bookmaker Missing Name Handling Policy

Status: PROPOSED / DESIGN ONLY

Last updated: 2026-07-06

## Context

After PR #96 diagnostics, the production reference discovery result for `/odds/bookmakers` can be understood more precisely:

```txt
/odds/bookmakers resultsCount: 33
discoveredBookmakers: 32
invalidBookmakerRows: 1
invalidBookmakerRowReasons:
  - missing name
responseShapeValid: false
/odds/mapping: not run
```

The row-level diagnostic indicates a narrow issue: at least one provider row has a usable provider bookmaker identifier but no bookmaker name. The current strict response-shape guard treats that as fatal and stops before `/odds/mapping`.

## Decision Needed

BetTracker needs a documented policy before changing runtime behavior:

```txt
How should the system handle bookmaker rows where providerBookmakerId exists but name is missing?
```

This document does not implement the policy. It records the recommended handling for a later implementation PR.

## Options

### Option A - Strict Mode

Missing bookmaker name remains fatal.

Implications:

- `responseShapeValid=false`
- reference discovery stops before `/odds/mapping`
- no partial bookmaker row is counted as usable
- highest data cleanliness
- blocks mapping discovery when the only issue is a missing display name

This is safest, but too conservative for reference discovery.

### Option B - Tolerant Mode

Missing bookmaker name is accepted as nullable or unknown, and discovery continues.

Implications:

- reference discovery can continue
- incomplete provider rows may appear closer to usable than they are
- later allowlist/write/UI paths could accidentally treat unknown bookmakers as approved unless every downstream gate is perfect

This is too permissive for BetTracker's current trust posture.

### Option C - Hybrid Mode

Missing bookmaker name is non-fatal for reference discovery, but remains blocked for all downstream use.

Implications:

- reference discovery may continue to `/odds/mapping` if missing names are the only bookmaker-row issue
- partial bookmaker rows are counted only as sanitized diagnostics
- partial bookmaker rows are not eligible for bookmaker allowlists
- partial bookmaker rows are not eligible for odds writes
- partial bookmaker rows are not eligible for Scout, Analyst, UI, or betting-signal use

This is the recommended policy.

## Recommended Policy

BetTracker should use Hybrid mode.

Rules:

```txt
missing bookmaker name is non-fatal for reference discovery
missing bookmaker name produces a warning, not a fatal stop reason
providerBookmakerId may be counted in partial diagnostics
name remains null or UNKNOWN_PROVIDER_BOOKMAKER
partial bookmaker rows are not allowlist eligible
partial bookmaker rows are not odds-write eligible
partial bookmaker rows are not Scout/Analyst/UI eligible
partial bookmaker rows never unlock probability, edge, EV, recommendation, or betting signals
raw provider rows remain hidden
```

The sanitized report should include a warning such as:

```txt
bookmaker row missing name
```

The top-level response should use:

```txt
success=false only for fatal guardrails
success=true with warnings only when the discovery completed within approved scope and no fatal guardrail fired
```

Non-fatal partial bookmaker warnings may allow `/odds/mapping` to run only when all other guardrails pass:

```txt
max provider requests: 2
page 1 only
stop if paging.total > 1
no page 2
no odds values endpoint
no fixture-specific odds endpoint
no raw payload exposure
no writes
```

## Fatal vs Non-Fatal Classification

Fatal guardrails should still stop discovery:

- non-object row
- unsupported wrapper shape
- missing provider bookmaker id
- pagination overflow
- envelope/response shape mismatch
- any attempt to expose raw provider payload
- any attempt to include odds prices
- any attempt to create probability, edge, EV, recommendation, Scout signal, Analyst signal, UI signal, or betting signal

Non-fatal partial bookmaker warning:

- provider bookmaker id exists, but bookmaker name is missing

## Downstream Eligibility

Partial bookmakers are reference-only diagnostics.

They are not eligible for:

- bookmaker allowlist
- odds writes
- odds storage
- market catalog mapping
- Scout score
- Analyst pricing
- UI display as a selectable bookmaker
- probability
- implied probability
- edge
- EV
- recommendation
- Place Bet
- betting signal

Any later implementation must preserve this boundary explicitly.

## FP-001 Guardrail

Check against FP-001 before implementing or using this policy downstream.

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

The old FP-001 report showed false precision (`Model probability 28.0%`, `Implied probability 45.5%`, `Edge -17.4%`, and pseudo-precise estimates such as `45,45%` and `25-30%`) despite missing data. A partial bookmaker row must not recreate that failure mode.

## Implementation Boundary

This PR is documentation/design only.

It does not:

- change runtime code
- call providers
- rerun reference discovery
- write odds
- write to Supabase
- add migrations
- add env flags
- add Scout, Analyst, or UI usage
- create probability, edge, EV, recommendation, or betting signals

## Future Implementation Requirements

A later implementation PR should:

- add explicit `warnings` or `nonFatalWarnings` to the sanitized report
- preserve fatal `stopReasons` for true guardrail failures
- classify `missing name` as non-fatal only when a provider bookmaker id exists
- keep `missing id` fatal
- keep malformed rows fatal
- keep raw payload hidden
- add mocked tests before runtime approval
- require separate CPO approval before any reference discovery rerun

No production provider call is approved by this policy document.
