# M1.2.e.2.b SportMonks Plan Coverage Gate Result & Discovery Re-Target

## Status

DOCS / STATUS ONLY / RUNTIME BLOCKED

Last updated: 2026-07-07

## Purpose

Record the my.sportmonks.com account evidence that closes the plan/league-coverage gate opened by Decision #040, record that the gate FAILED for the original discovery target league, and decide how the mapping discovery track proceeds.

## Scope Controls

- documentation/status only
- account evidence was read by the founder in the my.sportmonks.com dashboard (screenshots, 2026-07-07)
- ZERO SportMonks API calls were made
- ZERO API-Football calls were made
- no `api_token` was used or exposed
- no runtime code, API routes, migrations, Supabase writes, provider-link writes, enrichment writes, env flags
- no Scout/Analyst/UI usage
- no probability, implied probability, edge, EV, recommendation, Place Bet, or betting signal

FP-001 remains active.

## Account Evidence (my.sportmonks.com, 2026-07-07, founder-verified)

Subscription:

```txt
plan: Football API — Starter
rate limit: 2,000 API calls (per entity per hour — matches Decision #040 docs evidence)
leagues in plan: 22 (base 5 + "17 Extra Leagues" add-on)
add-ons & bundles (5): 17 Extra Leagues, Historical Data, Match Facts, +2 more
tournament add-ons: World Cup 2026, Euro Club Tournaments, International Tournaments
```

Leagues in plan with SportMonks league IDs (from the dashboard League IDs list):

```txt
Brazil (country #5):        Serie A 648
Germany (country #11):      Bundesliga 82
France (country #17):       Ligue 1 301
Portugal (country #20):     Liga Portugal 462
Spain (country #32):        La Liga 564 · La Liga 2 567 · Copa Del Rey 570
Netherlands (country #38):  Eredivisie 72
Italy (country #251):       Serie A 384 · Serie B 387 · Coppa Italia 390
Türkiye (country #404):     Super Lig 600
England (country #462):     Premier League · Championship · Community Shield 23 · FA Cup 24 · Carabao Cup 27
Belgium (country #556):     Pro League 208
Scotland (country #1161):   Premiership 501
United States (country #3483): Major League Soccer 779
World (country #99474):     Club Friendlies 1 1101 · Emirates Cup 1396
```

Note: the SportMonks league IDs for England Premier League and Championship were cut off in the captured screenshots; they are visible in the same dashboard list and must be captured before the discovery runtime scope is finalized (no API call required).

Euro Club Tournaments add-on covers Champions League, Europa League, and Europa Conference League (shown pre-included in the league picker).

## Gate Result: FAILED for the Original Target League

```txt
Decision #037 discovery targets: canonical fixtures linked to api_football
1576052 / 1576053 — Welsh Premier League (Cymru Premier), 2026-12-31.

Cymru Premier is NOT in the 22-league plan.
Cymru Premier is NOT offered in the dashboard league picker catalog at all
(founder reviewed the full picker on 2026-07-07), although a SportMonks
marketing coverage page exists for the league.

Consequence (per Decision #040): fixtures-by-date returns only subscription
leagues → discovery for the current targets would return a guaranteed false
NOT FOUND. Adding the league is not available on the current plan structure.
```

## Decision: Re-Target Discovery to a Covered League

The mapping discovery track re-targets from the Welsh Premier League validation fixtures to a league covered by BOTH providers:

```txt
primary:  England Premier League (in SportMonks plan; in BetTracker
          COMPETITION_MAP for api_football; trivial cross-provider team-name
          matching; product-relevant)
backup:   Scotland Premiership (SportMonks league id 501; also covered by
          api_football)
```

The existing Welsh canonical fixtures and their `api_football` provider links remain in the database untouched; they simply stop being the discovery targets.

## Required Sequence (each step separately approved)

```txt
1. Capture SportMonks league IDs for England Premier League (and Championship)
   from the my.sportmonks.com League IDs list — founder action, no API call.
2. API-Football read-only dry-run for one future England Premier League match
   date — separate CPO-approved scope (existing validated fixture-sync
   tooling, dryRun=true default; requires confirming the API-Football
   plan/quota question left OPEN by Decision #039).
3. Controlled fixture write (max 2 fixtures) per the M1.2.c precedent —
   separate CPO approval, write flag + operator confirm, flag off after.
4. Record the new canonical discovery targets (supersedes the Decision #037
   target reference to fixture 1576052; Decision #037's guardrails, confidence
   rubric, and redaction rules remain fully in force).
5. 2.5.b.2 read-only SportMonks discovery implementation scope (restating the
   page-1 guardrail on pagination.has_more per Decision #040).
6. 2.5.b.3 separate CPO runtime approval before any SportMonks call.
```

## What This Record Does Not Approve

This record does not approve:

- SportMonks provider calls
- API-Football provider calls
- runtime code
- API routes
- migrations
- Supabase writes
- provider-link writes
- enrichment writes
- env flags
- Scout usage
- Analyst usage
- UI usage
- Place Bet
- probability
- implied probability
- edge
- EV
- recommendation
- betting signal

## FP-001 Guardrail

Plan coverage evidence and re-targeting are identity/scope decisions only. They are not model probability, edge, EV, recommendation, Scout signal, Analyst signal, UI signal, or betting signal.

## Current Status

```txt
M1.2.e.2.b.1 Endpoint Evidence Record - DONE (Decision #040)
Plan/league coverage gate - CLOSED: FAILED for Cymru Premier (this document)
Discovery re-target decision - IN REVIEW (England Premier League primary)
SportMonks league IDs for England PL/Championship - PENDING (founder, dashboard)
API-Football EPL dry-run scope - NOT STARTED (separate approval)
Controlled fixture write for new targets - NOT STARTED (separate approval)
2.5.b.2 discovery implementation scope - NOT STARTED
SportMonks provider calls - NOT RUN
provider-link writes - NOT STARTED
```
