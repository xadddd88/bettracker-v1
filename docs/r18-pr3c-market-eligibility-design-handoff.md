# R18 PR3C — Market Eligibility Design And Engineering Handoff

Status: DESIGN / ENGINEERING HANDOFF ONLY — no runtime authority
Date: 2026-08-13
Baseline: `main@0e96784ea5aa65dd2fbc741d29abfe653ec78423`
Product source: [`docs/product.md`](product.md), sections 4, 14, 15, and
acceptance criteria 43, 46, 49, 50, and 59
Policy source: [`r18-pr3b-market-eligibility-contract.md`](r18-pr3b-market-eligibility-contract.md)

## 1. Outcome And Authority Boundary

PR3C defines how the existing PR3B policy must be presented and handed to later
implementation. It does not implement the policy at a runtime entry point.

This handoff defines:

- one canonical market-access journey shared by onboarding and Settings;
- exact presentation for every PR3B eligibility status and reason;
- separation of legal-terms acknowledgement, privacy-notice presentation, and
  genuinely optional consent;
- minimal evidence classes for a later persistence design;
- fail-closed loading, unavailable, conflict, and blocked behavior;
- accessibility, copy, telemetry, test, and acceptance requirements;
- dependency-safe implementation packages after this handoff.

This handoff authorizes none of the following:

- no application route, middleware, API, component, or mobile change;
- no Supabase migration, schema, table, view, RLS policy, RPC, grant, backfill,
  catalog change, or production query;
- no environment or Vercel/Supabase configuration change;
- no market activation, legal approval, user entitlement, or external-beta
  invitation;
- no collection of age, residence, location, document, consent, or user data;
- no provider, bookmaker, affiliate, billing, payment, AI, or external-service
  integration;
- no bet placement, transmission, prefill, deep link, or suggested stake;
- no deployment, production smoke, or live role probe.

`GB_EW_SC_PROFILE_V1` remains `configured`, not `enabled`, and
`MARKET_PROFILE_GB_EW_SC_ENABLED` remains unset/disabled. A complete-looking
future form must still resolve to `blocked / market_not_enabled` until a separate
activation decision is approved.

## 2. Inputs And Confidence

### Accepted repository facts

- PR3A defines the active locale set as exactly `en`, `uk`, and `ru`.
- PR3B defines `GB_EW_SC` as England, Wales, and Scotland; Northern Ireland is
  unsupported under this profile.
- Storefront country `GB`, locale, currency, timezone, and odds format cannot
  establish or elevate market eligibility.
- Only the exact `eligible` status grants access.
- Routine rechecks may preserve or reduce access but cannot elevate a denied
  decision to `eligible`.
- Active membership and market eligibility are separate gates. An active member
  can still be market-ineligible, and market eligibility cannot restore inactive
  membership.

### Research input

The attached external research pack is accepted only as non-binding input for
privacy, age, territory, data-minimisation, and gambling-adjacent design risks.
It is not legal advice and does not approve product classification or launch.

The following remain **LEGAL INPUT REQUIRED**:

1. whether the service is likely to be accessed by children;
2. the proportionate age-assurance method and assurance strength;
3. the residence and current-territory verification methods and signal weights;
4. lawful basis for every processing purpose;
5. retention and deletion periods for evidence and audit records;
6. English-master legal text, translation priority, and version lifecycle;
7. whether any optional analytics, AI history, or AI memory purpose relies on
   consent at all;
8. product classification and permitted copy before any provider odds,
   bookmaker reference, affiliate surface, or commercial launch.

The UX must use neutral placeholders such as “verification method determined by
policy” until those decisions exist. It must not quietly substitute a checkbox,
IP address, storefront, browser locale, exact geolocation, or document upload as
the approved method.

## 3. Current-State Gap

The current product has no market-eligibility persistence or UI integration.

