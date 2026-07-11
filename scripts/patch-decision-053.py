from pathlib import Path

path = Path('docs/decisions.md')
text = path.read_text(encoding='utf-8')

old_helper = "- Shared helper `lib/rate-limit.ts` `enforceRateLimit(key, windows)` — **fail-open** on any limiter failure (logged; a limiter outage must not down the route), `RATE_LIMITS` centralizes env-tunable windows (defaults unchanged: scanner 5/min+30/day, analyst 10/min+200/day, scout 3/min+50/day, coach 20/day, register 5/min+15/hour)."
new_helper = "- Shared helper `lib/rate-limit.ts` `enforceRateLimit(key, windows)` — **fail-closed** on any limiter failure (RPC/store error or malformed response → `unavailable: true`; routes return 503 before any Anthropic spend or invite work). All keys are `sha256`-hashed before storage; register keys use a canonicalized client IP. `RATE_LIMITS` centralizes env-tunable windows (defaults unchanged: scanner 5/min+30/day, analyst 10/min+200/day, scout 3/min+50/day, coach 20/day, register 5/min+15/hour). *(Corrected post-merge: this bullet originally described the rejected pre-review fail-open draft; the CPO review reversed it before migration 023 was applied — see the execution record.)*"

old_tests = "**Tests:** new CI suite `test:rate-limit` (7 cases: helper RPC call + mapping, fail-open on RPC error and missing admin, config sanity, no-in-memory-Map source sweep across all five routes, migration static guards). auth-invite's obsolete in-memory 429 test removed. All suites green: rate-limit 7/7, auth 16/16, agent 12/12, domain 13/13, financial 10/10, provider-safety 77/77, FP-001 26/26, quarantine 5/5, full build + tsc/lint clean."
new_tests = "**Tests:** new CI suite `test:rate-limit` (12 cases at merged head `33ac046`: helper RPC call + mapping, FAILS CLOSED on RPC error / missing admin client / malformed responses, `canonicalClientIp` validation, config sanity, no-in-memory-Map source sweep across all five routes including the `unavailable → 503` branch, register canonical-IP keying, neutral Coach 429 message, and migration static guards including the per-key advisory lock plus two-phase check-then-consume). The auth-invite suite's obsolete in-memory 429 test was removed. All suites green: rate-limit 12/12, auth 16/16, agent 12/12, domain 13/13, financial 10/10, provider-safety 77/77, FP-001 26/26, quarantine 5/5, full build + tsc/lint clean. *(Corrected post-merge from the rejected pre-review \"7 cases / fail-open\" text.)*"

if old_helper not in text:
    raise SystemExit('stale Decision #052 helper paragraph not found')
if old_tests not in text:
    raise SystemExit('stale Decision #052 test paragraph not found')

text = text.replace(old_helper, new_helper, 1)
text = text.replace(old_tests, new_tests, 1)

decision = '''## Decision #053 — Project State & Migration Reconciliation
**Date:** 2026-07-11  
**Proposed by:** CPO + Lead Engineer  
**Approved by:** Founder/CPO scope approval  
**Status:** IMPLEMENTED / AWAITING MERGE (docs-only)

**Decision:** Reconcile source-of-truth documentation with production reality through Decision #052, record migration drift without applying anything, and close superseded draft PRs without merging stale branches.

**Why:**
- `PROJECT_STATE.md` was last updated on 2026-07-07 and still claimed production had zero SportMonks links after Decisions #045–#046 had completed the controlled provider-link write.
- README still told operators to run only `001_initial_schema.sql`, despite tracked migrations through 023 and known bootstrap drift.
- Decision #052 retained rejected fail-open wording and an obsolete 7-test count, while the executed implementation is fail-closed with 12 cases.
- PR #90 and PR #106 remained open draft branches even though their numbering or evidence state was superseded.

**Scope:** Documentation/status/migration inventory and PR disposition only. No runtime code, migration application, Supabase writes, provider calls, environment changes, enrichment, odds calls, or betting signals.

**Reconciled facts:**
- Decisions #044–#046 completed the controlled EPL fixture, SportMonks discovery, and exact/high provider-link chain.
- Decisions #047–#049 completed atomic financial writes and removed direct authenticated writes from core and agent-domain tables.
- Decision #050 is deployed and route-verified, but its founder SMTP round-trip remains pending.
- Decision #051 quarantined 78 legacy FP-001 pricing records and removed readable fabricated pricing from live domain surfaces.
- Decision #052 deployed durable, fail-closed, cross-instance rate limits and passed a real parallel production contention test.

**Migration outcome:** No migration was applied. The missing 008 number, untracked historical objects, policy-name drift, review-only files, timestamped production ledger, and destructive 001 bootstrap risk are recorded in `docs/migration-state-reconciliation-053.md`.

**PR disposition:**
- PR #106 is closed as superseded; its `/odds/mapping` filter conclusion is already present in main.
- PR #90 is closed without merge; the policy is not adopted, Decision #020 is never reused, and any revival requires a fresh PR under #055 or later.

**Numbering:** Decision #054 is reserved for CSP Enforcement & CSP Report Hardening. Decision #020 and retired #032 are not reused.

**Consequences:**
- `PROJECT_STATE.md`, README, the numbering ledger, and migration reconciliation become the current operational documentation set.
- The enrichment identity blocker is removed; the remaining gate is explicit runtime approval plus trust validation.
- Decision #050's SMTP round-trip remains a visible founder action and is not falsely marked complete.
'''

if '## Decision #053 — Project State & Migration Reconciliation' in text:
    raise SystemExit('Decision #053 already exists')

marker = '\n---\n\n*Last updated:'
pos = text.rfind(marker)
if pos < 0:
    raise SystemExit('decision log footer not found')

text = text[:pos] + '\n---\n\n' + decision.strip() + text[pos:]
text = text.replace('*Last updated: 2026-07-10*', '*Last updated: 2026-07-11*')
path.write_text(text, encoding='utf-8')
