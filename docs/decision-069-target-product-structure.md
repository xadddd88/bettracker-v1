# Decision #069 — Target Product Structure and Global Market Architecture

Date: 2026-07-29
Proposed by: CPO
Approved by: Founder (conversation approval: «начинаем работать согласно нового плана», 2026-07-29)
Status: EXECUTED / CLOSED, DOCS-ONLY — repository adoption complete via PR #242. Runtime implementation, provider calls, migrations, production writes, company formation, monetization, and market launch are not authorized by this decision.

## Context

The previous product documents mixed several incompatible directions:

- seven interface locales tied too closely to market expansion;
- LineHunter / edge-hunting language;
- predictive live Scout and market-aware betting options;
- a tracker/analytics foundation that had already evolved toward immutable decisions, explicit trust gates, risk control, and evidence-first review;
- a phased Core / Intelligence / Discovery framing that the Founder rejected for the target product.

R17 competitor analysis and the legal/market review showed that BetTracker's strongest defensible position is not selecting bets. It is a private system for decision quality and risk control.

R18 was reconciled against `main@d96f1d2d142bfdd8f729cefa8e483c0fb9b49e0e` and specifies the complete target product, all required states, and the handoff for Claude Design.

## Decision

Adopt `docs/product.md` (R18 — BetTracker Target Product Structure v1.0) as the product source of truth.

BetTracker is positioned as:

> A private decision-quality and risk-control system that helps a user record a decision before an event, check risk, account for the result correctly, and understand the quality of the process.

The complete target product is one scope. It is not divided into Core, Intelligence, and Discovery releases, and required sections are not hidden behind `coming later`.

The canonical product architecture is:

- Home;
- Research;
- Journal;
- Insights;
- Risk;
- global Add, Review Inbox, Search, Privacy View, Assistant, Tools, Notifications, Settings, and Trust Center.

The first internal market profile is `GB_EW_SC`:

- eligible territory: England, Wales, and Scotland;
- `storefront_country=GB`;
- Northern Ireland remains unsupported until a separate MarketProfile and legal gate are approved;
- market eligibility is server-controlled and independent from locale.

The interface locales are:

- English (`en`);
- українська (`uk`);
- русский (`ru`).

Changing locale must not change market eligibility, legal profile, pricing, currency policy, or feature access.

## Superseded Product Consequences

Decision #069 supersedes only the conflicting product consequences of:

- Decision #007 — seven-locale scope;
- Decision #008 — live predictive Scout;
- Decision #009 — LineHunter / “Hunt the edge. Beat the line.”

The historical records remain immutable.

Decision #069 preserves:

- Decision #005 and the Decision-first architecture;
- current security, RLS/RPC, idempotency, audit, provider, sports-data trust, settlement, and financial gates;
- existing production data and working engineering foundations;
- all narrower holds unless a later decision explicitly changes them.

## Product Boundaries

BetTracker must not:

- connect bookmaker accounts or place bets;
- provide affiliate links or bookmaker calls to action;
- rank “best bets” or generate copy-bet/social picks;
- recommend a stake or loss-recovery system;
- promise profit, bankroll growth, winning streaks, or beating the line;
- present fabricated, stale, incomplete, or unverified data as intelligence;
- let AI calculate authoritative financial or analytical metrics.

Research may prepare evidence and a Decision draft, but it cannot create a Bet. A Bet is a user-owned record of an independently taken action and remains subject to server-side policy and financial contracts.

## One Product, Safe Implementation

“One complete product” defines scope, information architecture, states, and design coverage. It does not waive engineering dependencies or safety gates.

Implementation may be split into reviewable PRs only to preserve correctness, testing, rollback, and auditability. Those PRs are merge order, not separate product editions or optional phases.

Blocked, verification-required, unsupported, stale, and insufficient-data states are mandatory variants of fully designed features. They are not substitutes for the working state.

## Corporate and Legal Boundary

The working candidate is one OpCo with one codebase and separately enabled MarketProfiles. UK Ltd is a hypothesis pending a written joint UK–UA tax/legal memo.

This decision does not:

- form a company;
- approve a tax structure;
- constitute gambling, consumer, privacy, or advertising advice;
- authorize sales, subscriptions, storefront publication, or public marketing;
- claim UK-only data residency;
- enable any additional market.

## Documentation Effects

This decision:

- replaces `docs/product.md` with approved R18;
- turns `PRODUCT_VISION_GAP.md` into a current-to-R18 implementation control document;
- aligns `docs/strategy.md`, `README.md`, `PROJECT_STATE.md`, `docs/decisions.md`, and the numbering ledger;
- preserves old decisions as history rather than editing their original text.

## Non-Authorization

This documentation decision authorizes no:

- application or mobile runtime change;
- Supabase migration, SQL, RPC, schema, RLS, or data write;
- provider, AI, payment, email, or production smoke call;
- Vercel, environment, store, DNS, or deployment action;
- production user invitation or external beta;
- Decision #056 rerun;
- source-freshness, enrichment, odds, result, grading, or settlement execution;
- company registration, contract execution, monetization, or market launch.

## Consequences

- R18 is the source of product truth.
- Product and design work must cover the full target structure for Web, iPhone, and Android.
- Claude Design receives the handoff in section 21 of `docs/product.md`.
- Engineering begins with a current-to-target foundation map and dependency-safe PRs while retaining all existing runtime holds.
- Decision #070 is the next unreserved decision number.