| Surface | Current state | PR3C design consequence |
|---|---|---|
| Dashboard onboarding | Four-step dismissible education card; completion only toggles the existing onboarding flag | Eligibility cannot be hidden in or completed by the current dismiss action. It needs a separate resumable server-owned journey. |
| Onboarding copy | Includes “сохраняй ставку из AI-рекомендации” | Replace in a separate copy/runtime slice with neutral user-owned journal language. Never present Research or AI as creating or prefilling a Bet. |
| Settings | Profile, currency, stake default, Kelly fraction, Web search, email, and timezone | Add a future Trust Center information architecture without mixing eligibility writes into the existing `save_user_settings` RPC. |
| Access denied | Represents inactive membership only | Keep membership denial distinct from market eligibility. Do not reuse one generic “access denied” reason for both. |
| Service unavailable | Represents membership-check dependency failure | A future eligibility-policy unavailable state may reuse the visual system, not the route semantics or recovery action. |
| PR3B policy | Pure server-only evaluator with no runtime caller | UI never evaluates eligibility locally and never imports `server-policy.ts`. |

The existing `OnboardingCard` copy defect is documented by this handoff but not
changed here. That preserves this PR as a design/evidence slice and prevents an
unreviewed runtime-copy change from being hidden inside governance work.

## 4. Experience Architecture

### 4.1 Canonical surfaces

The later implementation has three coordinated surfaces:

1. **Onboarding · Market access** — collects only approved evidence classes,
   presents required documents, and submits a server review request.
2. **Settings · Market access** — the canonical status, evidence freshness,
   legal-document, recheck, and recovery surface.
3. **Market gate** — a route-level server decision that chooses the appropriate
   working or blocked experience. It does not expose private evidence in URLs,
   redirects, logs, or client-readable error text.

Settings remains the canonical owner after onboarding. Onboarding links to it
instead of creating a second editable source of truth.

### 4.2 Working and blocked experiences

A blocked state is an additional state of the complete product, not a substitute
for its working design.

- `eligible` shows the normal product, subject to active membership and all
  feature-specific policies.
- Every non-eligible state blocks market-restricted Research/AI/actions.
- Where an account already has records, non-eligible states preserve factual
  history, Review, export, delete, billing, support, and legal/privacy controls.
- A state must never imply that changing locale, currency, timezone, storefront,
  or browser settings can unlock access.
- A state must never reveal detailed evidence, fraud/risk logic, or another
  person’s data.

### 4.3 Navigation hierarchy

The future Settings information architecture is:

- Account
- Market access
- Language and display
- Privacy and AI controls
- Security
- Billing
- Export and delete
- Help and responsible use

PR3C does not add routes. The later implementation may use sections or nested
routes, but “Market access” must have one canonical URL and return focus to the
originating task after a successful server recheck.

## 5. Onboarding Flow Contract

The flow is resumable, keyboard-operable, and does not auto-advance. Closing the
educational onboarding card cannot mark market eligibility complete.

| Step | User-visible purpose | Input/behavior | Safe result |
|---|---|---|---|
| 1. Product boundary | Explain that BetTracker is a private decision journal and analysis tool | No bookmaker, bet-placement, “best bet”, profit, or suggested-stake copy | Continue only; no eligibility effect |
| 2. Language | Choose `en`, `uk`, or `ru` for UI and document presentation | Locale is display-only and cannot alter policy | Saved as preference in a later approved slice |
| 3. Residence | Select England, Wales, Scotland, Northern Ireland, another territory, or “not available” | Store only the approved territory class, never free text by default | Server returns unsupported or requests verification; client cannot grant access |
| 4. Current territory | Provide the approved coarse current-territory evidence class | No precise location or always-on geolocation by default | Server may return travel-limited, conflict, or verification-required |
| 5. Age threshold | Complete the future approved 18+ assurance method | Do not treat a UI checkbox as sufficient unless legal policy explicitly approves it | Required/pending/verified evidence state only |
| 6. Required documents | Show current terms and privacy notice with document id, version, locale, and effective date | Terms acknowledgement and privacy-notice presentation are recorded separately | Missing/stale terms fail closed; privacy notice is not labelled optional consent |
| 7. Optional choices | Offer only purposes that genuinely rely on optional consent | Separate controls, off by default, equally easy accept/refuse/withdraw | Refusal cannot block core access unless counsel identifies a distinct lawful requirement |
| 8. Review | Summarize classes and document versions without sensitive raw evidence | Submit once; disable duplicate submit; preserve user input on recoverable error | Server-owned decision; never optimistic `eligible` |
| 9. Result | Explain current status and next safe action | Render the exact status/reason mapping below | Market remains blocked while activation flag is off |

