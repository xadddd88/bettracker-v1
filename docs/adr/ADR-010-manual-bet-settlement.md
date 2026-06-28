# ADR-010 — Manual Bet Settlement

Status: Accepted — Sprint 3 implementation

## Context

Sprint 2 introduced Decision Intelligence:

```
AI Analysis → Decision → Place / Watch / Skip → Optional Bet
```

However, the product cannot calculate real performance until bets can be settled.

Without settlement:
- ROI is meaningless
- Win Rate is meaningless
- Net Profit is incomplete
- Bankroll history is incomplete
- User accountability is incomplete

## Decision

Implement manual settlement for bets: Won / Lost / Void.

Settlement must be server-side, atomic, and idempotent.
A bet can only be settled once.

## Financial Model

Stake is deducted when the bet is placed. Therefore:

**Won**
```
payout  = stake * total_odds
profit  = stake * (total_odds - 1)
bankroll += payout
```

**Lost**
```
payout  = 0
profit  = -stake
bankroll unchanged
```

**Void**
```
payout  = stake
profit  = 0
bankroll += stake
```

## Implementation

RPC: `settle_bet(p_bet_id uuid, p_outcome text)`

The RPC must:
- verify `auth.uid()` owns the bet
- lock bet row with `FOR UPDATE`
- reject already-settled bets (idempotent)
- calculate payout and profit server-side
- update `bets.status`, `settled_at`, `settlement_outcome`, `pnl`
- create `bankroll_transaction` (type `payout`) for Won and Void
- no bankroll transaction for Lost
- reject duplicate settlement

## Dashboard Metrics After Settlement

```
Net Profit    = sum(pnl) where status IN ('won','lost','void')
Win Rate      = won / (won + lost)
ROI           = net_profit / sum(stake) for won+lost bets
Pending Stake = sum(stake) where status = 'pending'
```

Void excluded from Win Rate and ROI denominator.

## Consequences

**Positive:**
- Real ROI becomes possible
- Real Win Rate becomes possible
- Full bet lifecycle available
- User accountability improves
- Future learning loop becomes possible

**Tradeoffs:**
- Manual settlement depends on user honesty
- Automated result sync deferred to future sprint

## Non-Scope (Sprint 3)

Not included:
- auto-settlement
- bookmaker sync
- cashout
- half-won / half-lost
- live odds
- CLV / line movement
