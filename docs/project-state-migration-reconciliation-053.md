# Project State & Migration Reconciliation — Decision #053

## Status

EXECUTED / MERGED — PR #139 (`a925085`), production READY. Docs/status/inventory only.

Last updated: 2026-07-11

## Scope Guard

- no runtime code
- no migration application
- no Supabase writes
- no provider calls
- no environment changes
- no enrichment or odds calls
- no Scout/Analyst/UI signal changes
- FP-001 remains active

## Why This Reconciliation Was Required

The repository's declared source of truth had drifted behind production:

- `PROJECT_STATE.md` was dated 2026-07-07 and still claimed that production had zero SportMonks provider links.
- README still instructed operators to run only `001_initial_schema.sql` and referenced a non-existent `legacy/` directory.
- Decision #052's body still described the rejected fail-open draft and an obsolete 7-test suite, although the final code is fail-closed and has 12 cases.
- The decision-number ledger stopped at #043.
- PR #90 and PR #106 remained open drafts even though their numbering or evidence state was superseded.
- The tracked migration files and production's timestamped migration ledger were not presented as separate sources of evidence.

## Reconciliation Outcome

1. Corrected the stale Decision #052 body from the rejected fail-open/7-test draft to the executed fail-closed/12-test implementation.
2. Replaced the 2026-07-07 `PROJECT_STATE.md` snapshot with current facts through Decision #052.
3. Removed the obsolete zero-SportMonks-link blocker and recorded the real enrichment gate: separate runtime approval plus trust validation.
4. Rewrote README setup, environment, testing, structure, and migration guidance.
5. Added a tracked-vs-production migration inventory and documented bootstrap drift without applying anything.
6. Reconciled decision numbering: #053 occupied, #054 reserved for CSP, #020/#032 not reusable.
7. Closed PR #106 as superseded and PR #90 without merge or policy adoption.
8. Preserved Decision #050 founder SMTP round-trip as an explicit pending manual action.

## Current Production Facts Captured

- Decisions #044–#046 completed the controlled EPL fixture write, SportMonks discovery, and exact/high provider-link chain.
- Decision #047 completed atomic financial writes, idempotency, and no-overdraft enforcement.
- Decisions #048–#049 closed direct authenticated writes across core and agent-domain tables.
- Decision #050 is deployed and route-verified; the founder email round-trip remains pending.
- Decision #051 quarantined 78 legacy FP-001 pricing records and scrubbed live fabricated pricing.
- Decision #052 deployed fail-closed global rate limits and passed a true parallel production test.

## PR Disposition

### PR #106

Closed as superseded. The enduring conclusion already exists in main:

```txt
/odds/mapping filter support is unconfirmed
filtered runtime remains blocked
page 2+ and crawl remain paused
```

### PR #90

Closed without merge. The policy is not adopted because:

- it attempted to reuse Decision #020;
- #020 is permanently unavailable;
- the proposed policy file never entered main;
- any revival must be a fresh PR under Decision #055 or later.

## Numbering

```txt
#053 — Project State & Migration Reconciliation
#054 — RESERVED: CSP Enforcement & CSP Report Hardening
#055+ — possible revived Third-Party Manual Context Policy
```

## Next

Decision #054 — CSP Enforcement & CSP Report Hardening.

Decision #050 founder SMTP round-trip remains a separate manual action and is not folded into this decision.