The review screen must state that storefront, locale, currency, and timezone are
not proof of eligibility. It must not show a confidence score or encourage users
to manipulate evidence.

## 6. Terms, Privacy, And Consent Separation

The later persistence design must not use one bundled `consent=true` field.

| Record class | Meaning | Required interaction | Access effect |
|---|---|---|---|
| Terms acknowledgement | User accepts the current service terms | Explicit action against exact document id/version/locale | May be required when legal terms are current policy |
| Privacy-notice presentation | Product records which notice was shown | Clear notice/link; acknowledgement only if counsel requires it | Not described as consent to necessary processing |
| Optional analytics consent | Optional measurement purpose only if consent is the selected lawful basis | Independent toggle, off by default, withdrawable | Refusal does not block core product |
| Optional AI history consent | Optional retention/use of AI interaction history if applicable | Independent control and explanation | Refusal changes that feature only |
| Optional AI memory consent | Optional cross-session memory if applicable | Independent control and explanation | Refusal changes memory only |
| Marketing consent | Future promotional messaging only if later approved | Separate, off by default, withdrawable | No effect on core market eligibility |

Required copy rules:

- never say “Accept privacy policy” as a substitute for lawful-basis analysis;
- never preselect optional consent;
- never make an optional control visually secondary to “accept all”;
- never bundle terms, analytics, AI history, AI memory, and marketing;
- show `document_id`, version, effective date, and displayed locale;
- English is the legal master; `uk` and `ru` are verified translations of the
  same document id/version, subject to final legal wording;
- changing locale does not create new legal terms or change eligibility.

## 7. Minimal Future Evidence Contract

This is a semantic handoff, not a schema. Names are illustrative until a later
migration review.

### 7.1 Entity ownership

| Entity | Owns | Must not own |
|---|---|---|
| `MarketProfile` | Versioned territory, minimum age, document requirements, activation and policy configuration | User evidence, travel state, consent, or user decision history |
| `UserMarketEligibility` | Current server decision, reason, policy version, checked/expiry timestamps | Raw documents, precise geolocation, client authority, or locale-derived access |
| `EligibilityCheck` | Minimal evidence classes, assurance method code, result, provenance class, timestamps | Raw bookmaker/payment credentials, full ID scans by default, or unbounded telemetry |
| Required-document record | Terms acknowledgement or privacy-notice presentation for an exact document version | Optional-purpose consent |
| `ConsentRecord` | One optional purpose, status, displayed locale, capture method, given/withdrawn timestamps | Bundled global consent or market-profile authority |

### 7.2 Minimum fields to evaluate later

- stable user id;
- market profile id and policy version;
- residence territory class;
- current territory class;
- storefront evidence class, explicitly non-authoritative;
- signal assessment: consistent, conflict, or unresolved;
- verification state: required, pending, or verified;
- age-threshold result and approved assurance-method code, not full date of birth
  unless later justified;
- legal document id/version/locale and acknowledgement/presentation timestamp;
- eligibility status and reason;
- checked-at, expires-at, and review-due-at where approved;
- optional-consent purpose, status, version, locale, capture method, given-at,
  and withdrawn-at only when that purpose uses consent.

### 7.3 Data that is out of scope by default

- full passport, identity-card, or proof-of-address images;
- exact GPS history or always-on geolocation;
- raw IP history retained “just in case”;
- bookmaker account credentials, wallet data, payment-card data, or bet slip
  transfer data;
