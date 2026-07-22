import assert from 'node:assert/strict';
import test from 'node:test';

import type { BetDto, BetStatus } from '../src/bets/models';
import { summarizeBets } from '../src/bets/summary';

function bet(status: BetStatus, pnl: number | null): BetDto {
  return {
    betType: 'single',
    bookmaker: null,
    id: `${status}-${String(pnl)}`,
    legs: [],
    notes: null,
    placedAt: '2026-07-19T00:00:00Z',
    pnl,
    potentialPayout: null,
    settledAt: pnl === null ? null : '2026-07-19T01:00:00Z',
    source: 'manual',
    stake: 10,
    status,
    totalOdds: null,
  };
}

test('home summary uses only recorded P&L and counts pending bets', () => {
  assert.deepEqual(
    summarizeBets([bet('won', 12.5), bet('lost', -5), bet('pending', null)]),
    { netPnl: 7.5, openCount: 1, settledCount: 2 },
  );
});

test('home summary does not invent settlement values', () => {
  assert.deepEqual(
    summarizeBets([bet('pending', null), bet('unknown', null), bet('won', null), bet('push', 25)]),
    { netPnl: 0, openCount: 1, settledCount: 1 },
  );
});
