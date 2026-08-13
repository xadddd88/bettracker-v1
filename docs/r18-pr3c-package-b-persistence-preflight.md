# R18 PR3C Package B — Persistence And Server Decision Readiness Preflight

Status: **BLOCKED — LEGAL INPUT REQUIRED / NO MIGRATION AUTHORITY**

Date: 2026-08-13

Repository baseline: `main@bdc1546083fc6096f527cf81085d505a457db8ff`

Production project: `ybbdkwjtytokrpbvgbmq`

Machine-readable snapshot:
[`security/r18-pr3c-package-b-production-baseline.v1.json`](security/r18-pr3c-package-b-production-baseline.v1.json)

## 1. Outcome And Authority Boundary

This slice turns the Package B handoff into a reviewable engineering preflight.
It identifies the smallest defensible persistence boundary, the exact unresolved
inputs, the required ACL/RLS contract, and the verification and recovery gates
for a later migration.

It authorizes only repository documentation and tests. It authorizes none of the
following:

- no migration file, database DDL, database DML, backfill, catalog change, or
  production write;
- no age, residence, current-territory, location, identity-document, consent, or
  other user-data collection;
- no environment, Vercel, Supabase, Auth, feature-flag, or deployment change;
- no market activation, legal approval, entitlement, provider, bookmaker,
  affiliate, billing, payment, AI, or external-service call;
- no new client RPC, `SECURITY DEFINER` function, service key exposure, or
  elevation of Data API privileges.

Every object name below is a logical candidate for review, not authority to
create that object. `MARKET_PROFILE_GB_EW_SC_ENABLED` remains disabled and the
only safe runtime result remains fail closed.

## 2. Read-Only Production Reconnaissance

At `2026-08-13T15:26:39Z`, one read-only catalog query and the read-only Supabase
Security and Performance Advisors established the following baseline:

- production runs PostgreSQL `17.6`;
- the latest applied migration is
  `20260812172400 / active_membership_data_api_rpc_enforcement` (S2.3);
- `private` already exists and is owned by `postgres`;
- `anon` and `authenticated` do not bypass RLS; `service_role` does;
- none of the candidate Package B relation names currently exists in `public`
  or `private`;
- the accepted security baseline remains eight authenticated
  `SECURITY DEFINER` warnings plus the one append-only ledger information
  finding; Package B accepts zero new findings;
- no user row, evidence value, Auth identity, or application record was queried.

This is design reconnaissance only. It will be stale by definition when a later
migration is ready and cannot substitute for the exact fresh preflight performed
immediately before a separately authorized apply.

## 3. Current Supabase Constraints

The guidance scan used current official material on 2026-08-13:

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
  requires RLS for every table in an exposed schema, recommends explicit
  `TO authenticated` policies, `(select auth.uid())`, and indexes on policy
  columns, and documents `security_invoker = true` for PostgreSQL 15+ views;
