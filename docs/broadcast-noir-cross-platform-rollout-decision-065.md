# Decision #065 — Broadcast Noir Cross-Platform Rollout

Date: 2026-07-21
Status: ACTIVE / INTEGRATION DRAFT PR #202
Approved by: Founder

## Decision

BetTracker adopts Broadcast Noir v3.1 as one semantic visual system across
responsive Web, iPhone, and Android. The experience model is Hybrid Cinematic,
the first Home state is Adaptive Action, and motion follows Signal Sweep.
Operational surfaces remain dense and calm. Cinematic treatment is reserved for
real attention moments such as Scanner and future verified-event context.

## PR A scope

PR A replaces the independent Floodlight token definitions with one versioned,
platform-neutral source and platform adapters:

- canonical `design-system/broadcast-noir.v3.1.json`;
- one Web semantic variable layer and Tailwind adapter;
- one React Native semantic adapter used by iPhone and Android;
- Web and React Native panel, button, status, and neutral data-value primitives;
- WCAG contrast matrix, Web/mobile parity assertions, semantic-form assertions,
  reduced-motion guard, and CI compile/regression gate;
- temporary legacy aliases resolve only to Broadcast Noir semantic values and
  exist solely to let later PRs migrate screens without a cross-platform mega-PR.

No screen, route, navigation destination, content hierarchy, API, RPC, database,
provider, financial, or settlement behavior is redesigned in PR A.

## PR B scope

PR B is stacked on the exact PR A head so its review diff remains limited to
shell and platform behavior. It adds:

- compact responsive Web header and account/tools menu, replacing the old
  Floodlight sidebar without changing destinations;
- equal-width mobile Web navigation segments using signal/onSignal semantics;
- iPhone/Android bottom-tab styling with the approved Home, Scan, and Tracker
  destinations only;
- one safe-area owner for the native tab bar, removing the manual duplicated
  bottom inset calculation;
- reviewed BetTracker icon, adaptive icon, monochrome icon, favicon, and splash
  assets on the Broadcast Noir night field;
- Android predictive Back opt-in plus static regression assertions and an
  explicit device-evidence matrix.

The visible product name becomes BetTracker. Native identity and compatibility
values — Expo slug, URL scheme, iOS bundle identifier, Android package, EAS
project ID, runtime version, and update URL — remain unchanged.

## Semantic contract

The canonical required colors are:

| Token | Value | Meaning |
|---|---:|---|
| `night` | `#070A08` | App background |
| `field` | `#111813` | Operational surface |
| `fieldRaised` | `#202C23` | Raised surface |
| `borderSubtle` | `#334036` | Non-essential separator |
| `borderStrong` | `#59685E` | Structural/control boundary |
| `textPrimary` | `#F2F5F0` | Primary copy |
| `textMuted` | `#8D978F` | Secondary copy |
| `textQuiet` | `#78847B` | Compact metadata on field/night |
| `textQuietRaised` | `#8D978F` | Compact metadata on raised field |
| `dataValue` | `#C7D0C8` | Neutral odds and numeric data |
| `signal` | `#BFFF3B` | Action/active state |
| `onSignal` | `#061008` | Content on signal |
| `success` | `#67DF91` | Confirmed positive result |
| `negative` | `#FF7474` | Loss/destructive/negative result |
| `review` | `#FFC05B` | Incomplete evidence/operator review |

Signal, success, negative, review, and neutral data are not interchangeable.
Color is never the only status indicator. New status primitives require an
explicit label and symbol. Odds and non-status numbers use `dataValue`.

## Accessibility and platform contract

- Body and compact metadata pairs must satisfy WCAG AA.
- Structural control boundaries must reach 3:1 against their surface.
- Web and iOS touch targets are at least 44; Android targets are at least 48.
- Production metadata is at least 11 px and preferably 12 px.
- Reduced-motion settings disable transform/sweep animation.
- No infinite decorative animation, gradient atmosphere, or layout-shifting
  animation is part of the design-system primitives.

## Rollout sequence

