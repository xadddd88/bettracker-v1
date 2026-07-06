# Third-Party Manual Context Policy

Status: active trust and data-source guardrail

Last updated: 2026-07-06

## Purpose

BetTracker must keep a strict boundary between licensed provider-backed data and user-provided third-party context.

This policy covers Flashscore and similar third-party sports websites. It is a product and engineering guardrail, not legal advice.

## Source Reference

Flashscore Terms of Use:

```txt
https://www.flashscore.com/terms-of-use/
```

The terms describe the site as personal-use only, restrict commercial use, protect database content, restrict automated requests, and restrict embedding, aggregating, scraping, or recreating site content without consent.

## Policy

Flashscore and similar websites are not approved automated data providers for BetTracker.

BetTracker must not:

- scrape third-party websites
- crawl third-party websites
- aggregate third-party website data
- embed third-party website data
- recreate third-party website data
- automate requests to third-party websites
- build internal datasets from third-party website pages, screenshots, or links

## Manual Context

User-provided Flashscore links, screenshots, or excerpts may be treated only as manual context.

Any such input must be labeled internally as:

```txt
user_provided_third_party_context
```

Manual context can help BetTracker understand what the user is referring to, but it is not provider-backed truth.

Examples of allowed manual-context use:

- identifying that the user is discussing a specific match
- identifying that the user supplied a screenshot or link as context
- explaining that the context is unverified
- requesting licensed provider-backed confirmation before analysis

Examples of disallowed use:

- treating a Flashscore page as a data feed
- using a screenshot as an odds source
- using a third-party link to populate fixtures, odds, scores, injuries, line movement, standings, or market data
- comparing third-party website odds against model output
- storing extracted third-party website data as product data

## Trust Gate

Manual third-party context does not unlock:

- model probability
- implied probability
- edge
- EV
- recommendation
- Place Bet
- Scout score
- betting signal

Provider-backed truth must come from licensed APIs or approved first-party/manual user inputs with explicit product treatment.

If required provider-backed data is unavailable, BetTracker must remain in a trust-gated state such as:

```txt
INSUFFICIENT DATA
NO PRICE
UNSUPPORTED / PARTIALLY SUPPORTED BET
STATUS UNVERIFIED
```

## FP-001 Guardrail

Every feature that uses third-party manual context must be checked against FP-001 before merge.

Specifically:

```txt
Reference discovery != betting signal
Odds availability != model probability
Odds snapshot != edge
Bookmaker odds != recommendation
Line movement != value unless separately validated
Third-party manual context != provider-backed truth
```

Reference: `docs/analysis-trust-regression-cases.md`

## Implementation Requirements

Any future feature accepting third-party links, screenshots, excerpts, OCR output, or copied text must:

- label the input as `user_provided_third_party_context`
- show or store the context as unverified unless separately confirmed by licensed provider data
- avoid provider-like normalization unless the data source is licensed and approved
- avoid raw third-party data extraction pipelines
- avoid automated fetches to the third-party website
- avoid creating odds, fixture, result, injury, lineup, or market records from the context
- preserve the Analysis Quality Gate behavior

Any exception requires separate CPO approval and legal/compliance review before implementation.
