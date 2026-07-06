# Analysis Trust Regression Cases

Status: active trust guardrail

This document records product trust regressions that future work must check before merge.

## FP-001 - Legacy False Precision Analysis

### Source

Legacy AI Analysis PDF generated on 2026-07-04 for a mixed football and tennis parlay.

### What Went Wrong

The legacy analysis presented a confident betting verdict and precise pricing even though the underlying data coverage was insufficient.

Observed on page 1:

- Sport label showed `SOCCER` even though the coupon mixed football and tennis.
- Verdict showed `NO VALUE`.
- The report displayed `Model probability: 28.0%`.
- The report displayed `Implied probability: 45.5%`.
- The report displayed `Edge: -17.4%`.
- The report included an English disclaimer inside a Ukrainian-language analysis.
- The disclaimer admitted that the analysis did not include live injuries, team news, recent form updates, or current line movement.
- The tennis leg was described as outside the standard football module and only approximate.

Observed on page 2:

- The report continued to use pseudo-precise probability language.
- Bookmaker coefficient was converted into `45.45%`.
- Realistic combined probability was estimated at `25-30%`.
- These figures were shown without verified per-leg model inputs, live status, provider-backed odds history, team news, injury data, or sport-specific model support.

### Why This Is Dangerous

This creates false precision.

The product looked like it had a model-backed betting opinion, but the report itself admitted that required inputs were missing.

This can damage user trust and may encourage decisions based on unsupported confidence.

### Product Rule

BetTracker must never convert incomplete or unsupported data into:

- model probability
- implied probability
- edge
- EV
- value or no-value verdict
- Scout score
- Analyst recommendation
- Place Bet visibility
- betting signal

### Required Behavior

When required data is missing, BetTracker must return a trust-gated result such as:

```txt
INSUFFICIENT DATA
NO PRICE
UNSUPPORTED / PARTIALLY SUPPORTED BET
LIVE COUPON NOT SUPPORTED
STATUS UNVERIFIED
```

The output must explain:

- what is known
- what is missing
- which legs are unsupported
- whether the event is actionable
- what data would be required for real analysis

### Regression Guardrail

Any future provider discovery, odds snapshot, bookmaker mapping, market mapping, fixture sync, or Analyst/Scout feature must not reintroduce FP-001 behavior.

Specifically:

```txt
Reference discovery != betting signal
Odds availability != model probability
Odds snapshot != edge
Bookmaker odds != recommendation
Line movement != value unless separately validated
```

### Current Status

FP-001 is considered addressed by:

- Analysis Quality Gate
- Analyst Trust UX Patch
- Decision Surfaces Trust Patch
- Live Coupon Parser & Actionability Gate

It remains an active regression case.

Any new feature touching odds, markets, bookmaker data, Analyst, Scout, or user-facing recommendations must be checked against FP-001 before merge.