1. PR A / #187 — semantic tokens, primitives, contrast/parity and CI gate.
2. PR B / #188 — brand shell/navigation/platform assets and native system behavior.
3. PR C / #190 — Adaptive Action Home; no Event First.
4. PR D / #194 — Scanner/AI cinematic treatment without network/auth/payload changes.
5. PR E / #195 — operational Tracker list/detail without financial logic changes.
6. PR F / #196 — statistics and Decision surfaces without new analytical claims.
7. PR G / #197 — complete cross-platform rollout and polish QA.
8. PR H / #199 — Scanner → editable Tracker draft, SafeArea, sport grouping, and P&L display corrections.
9. PR I / #200 — Web accessibility and hermetic acceptance coverage.
10. PR J / #201 — preblocked external WebSockets in the Web acceptance harness.

Each PR remains independently reviewable. A later PR may not silently absorb a
database, provider, financial, route, or Event First change.

## Integration checkpoint

The verified chain is #187 → #188 → #190 → #194 → #195 → #196 → #197 →
#199 → #200 → #201. Stages PR A–J, including the full Web rollout, are present
in Integration Draft PR #202. Decision #065 remains ACTIVE: the integration PR
is not Ready, not merged, and not production-deployed.

Web is prepared first. The integration diff also contains the reviewed mobile
source, but it authorizes no mobile release. Scanner hands only a reviewed,
editable draft to Tracker; the sole write action is an explicit manual Save
after Review through the existing authenticated `POST /api/bets/tracked`.
Auto-save does not exist. The server route, RPC, schema, migrations, settlement
behavior, and financial formulas were not changed by this rollout.

## Event First gate

Event First remains prohibited. Migration 025 is unapplied and
`create_tracked_bet_v2` has no application caller. A calendar date, display
name, scheduled kickoff, static Event Pulse, or Live label is not verified event
identity. PR C ships Adaptive Action only. Any future verified-event activation
requires the separately governed exact lineage path to be applied, wired, and
validated end to end.

## Explicit non-authorization

Decision #065 and Integration Draft PR #202 authorize no Supabase/DB write,
migration apply, new server route/RPC/schema, provider/AI runtime call, result
write, grading/settlement caller, payout/refund/bankroll change, Event First
activation, production smoke or deployment, Ready transition, merge, EAS Build
or Update, Android/iPhone build, beta distribution, or app publication.

FP-001, Decision #057, Decision #064, and all existing auth, rate-limit,
idempotency, scanner no-auto-save, and financial boundaries remain active.

The presence of mobile source authorizes only the reviewed source boundary
listed above. It does not authorize EAS, device builds, beta, publication, or a
production mobile smoke. Predictive Back cannot be marked device-verified until
the documented device matrix is recorded under separate authority.

## Acceptance evidence

The Integration Draft is acceptable only when:

- canonical, CSS, Web, and mobile semantic values remain in parity;
- the pinned contrast matrix passes;
- neutral borders are limited to the two documented neutral tokens;
- action/success/review/negative forms remain distinguishable without hue;
- Web TypeScript, mobile TypeScript, root safety suites, mobile regression tests,
  preview smoke, and Vercel Preview are successful on the exact PR head;
- the verified source preserves authentication, idempotency, manual Save,
  no-auto-save, provider, financial, settlement, and Event First boundaries;
- the integration remains Draft and neither Web nor mobile is production-released.

## P3 test/docs hardening

The local Integration Draft follow-up closes the three P3 items by:

1. rerunning axe, duplicate-ID, document-overflow, and authenticated
   shell-scroll-container overflow checks after interactive states;
2. failing closed on every application `console.error`;
3. directly proving bracketed IPv6 loopback `[::1]` normalization before the
   hermetic network allowlist is applied.

The supporting `docs/csp-report-only-observation-receipt-065.md` classifies the
authenticated Preview telemetry/CSP evidence but authorizes no CSP enforcement.
Exact-head GitHub CI, Vercel Preview, and independent review remain required
before any Ready decision.

## Numbering

Decision #065 is occupied and ACTIVE in Integration Draft PR #202.
Decision #066 is the next unreserved number.
