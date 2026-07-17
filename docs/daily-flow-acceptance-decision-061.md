# Decision #061 — Founder Daily Flow Acceptance

Status: ACTIVE — Phase A read-only assessment delivered 2026-07-17; Phase A1
(fail-closed tracker input lifecycle) implemented as v2 on pinned base
`fdb11200408fc8e7816a08a2327f6c4c5366b0c9` (origin/main after PR #161),
pending merge. Owner: CPO + Founder. Implementation: Claude.

## Purpose

Decision #060 shipped the tracked-bet write path (migration 024
`create_tracked_bet`, `POST /api/bets/tracked`, unified Single/Express form).
Decision #061 asks a different question: **can the founder actually live in
this flow every day without the UI corrupting a draft or a wallet?** The
daily flow under acceptance is: sign in → scan or type a coupon at
`/bets/new` → review → Save → land on `/bets/<bet_id>` → totals visible on
`/bets` and the dashboard.

## Phase A — read-only starting-point assessment (delivered)

A read-only walkthrough of the daily flow on the pinned base produced a
starting-point report with an acceptance matrix and three correctness
defects in the tracker input lifecycle (below). The report also proposed a
hermetic local E2E verification harness (Playwright against a local
Supabase stub at 320/375/1280 px). **The harness is DEFERRED by CPO
verdict — Playwright and the Supabase stub are NOT to be implemented in
Phase A1.** No code changed in Phase A.

## Phase A1 — fail-closed tracker input lifecycle (this change)

CPO verdict: IMPLEMENTATION CONTINUE. Close the three P0/P1 correctness
defects first; everything else in #061 waits.

### Defect 1 (P0) — scanner overflow silently truncated the coupon

Before: `scannerDataToDrafts` ended with `.slice(0, MAX_TRACKED_BET_LEGS)`.
A 21+-leg coupon silently imported as its first 20 legs — a different bet
than the founder photographed, with the oversized coupon's total odds and
stake attached to it.

After: the adapter is fail closed. `ScannerDraftResult` is a discriminated
union — `{ ok: true, legs, totalOdds, stake, bookmaker }` or
`{ ok: false, reason: 'too_many_legs' }`. The bound is checked on the RAW
scanner leg count BEFORE any filter/slice/map, so empty-name filtering can
never shrink an oversized coupon into an importable one, and no truncation
path exists at all. The page branches on `ok` before touching any state: an
oversized coupon imports NOTHING (legs, total odds, stake, bookmaker and
source all keep their previous values) and shows the fixed message
`Coupon has more than 20 legs and was not imported.` — fixed text that
never echoes coupon content or the leg count.

**Submit gate (CPO v1 review):** refusing the import is not enough — the
form still holds the PREVIOUS valid draft, which would pass zod and could
be saved as the wrong bet. The refusal therefore also arms
`scannerOverflowBlocked`, and `handleSubmit` checks that flag BEFORE
validation, before any idempotency UUID is minted (`beginSubmit` is never
reached) and before any network call: with the gate armed, an unchanged
form produces ZERO requests and the fixed refusal message stays visible.
The gate unlocks in exactly two ways: (1) a later VALID scan, which fully
replaces the draft; or (2) a deliberate manual edit of any payload field
(leg fields, add/remove leg, total odds, stake, bookmaker, notes), which
takes ownership of the draft — it lifts the gate AND switches `source` to
`manual`, so the saved bet is no longer labeled a scanner import. Every
manual payload edit funnels through one `markManualEdit` helper; no edit
path bypasses it.

### Defect 2 (P1) — repeat scan carried stale financial values forward

Before: `setStake`/`setBookmaker` ran only `if (mapped.stake)` /
`if (mapped.bookmaker)`. Scanning coupon B after coupon A kept A's stake
and bookmaker whenever B's scan didn't read them — a wrong-wallet draft
one Save away from a real stake transaction.

After: a successful scan is a FULL REPLACEMENT of every scanner-derived
field. `legs`, `totalOdds`, `stake`, `bookmaker` and `source` are set
unconditionally from the new scan; absent values arrive as explicit empty
strings and clear the stale ones. `notes` is user-owned manual input — the
scanner never writes it, so it survives re-scans by design.

### Defect 3 (P1) — nothing locked the draft during scans and submits

Before: only the Save button was disabled (`disabled={loading}`). During a
scan — or during an in-flight financial submit — the founder could edit
fields, add/remove legs, start a second scan, press Cancel, or submit a
draft that the scan callback was about to overwrite.

