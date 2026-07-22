import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateMobilePerformance } from '../src/bets/performance';
import type { BetDto, BetStatus } from '../src/bets/models';

function bet(status: BetStatus, stake: number, pnl: number | null, sport = 'soccer', odds = 2): BetDto {
  return {
    betType: 'single',
    bookmaker: null,
    id: `${status}-${sport}-${stake}-${pnl}`,
    legs: [{ eventName: 'A — B', id: `leg-${status}-${sport}`, legIndex: 1, marketType: 'Winner', odds, selection: 'A', sport, status: 'pending' }],
    notes: null,
    placedAt: '2026-07-22T00:00:00Z',
    pnl,
    potentialPayout: null,
    settledAt: status === 'pending' ? null : '2026-07-22T01:00:00Z',
    source: 'manual',
    stake,
    status,
    totalOdds: odds,
  };
}

test('mobile performance mirrors Decision #058 settlement eligibility', () => {
  const metrics = calculateMobilePerformance([
    bet('won', 10, 10, 'soccer', 2),
    bet('lost', 20, -20, 'soccer', 3),
    bet('void', 30, 0, 'tennis', 4),
    bet('pending', 40, null, 'tennis', 5),
    bet('push', 50, 100, 'cs2', 6),
    bet('partial', 60, 100, 'cs2', 7),
    bet('unknown', 70, 100, 'other', 8),
  ]);

  assert.equal(metrics.won, 1);
  assert.equal(metrics.lost, 1);
  assert.equal(metrics.void, 1);
  assert.equal(metrics.settled, 3);
  assert.equal(metrics.winRate, 50);
  assert.equal(metrics.netPnl, -10);
  assert.equal(metrics.roi, (-10 / 30) * 100);
  assert.equal(metrics.pendingStake, 40);
  assert.equal(metrics.avgOdds, 2.5);
  assert.equal(metrics.unsupported, 3);
});

test('empty and unsupported-only samples never invent zero percentages', () => {
  const empty = calculateMobilePerformance([]);
  assert.equal(empty.winRate, null);
  assert.equal(empty.roi, null);
  assert.equal(empty.avgOdds, null);

  const unsupported = calculateMobilePerformance([bet('push', 10, 20)]);
  assert.equal(unsupported.netPnl, 0);
  assert.equal(unsupported.settled, 0);
  assert.equal(unsupported.roi, null);
});
