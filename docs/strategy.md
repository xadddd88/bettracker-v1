# BetTracker — Strategy

> Level 1 document. Product details and acceptance criteria live in [`product.md`](product.md).

## Vision

Build the most trusted private system for improving betting decision quality and controlling risk.

## Mission

Help a user record a decision before an event, check risk, account for the result correctly, and learn from the quality of the process.

BetTracker does not tell the user what to bet, where to bet, or how much to stake.

## Positioning

> BetTracker is the private decision-quality and risk-control layer between evidence, a user's own decision, and the later review.

The product is not:

- a tipster;
- a bookmaker or bookmaker connector;
- a signal feed;
- a social picks network;
- a copy-bet product;
- a profit promise.

## Core Product Cycle

```txt
Research → Decision → Risk Check → Pass / Paper / Bet → Resolution → Review
```

Decision is the primary object. Bet is a separate user-owned record of an independently taken action. Result does not retroactively redefine decision quality.

## Strategic Principles

1. Decision before outcome.
2. Decision quality is not the same as result.
3. Code calculates; AI explains.
4. Evidence before confidence.
5. Risk before action.
6. No fabricated availability or false precision.
7. Private by default.
8. The user owns export and deletion.
9. Market is independent from locale.
10. No dark patterns.

## Product Architecture

The complete product has five canonical sections:

- Home;
- Research;
- Journal;
- Insights;
- Risk.

Global capabilities include Add, Review Inbox, Search, Privacy View, Assistant, Tools, Notifications, Settings, and Trust Center.

The same entity, state, policy, and metric contracts apply to Web, iPhone, and Android.

## Global Model

The operating model is:

> One codebase → one operating core → three interface locales → separately approved MarketProfiles.

The first internal profile is `GB_EW_SC` for England, Wales, and Scotland. Northern Ireland is excluded until separately approved.

The interface locales are `en`, `uk`, and `ru`. Locale never grants market eligibility.

One OpCo is the working structural hypothesis. UK Ltd, tax residence, payments, data residency, monetization, and launch remain subject to written UK–UA and market-specific advice.

## North-Star Metric

**Weekly Completed Decision Users**

A counted user completes:

```txt
Decision → Risk Check → Result → Review
```

Profit, turnover, bet count, win streak, AI message count, and app opens are not north-star metrics.

## Business Model

Subscription may monetize advanced analysis of the user's own history, deeper reports, additional deterministic simulations, automation, and convenience.

Never paywall:

- export;
- account deletion;
- responsible-use controls;
- core limits;
- access to basic personal history;
- cancellation and billing control required by law.

No ads, bookmaker affiliate links, sale of picks, or paid ranking of betting opportunities.

## Competitive Advantage

The differentiated intersection is:

- Decision Ledger;
- evidence-first Review;
- Risk Controls;
- transparent deterministic mathematics;
- AI that explains verified user data without predicting or inventing.

Competitor mechanics are adapted only when they strengthen this intersection and preserve legal, trust, privacy, and responsible-use boundaries.

## Delivery Rule

R18 is one complete target product. Engineering may use dependency-safe PRs for correctness, testing, rollback, and review, but those PRs do not define smaller product editions and may not erase required screens or states.

## Anti-Vision

BetTracker will not:

- rank “best bets”;
- recommend stake size;
- generate live betting opportunities or push signals;
- use Martingale, loss recovery, or chasing mechanics;
- gamify profit, turnover, streaks, or frequency;
- claim guaranteed returns, bankroll growth, or “beating the line”;
- present stale, incomplete, or unverified data as evidence.

---

*Adopted by Decision #069: 2026-07-29*
*Owner: CPO*