- stake preferences as eligibility evidence;
- user-editable JWT metadata or `user_metadata` as authorization evidence;
- raw vendor risk scores exposed to the client;
- inferred vulnerability profiling without a separately approved lawful basis;
- optional-purpose data after consent withdrawal beyond an approved audit record.

Retention periods, deletion rules, and evidence-strength thresholds remain
**LEGAL INPUT REQUIRED**. The later implementation must fail closed when a
required policy value is absent rather than inventing a default.

### 7.4 Future Supabase boundary

A later schema slice must be reviewed independently and must:

- keep internal evidence and decision-write surfaces outside the client-writable
  Data API boundary;
- use explicit grants plus RLS as separate controls for every exposed relation;
- allow authenticated users to read only the minimum presentation projection for
  their own account;
- deny direct client INSERT/UPDATE/DELETE of server decisions, reason codes,
  assurance results, policy versions, checked-at, and expiry fields;
- perform decision changes through a reviewed server-only path; never expose a
  `service_role` or secret key to the browser;
- preserve S2.3 live-membership enforcement and existing ownership predicates;
- use security-invoker views for any client-readable projection where a view is
  required;
- review every function ACL explicitly and avoid a public `SECURITY DEFINER`
  shortcut;
- include a disposable PostgreSQL 17 verifier, exact fresh production preflight,
  rollback/emergency plan, Security Advisor review, and separate apply approval.

No table or function name in this handoff authorizes its creation.

## 8. Exact Status And Reason Presentation

The client receives a safe presentation model derived on the server. It must not
derive status from raw evidence or display internal evidence values.

| Status / reason | Heading intent | Primary action | Secondary safe access |
|---|---|---|---|
| `eligible / eligible` | Market access confirmed | Continue to Home | View Market access details |
| `blocked / market_not_enabled` | This market is not available yet | View current status | Settings, privacy, help, existing history |
| `blocked / policy_blocked` | Access is currently unavailable | Contact support | Privacy, export/delete, existing history |
| `blocked / policy_state_unavailable` | Access check is temporarily unavailable | Retry once by explicit user action | Privacy, help, existing history; no optimistic access |
| `unsupported / unknown_market_profile` | This market profile is not supported | View supported area information | Privacy, export/delete, help, existing history |
| `unsupported / northern_ireland_not_in_profile` | Northern Ireland is not included in this profile | View supported area information | Privacy, export/delete, help, existing history |
| `unsupported / unsupported_residence` | Service is not available for the recorded residence | Review recorded class or contact support | Privacy, export/delete, help, existing history |
| `verification_required / residence_verification_required` | Residence information is required | Start approved verification | Save progress, privacy, help |
| `verification_required / market_signals_unresolved` | More information is required | Continue approved verification | Save progress, privacy, help |
| `verification_required / current_location_required` | Current territory is required | Provide approved coarse evidence | Save progress, privacy, help |
| `verification_required / legal_terms_status_required` | Current terms status is required | Review current documents | Privacy notice, help |
| `verification_required / verification_required` | Verification is required | Continue verification | Save progress, privacy, help |
| `verification_pending / verification_pending` | Verification is being reviewed | View review status | Privacy, help, existing history; no repeated submit |
| `travel_limited / travel_outside_profile` | Market-restricted features are limited while travelling | Review current status | History, Review, export/delete, billing, privacy, support |
| `signal_conflict / market_signal_conflict` | Provided signals do not agree | Review information or contact support | Save progress, privacy, help; do not reveal anti-abuse logic |
| `legal_terms_update_required / legal_terms_update_required` | Updated terms require review | Review exact new version | Privacy notice, existing history, help |

Copy is localized as a complete screen in `en`, `uk`, and `ru`; no screen mixes
languages. Reason codes are telemetry/debug identifiers, not raw user-facing
sentences. The product must not promise a review time unless a real service-level
commitment exists.

## 9. Screen And Component Handoff

Use the existing Broadcast Noir design system. Do not introduce a second palette,
new radius system, or gambling/bookmaker visual language.