After: one busy lock covers both operations. `busy = loading || scanning`
drives a single native `<fieldset disabled={busy}>` boundary around the
whole form body (plus `aria-busy` on the form and scanner zone), so every
input/select/textarea and every button — Add leg, Remove leg, Cancel,
Save — is disabled at once; the scanner zone stops accepting clicks and
its file input is disabled. Because React state is async and stale inside
callbacks, the guards themselves are synchronous refs: `scanningRef` plus
the existing `intentRef.status === 'in_flight'` are checked at all three
scan entry points (drop-zone click → file picker, file input change,
Ctrl+V paste) and `handleSubmit` refuses while a scan is running. The
in-flight financial fetch is NEVER cancelled — no `AbortController`, no
signal; on a network-unknown result the Decision #060 intent machine keeps
the UUID and payload snapshot so an exact retry replays server-side.

### Acceptance criteria (all met, enforced by trusted tests)

| # | Criterion |
|---|---|
| 1 | A 20-leg coupon imports fully — all 20 legs, coupon order preserved |
| 2 | A 21-leg coupon is refused wholesale — `{ ok: false, reason: 'too_many_legs' }` and nothing else |
| 3 | Overflow is judged on the raw count — filtering cannot shrink 21 legs into an import |
| 4 | The page applies zero state on overflow and shows the fixed non-echoing message |
| 5 | Overflow arms a submit gate checked before validation, UUID minting, and fetch — an unchanged form after overflow sends 0 network requests and creates 0 UUIDs |
| 6 | The gate unlocks only via a valid scan, or a manual payload edit that switches source to manual |
| 7 | Repeat scan replaces stake/bookmaker/total unconditionally; notes never scanner-written |
| 8 | While busy, fields, leg mutations, Cancel, Save, and all scanner entry points are locked |
| 9 | The financial fetch is never aborted; the scan lock always releases in `finally` |
| 10 | Route, RPC, migration 024, and the intent state machine are byte-for-byte untouched |

### Tests

`scripts/test-financial-safety.mjs` grew from 53 to 65 tests (65/65).
The twelve Phase A1 tests fall into two distinct classes:

**(a) 5 behavioral compiled-adapter tests.** These EXECUTE the compiled
`scannerDataToDrafts` against synthetic coupons and assert real return
values: 20-leg full import with order, 21-leg wholesale refusal via
`deepEqual` so no extra field can leak, raw-count check under empty-name
filtering, full-replacement empty strings, single-leg/legacy fallback.

**(b) 7 static source/wiring assertions.** These are regex/index checks
over the page source text — they pin the code's shape, not executed
behavior: fail-closed branch ordering (ok-check index precedes every
state write), the fixed message, the submit-gate ordering (gate index
precedes `.safeParse(`, `beginSubmit(` and the tracked-bet `fetch` — 0
requests and 0 UUIDs while blocked, and nothing before the gate may
rewrite the refusal message), the exact unlock surface (exactly one arm
site, exactly two unlock sites, 7 payload-edit call sites through
`markManualEdit`, manual unlock switches source to manual, no direct
`clearError` bypass), the unconditional replacement, the
fieldset/aria-busy/button lock, the three synchronous entry-point
guards, the no-abort rule, and the untouched Phase B write-path surface.

**Not executed:** a browser-level proof that overflow→Save produces zero
network requests in a running DOM (real click on Save after a refused
oversized scan) requires the E2E harness and is DEFERRED to Phase A2. No
such run happened in Phase A1; the gate's runtime behavior is currently
evidenced only by the static ordering assertions above and the
behavioral adapter tests.

## Boundaries (Phase A1)

- Files changed: `lib/bets/tracked-bet.ts` (adapter only — the intent
  machine, schemas, and payload helpers are untouched),
  `app/(app)/bets/new/page.tsx`, `scripts/test-financial-safety.mjs`,
  this document, `docs/decisions.md`,
  `docs/decision-ledger-numbering-governance.md`, `PROJECT_STATE.md`.
- 0 production/Supabase/provider calls; 0 migrations; 0 RPC or schema
  changes; `create_tracked_bet` and `create_quick_bet` unchanged;
  `POST /api/bets/tracked` unchanged.
- Playwright / Supabase-stub E2E harness NOT implemented (deferred).
- Settlement/results remain HOLD; Decision #056 runtime remains NOT
  APPROVED; FP-001 remains ACTIVE.
- One Draft PR; Ready-for-review and merge require CPO approval.

## Governance

Decision #061 is ACTIVE (Phase A1). The highest-numbered closed decision
remains #060. The next unreserved decision number is **#062**.