- [Database functions](https://supabase.com/docs/guides/database/functions)
  defaults the design to `SECURITY INVOKER`; any exceptional definer function
  requires a fixed empty `search_path` and exact ACL review;
- [Data API grants breaking change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
  confirms that grants and RLS are separate controls and that new relations must
  be explicitly opted into Data API access as the safer default rolls out;
- [PostgreSQL 17 platform guidance](https://supabase.com/changelog/45827-deprecation-notice-support-for-postgres-14-ending-on-1st-july-2026)
  makes PostgreSQL 17 the disposable verification target;
- [GraphQL introspection change](https://supabase.com/changelog/46320-breaking-change-in-pg-graphql-1-6-0-graphql-introspection-disabled-by-default)
  does not remove the need for exact relation and function grants.

Package B therefore cannot rely on default privileges, RLS without grants, a
definer view, a browser service key, or a public definer RPC.

## 4. Blocking Legal Input Matrix

The migration remains blocked until one versioned Owner/Legal decision artifact
supplies every value below. A generic “approved” is insufficient; the required
output must be concrete enough to derive fields, constraints, retention, and
tests without interpretation.

| Gate | Exact approved output required | Schema or policy consequence | Fail-closed result while unresolved |
|---|---|---|---|
| `LEGAL-01` Children-access classification | Whether the service is likely to be accessed by children; applicable age-appropriate-design duties; owner and review date | Determines whether a minimum-age field is sufficient and which child-safety controls or DPIA records are mandatory | No evidence collection; no migration; `blocked / policy_state_unavailable` if activation is attempted |
| `LEGAL-02` Age assurance | Allowed method codes, minimum assurance strength, accepted result classes, expiry/recheck rule, vendor/no-vendor decision, and prohibited raw fields | Determines the age-result fields, constraints, provenance, expiry, and deletion behavior | No DOB, document, or checkbox substitute; no `verified` result can be persisted |
| `LEGAL-03` Residence and current territory | Allowed coarse territory classes, approved evidence methods, signal precedence/weights, conflict rule, travel rule, freshness/TTL, and manual-review boundary | Determines evidence classes, conflict state, check inputs, expiry, and recheck semantics | No IP, GPS, storefront, locale, currency, or timezone may grant or elevate access |
| `LEGAL-04` Lawful basis | One lawful basis and purpose statement for each required processing purpose, including eligibility, evidence, required-document record, security/audit, and support | Determines whether each proposed record may exist and which notice, purpose, access, and erasure controls apply | A field with no approved purpose and basis is omitted, not stored as `unknown` |
| `LEGAL-05` Retention and deletion | Trigger, duration, deletion/anonymisation action, legal-hold exception, account-erasure behavior, and owner for every evidence, decision, document, consent, and audit class | Determines foreign-key actions, timestamps, deletion jobs, partitions, audit immutability, and rollback safety | No invented duration, cascade, indefinite retention, or destructive rollback |
| `LEGAL-06` Legal documents | English-master document ids, exact versions, effective dates, locale lifecycle for `en`/`uk`/`ru`, translation approval/fallback rule, acknowledgement vs presentation requirement, and stale-version behavior | Determines required-document keys, event type, version constraints, and `legal_terms_update_required` evaluation | No bundled privacy acceptance and no unversioned boolean |
| `LEGAL-07` Optional analytics and AI purposes | For analytics, AI history, and AI memory separately: whether consent is the basis, purpose/version, default, withdrawal effect, retention, and feature degradation | Determines whether a consent record exists at all and which independent purposes are valid | Optional controls stay off; refusal cannot block unrelated core access |
| `LEGAL-08` Product classification and permitted copy | Approved classification, prohibited/required wording, provider/bookmaker/affiliate boundaries, jurisdictions, owner, and review date | Controls activation metadata and later UI/integration acceptance; it does not turn schema into launch approval | Profile remains `configured`; no commercial/provider surface or market activation |

The approved artifact must be committed or referenced by immutable version and
hash. It must not contain secrets or raw user evidence.

## 5. Minimal Logical Persistence Boundary After Approval

The following is the smallest candidate model worth converting into SQL after
all affected legal gates resolve. It intentionally separates policy,
presentation, evidence, required documents, optional choices, and audit.

| Logical record | Owns | Never owns | Candidate location |
|---|---|---|---|
| Market profile version | Stable profile id, immutable policy version, lifecycle status, approved territory/age/document policy references | User evidence, current user decision, consent, locale-derived authority | `private` base relation |
| Current user eligibility | One current server decision per user/profile, status/reason, policy version, source check id, checked/expiry/review timestamps, monotonic revision | Raw evidence, vendor payload, precise location, user-editable authority | `private` base relation |
| Eligibility check | Minimal approved evidence classes, method codes, provenance class, signal assessment, verification result, timestamps | Full documents, raw IP/GPS history, vendor secrets, arbitrary payload retention | `private` base relation |
| Required-document event | Exact document id/version, event type (acknowledged or presented), displayed locale, server timestamp | Optional-purpose consent or bundled global acceptance | `private` append-only relation |
| Optional-purpose event | One approved purpose/version, given/refused/withdrawn state, locale, capture method, timestamps | Required processing, terms acknowledgement, market authority | `private` append-only relation, only for approved consent purposes |
| Decision audit event | Idempotency key, prior/new safe decision, policy version, authority class, actor class, timestamp, correlation id | Raw evidence, anti-abuse detail, document content, free text | `private` append-only relation |
| User presentation projection | Safe status/reason, profile label/version, checked/expiry/review dates, coarse verification state, current document versions | Evidence values, vendor result, signal weights, internal reason detail | `public` `security_invoker` view over an RLS-protected base |

Core authorization fields use constrained scalar columns rather than an
unvalidated JSON policy blob. Status and reason remain `text` with explicit
checks matching the PR3B contract so later additions require review. Time values
use `timestamptz`; foreign-key columns are indexed; the current decision uses a
stable user/profile key; append-only event identifiers use a sequential identity
unless a distributed-id requirement is separately demonstrated.

Full passport/identity/proof-of-address images, exact GPS history, raw IP
history, raw vendor risk payloads, bookmaker credentials, payment data,
user-editable JWT metadata, free-text evidence, and unbounded telemetry remain
out of scope by default.

## 6. Exact Access-Control Shape

Grants and RLS are independent and both must pass. No role inherits access from
defaults.

| Surface | `PUBLIC` / `anon` | `authenticated` | `service_role` | RLS / function rule |
|---|---|---|---|---|
| Private policy/evidence/document/consent/audit bases | No schema-object privileges | No DML; only the exact safe base columns required by an invoker projection may receive `SELECT` | Exact statement-specific read/write privileges; no broad `ALL` | RLS enabled on every user-bearing base; no authenticated write policy |
| Current eligibility base | None | Column-scoped `SELECT` only when required by the view; no INSERT/UPDATE/DELETE | Exact SELECT/INSERT/UPDATE needed by the trusted transaction | Own-user permissive SELECT plus restrictive live-membership policy; indexed `user_id` |
| Public presentation view | None | `SELECT` only | `SELECT` only if operationally required | PostgreSQL 17 `security_invoker = true`; safe columns only; no mutating view grant |
| Server decision function | No EXECUTE | No EXECUTE | EXECUTE only | Public only if PostgREST RPC is required; `SECURITY INVOKER`, fixed empty `search_path`, exact signature and ACL |
| Maintenance/retention function | None | None | None by default | Non-exposed administrative path with separately approved operator authority |

The existing `private.is_active_member()` predicate remains the membership
source for authenticated reads. Any server decision that would persist
`eligible` must independently prove an active membership for the target user;
market eligibility cannot restore or bypass membership.

Package B adds zero authenticated `SECURITY DEFINER` RPCs and zero accepted
Advisor findings. Creation defaults must be revoked in the same transaction,
before any object can become reachable.

## 7. Server-Only Decision Transaction

The later trusted path must perform one short, idempotent transaction:

1. authenticate the server caller; never accept a browser service credential;
2. load and lock the exact profile version and current user decision in a
   consistent order;
3. reject missing legal-policy values and an unknown, suspended, retired, or
   disabled profile before reading optional evidence;
4. evaluate only approved evidence classes with the PR3B deterministic policy;
5. reject `eligible` unless both the stored profile lifecycle and independent
   server activation gate allow it and the target user has live membership;
6. reject routine-recheck elevation from denied to `eligible`;
7. validate the exact status/reason pair and document versions;
8. atomically update the current decision and append one non-sensitive audit
   event under a unique idempotency key;
9. return only the safe presentation model.

No external provider or HTTP call occurs while database locks are held. A
network/dependency failure leaves the prior decision unchanged and never grants
access. Duplicate submission returns the original result rather than creating a
second transition.

## 8. Migration, Verification, And Apply Gate

After all legal inputs resolve, Package B still requires a new independently
reviewed implementation slice:

1. commit the immutable policy/legal input artifact and hash;
2. generate one expand-only migration with no market activation and no user
   backfill;
3. add an exact rollback file and a separate non-destructive emergency-stop
   file;
4. run a disposable PostgreSQL 17 verifier covering schema, constraints,
   grants, RLS, ownership, function ACL, status/reason pairs, membership,
   idempotency, concurrency, and hostile role probes;
5. run all repository safety suites and Supabase Advisor checks;
6. immediately before apply, run a fresh read-only production preflight against
   the exact project and verify migration head, object absence, schema ACL,
   default privileges, S2.3 helper/body/ACL, public relation/RPC inventory, and
   Advisor baseline;
7. compute the exact migration SHA-256 and obtain a one-time approval naming the
   project ref, migration name, and hash;
8. perform exactly one `apply_migration`; on mismatch or error stop without
   retry and do not run the emergency stop automatically;
9. run read-only postflight catalog, role, RLS, projection, function ACL, and
   Advisor checks;
10. keep `MARKET_PROFILE_GB_EW_SC_ENABLED` disabled.

The current repository contains no Package B migration. CI enforces that this
preflight cannot be mistaken for migration authority.

## 9. Rollback And Emergency Contract

The future migration is expand-only and non-activating. Recovery has two
different modes:

- **Emergency stop:** keep/force the server activation flag false, stop the
  server decision caller, and use a pre-reviewed revoke-only script to remove
  service EXECUTE and client projection SELECT if database isolation is needed.
  Existing rows remain intact pending the approved retention rule.
- **Rollback before any runtime write:** remove the projection, service
  function, policies, grants, and empty relations in dependency order only after
  catalog checks prove that no Package B data or dependent object exists.

Once any evidence, document, consent, or audit row exists, destructive rollback
is forbidden until `LEGAL-05` defines preservation, erasure, and legal-hold
behavior. The safe application fallback is the existing Package C
`blocked / market_not_enabled` presentation.

## 10. Real Owner Gate

The next decision is not “continue?” and not migration permission. Owner/Legal
must provide the eight concrete `LEGAL-01` through `LEGAL-08` outputs above in a
versioned artifact. Until then the correct engineering result is a tested,
read-only preflight with no schema mutation.
