# Sprint 2 Smoke Test — Decision Intelligence

Status: Passed ✅

## Test 1 — Watch Flow

```
1. Open /ai
2. Select sport: Soccer
3. Enter event, market, odds
4. Click Analyze
5. Verify analysis card appears
6. Verify decision created immediately (check /decisions)
7. Click Watch
8. Verify status saved as watchlisted
```

Result: Passed ✅

## Test 2 — Skip Flow

```
1. Open /ai
2. Enter any event details
3. Click Analyze
4. Click Skip
5. Verify decision saved as skipped
6. Verify no bet created
```

Result: Passed ✅

## Test 3 — Place Bet Flow

```
1. Open /ai
2. Enter event details with odds
3. Click Analyze
4. Click Place Bet
5. Enter stake amount
6. Click Confirm
7. Verify bet created and linked to decision
8. Verify bankroll balance decreases by stake
9. Verify bet appears on /bets
```

Result: Passed ✅

## Test 4 — Scanner Express Flow

```
1. Open /ai
2. Paste or upload express/parlay coupon screenshot
3. Verify scanner parses multi-leg coupon
4. Verify event_name contains all legs joined with " + "
5. Verify combined odds populated
6. Verify sport mapped to canonical SportCode
```

Result: Passed ✅

## Test 5 — Decision Detail Page

```
1. Open /decisions/[id]
2. Verify AI analysis displayed (probability, edge, factors)
3. Verify Place/Watch/Skip actions available if pending
4. Verify actions hidden after decision made
```

Result: Passed ✅
