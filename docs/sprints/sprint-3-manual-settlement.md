# Sprint 3 — Bet Lifecycle & Manual Settlement MVP

Status: In Progress 🔄

## Goal

Implement manual bet settlement: Won / Lost / Void.

The system must atomically update: bet status, settlement fields, bankroll, dashboard metrics.

## Why

Without settlement:
```
Win Rate  = meaningless
ROI       = meaningless
Profit    = incomplete
Bankroll history  = incomplete
Decision accountability = incomplete
```

Sprint 3 closes the outcome loop:
```
Decision → Bet → Result → Performance
```

## Settlement Rules

Stake is already deducted when bet is placed.

**Won**
```
payout  = stake * total_odds
profit  = stake * (total_odds - 1)
bankroll transaction = +payout
```

**Lost**
```
payout  = 0
profit  = -stake
no bankroll transaction
```

**Void**
```
payout  = stake
profit  = 0
bankroll transaction = +stake
```

## RPC

```sql
settle_bet(p_bet_id uuid, p_outcome text)
```

Requirements:
- `SECURITY DEFINER SET search_path = public`
- Use `auth.uid()` for identity
- `SELECT ... FOR UPDATE` to lock row
- Verify bet belongs to current user
- Reject already-settled bets (idempotent)
- Accept only: `won` / `lost` / `void`
- Calculate payout and profit server-side
- Update `bets.status`, `settled_at`, `settlement_outcome`, `pnl`
- Create bankroll transaction for Won and Void only
- Never double-settle

## API

```
POST /api/bets/[id]/settle
Body: { "outcome": "won" | "lost" | "void" }
```

## UI

Bet detail page `/bets/[id]`:
- Show `[Won] [Lost] [Void]` buttons while status = pending
- After settlement: hide buttons, show status / settled_at / profit / payout

## Dashboard Metrics

```
Net Profit    = sum(pnl) where status IN ('won','lost','void')
Win Rate      = won / (won + lost)
ROI           = net_profit / sum(stake for won+lost) * 100
Pending Stake = sum(stake) where status = 'pending'
```

Void excluded from ROI and Win Rate.

## Acceptance Criteria

- [ ] User can settle pending bet as Won
- [ ] User can settle pending bet as Lost
- [ ] User can settle pending bet as Void
- [ ] Won adds stake * odds back to bankroll
- [ ] Lost does not change bankroll again
- [ ] Void refunds stake
- [ ] Bet status updates correctly
- [ ] `settled_at` is saved
- [ ] `settlement_outcome` is saved
- [ ] `pnl` is saved
- [ ] Duplicate settlement is rejected
- [ ] Duplicate settlement does not alter bankroll twice
- [ ] Dashboard Win Rate updates
- [ ] Dashboard ROI updates
- [ ] Dashboard Net Profit updates
- [ ] Pending Stake updates
- [ ] RLS/auth prevents settling another user's bet
- [ ] `npm run build` passes
- [ ] `npm run lint` passes

## Non-Scope

Not included in Sprint 3:
- auto-settlement
- bookmaker sync
- cashout
- half-won / half-lost
- live odds
- CLV / line movement