### 9.1 Onboarding · Market access

- page header: step name, progress text, and concise reason for collection;
- one `BroadcastPanel` per decision, with explicit labels and supporting copy;
- full text choice controls with selected state, never flags alone;
- persistent Back and Continue actions; Continue disabled only with a visible
  explanation;
- Save and exit where the server can safely persist a draft later;
- document links open without losing entered values;
- review screen groups “Your information”, “Required documents”, and “Optional
  choices” as separate sections;
- submission result uses `BroadcastStatus` plus heading and prose, never color or
  icon alone.

### 9.2 Settings · Market access

- current status and plain-language next action;
- market profile label and eligible territory description;
- last checked and expiry/review date when available;
- coarse evidence categories and verification state, not raw evidence;
- current terms and privacy-notice versions;
- explicit recheck/review action that cannot optimistically elevate access;
- support path and preserved-access links.

### 9.3 Settings · Privacy and AI controls

- required processing and privacy notice shown separately from optional choices;
- one optional purpose per row with equal on/off visual weight;
- withdrawal uses the same interaction cost as opt-in;
- status changes announce success/failure without exposing sensitive payload;
- AI history and AI memory remain separate controls;
- no promotional or bookmaker consent surface in the current product.

### 9.4 Market gate

- deterministic server-selected state;
- no loading flash of protected market content;
- no client-side elevation after hydration;
- one clear primary recovery action;
- membership-denied and service-unavailable routes remain semantically distinct;
- browser Back and refresh cannot reveal restricted content.

## 10. Accessibility And Responsive Contract

Later visual implementation must prove, not merely claim:

- semantic headings and landmarks in a stable reading order;
- every field has a persistent visible label and programmatic description;
- grouped choices use `fieldset`/`legend` or an equivalent accessible pattern;
- keyboard access, visible focus, logical focus return, and no focus trap;
- minimum 44-by-44 CSS-pixel interactive targets;
- status is conveyed by text and semantics, not color/icon alone;
- error summary receives focus and links to each invalid field;
- async status uses an appropriate live region without repeated announcements;
- progress exposes the current step and total without relying on decorative dots;
- 200% zoom and 320px reflow without horizontal scrolling;
- dynamic text growth without truncating legal/status copy;
- reduced-motion preference disables non-essential entry/progress animation;
- document links, Back, Save and exit, Continue, refuse, and withdraw remain
  reachable with keyboard and screen reader;
- no timeout during evidence or document review unless security policy requires
  it and gives an accessible warning/recovery path.

## 11. Telemetry And Privacy

Telemetry is a product-quality signal, never eligibility evidence.

Allowed future events are coarse interaction events such as:

- market-access screen viewed;
- step viewed/completed;
- document opened;
- submission succeeded/failed;
- status screen viewed;
- explicit retry selected;
- optional purpose changed;
- support path selected.

Telemetry must not include date of birth, raw territory/location, IP address,
document content, assurance vendor payload, exact evidence, free-text support
detail, consent text, or a user property that enables eligibility reconstruction.
Event names and allowed properties require their own analytics privacy review.

## 12. Error And Recovery Contract

- Validation errors preserve every non-sensitive entry and identify the exact
  field without echoing secrets.
- Network/dependency failure never clears an existing server decision and never
  grants access.
- Duplicate submit is disabled client-side and idempotent server-side in the
  later implementation.
- A pending review cannot be restarted merely by refreshing the page.
- Stale document version returns `legal_terms_update_required`, not a generic
  form error.
- Policy unavailable returns `blocked / policy_state_unavailable` and offers one
  explicit retry; no automatic retry loop.
- Signal conflict gives a neutral support/review path without describing how to
  defeat the control.
- Withdrawal of optional consent changes only that optional purpose and cannot
  silently rewrite required document records or eligibility.
- If the account becomes inactive, the existing active-membership boundary wins
  before any market state is rendered.

## 13. Acceptance Matrix

A later implementation is incomplete until automated and visual evidence proves:

1. all eight PR3B statuses and every current reason code map to one approved
   heading, description, primary action, and preserved-access set;
2. only a server-issued `eligible` decision grants market access;
3. the disabled market flag blocks access even with otherwise complete evidence;
4. client, locale, storefront, currency, timezone, odds format, URL, or browser
   settings cannot elevate access;
5. Northern Ireland returns `unsupported`, not `eligible`;
6. routine recheck cannot turn a denied state into `eligible`;
7. active membership remains a separate prerequisite;
8. terms acknowledgement, privacy-notice presentation, analytics consent, AI
   history consent, AI memory consent, and marketing consent are not bundled;
9. optional consent starts off, may be refused, and may be withdrawn without
   blocking unrelated core access;
10. no raw evidence or sensitive reason is exposed in client logs, URL, analytics,
    error body, or rendered copy;
11. history, Review, export/delete, billing, privacy, support, and responsible-use
    access is preserved for unsupported/travel states where an account has data;
12. every state is complete in `en`, `uk`, and `ru` with no mixed-language screen;
13. onboarding is resumable and does not mark eligibility complete when dismissed;
14. no Research/AI screen creates, prefills, transmits, deep-links, or recommends
    a Bet or stake;
15. keyboard, focus, screen-reader, contrast, target-size, reduced-motion,
    dynamic-text, and 320px reflow checks pass;
16. working, empty, loading, validation, dependency unavailable, status, and
    recovery states have approved screenshots before runtime merge;
17. any future Supabase objects have explicit grants, RLS, ownership tests,
    function ACL tests, disposable PostgreSQL 17 verification, and Advisor review;
18. activation has a separate legal/market decision and is not a consequence of
    schema, UI, deployment, or this handoff.

## 14. Dependency-Safe Implementation Packages

This handoff is complete before any package below starts. Packages must remain
separately reviewable.

### Package A — Copy and presentational contract

- replace the current AI-recommendation onboarding sentence with neutral
  user-owned journal language;
- add versioned copy keys and pure presentation-model types for all statuses;
- add no persistence, policy caller, route gate, environment read, or production
  mutation;
- obtain visual acceptance for Web and mobile layouts.

### Package B — Persistence and server decision boundary

- design the minimal schema, read projection, grants, RLS, service-only decision
  path, audit model, and rollback/emergency contract;
- resolve all `LEGAL INPUT REQUIRED` items that affect fields, evidence strength,
  legal versions, lawful basis, or retention;
- require a fresh read-only production preflight and separate migration approval;
- do not enable the market.

### Package C — Onboarding, Settings, and gate integration

- render only a server-produced presentation model;
- implement resumable onboarding, Trust Center, all blocked/working states, and
  preserved safe surfaces;
- keep `MARKET_PROFILE_GB_EW_SC_ENABLED` disabled;
- run policy, authorization, locale, accessibility, responsive, and hermetic
  browser acceptance tests.

### Package D — Activation readiness

- obtain legal/product/market sign-off, document/provider/storefront readiness,
  support procedures, privacy evidence, and production runbook approval;
- repeat full read-only preflight and exact-head release checks;
- change activation only under a separate explicit authorization.

Package D is not approved by this handoff.

## 15. Design Review Checklist

The missing Claude Design response may be supplied later as an independent design
review. It must review this contract rather than replace its security/legal
boundaries. A valid review must include:

- Web and mobile frames for the complete onboarding journey;
- Settings Market access and Privacy/AI controls;
- eligible plus every blocked/pending/conflict/travel/legal-update state;
- loading, validation, dependency failure, and retry states;
- keyboard focus order and screen-reader notes;
- 320px, 375px, desktop, and dynamic-text/reflow evidence;
- direct confirmation that optional consent is not bundled or access-coerced;
- direct confirmation that no screen contains bookmaker CTA, bet transmission,
  suggested stake, profit promise, or AI-to-Bet conversion.

Until such frames exist, this document is a UX/data/security contract, not visual
design acceptance.
