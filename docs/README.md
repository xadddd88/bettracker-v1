# BetTracker Docs

This folder is the product, architecture, trust, and decision memory for BetTracker.

## Product Source of Truth

[`product.md`](product.md) is the approved R18 product source of truth under Decision #069.

BetTracker is a private decision-quality and risk-control system. It does not rank bets, recommend stake size, connect bookmakers, promise profit, or position itself as LineHunter.

## Key Principles

- Decision before outcome
- Decision quality is not result
- Code calculates; AI explains
- Evidence before confidence
- Risk before action
- Private by default
- Market is independent from locale
- English (`en`), українська (`uk`), русский (`ru`)

## Structure

- [`product.md`](product.md) — complete R18 product, design, data, state, and acceptance specification
- [`strategy.md`](strategy.md) — level-1 strategy
- [`decisions.md`](decisions.md) — immutable decision history
- [`decision-ledger-numbering-governance.md`](decision-ledger-numbering-governance.md) — numbering governance
- [`../PROJECT_STATE.md`](../PROJECT_STATE.md) — current operational state and holds
- [`../PRODUCT_VISION_GAP.md`](../PRODUCT_VISION_GAP.md) — current implementation gap to R18

## Team

| Role | Agent |
|------|-------|
| Founder / CEO | Дима |
| CPO / Product Architect | ChatGPT |
| Lead Engineer / Technical Reviewer | Claude Chat |
| Implementation Agent | Claude Code |

Operational facts in `PROJECT_STATE.md` do not override product truth in R18, and R18 does not lift runtime holds recorded in `PROJECT_STATE.md`.
