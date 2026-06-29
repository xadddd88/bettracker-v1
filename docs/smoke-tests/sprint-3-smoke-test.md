# Sprint 3 Smoke Test — Manual Settlement

## Test 1 — Won

```
1. Create/place bet: stake 100, odds 2.50
2. Confirm bankroll decreases by 100
3. Open bet detail /bets/[id]
4. Click Won
5. Confirm bankroll increases by 250
6. Confirm pnl = +150
7. Confirm status = won
8. Confirm settled_at is set
9. Try click Won again
10. Confirm duplicate settlement rejected
11. Confirm bankroll unchanged after duplicate attempt
```

Expected result: bankroll +150 net, status = won ✅

## Test 2 — Lost

```
1. Create/place bet: stake 100, odds 2.00
2. Confirm bankroll decreases by 100
3. Open bet detail /bets/[id]
4. Click Lost
5. Confirm bankroll does NOT change
6. Confirm pnl = -100
7. Confirm status = lost
8. Confirm settled_at is set
9. Try click Lost again
10. Confirm duplicate settlement rejected
```

Expected result: bankroll unchanged, status = lost ✅

## Test 3 — Void

```
1. Create/place bet: stake 100, odds 1.80
2. Confirm bankroll decreases by 100
3. Open bet detail /bets/[id]
4. Click Void
5. Confirm bankroll increases by 100 (stake returned)
6. Confirm pnl = 0
7. Confirm status = void
8. Confirm settled_at is set
9. Try click Void again
10. Confirm duplicate settlement rejected
11. Confirm bankroll unchanged after duplicate attempt
```

Expected result: bankroll net 0, status = void ✅

## Test 4 — Dashboard Metrics

After Tests 1–3:
```
Won:  stake 100, odds 2.50 → pnl +150
Lost: stake 100            → pnl -100
Void: stake 100            → pnl 0
```

Expected Dashboard:
```
Net Profit    = +50
Win Rate      = 50%   (1 won / 2 won+lost)
ROI           = +25%  (50 net / 200 won+lost stake)
Pending Stake = $0.00
```

Void excluded from Win Rate and ROI. ✅

## Test 5 — Security

```
1. Copy bet ID from User A
2. Log in as User B
3. Attempt POST /api/bets/[id]/settle with User B session
4. Confirm 404 or error: bet not found
5. Confirm bet status unchanged
6. Confirm bankroll of User A unchanged
```

Expected result: RLS blocks cross-user settlement ✅
