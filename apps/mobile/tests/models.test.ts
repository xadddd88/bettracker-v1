import assert from 'node:assert/strict';
import test from 'node:test';

import { couponPresentation, currencySymbol, mapBetRow, resolveBetStatus } from '../src/bets/models';
import { sanitizeAuthError, shouldRefreshForAppState } from '../src/auth/policy';
import { readErrorMessage, sanitizeReadError } from '../src/bets/errors';

test('maps nullable selection and orders Express legs by leg_index', () => {
  const bet = mapBetRow({
    bet_type: 'parlay',
    id: 'bet-1',
    placed_at: '2026-07-17T00:00:00Z',
    stake: '25.00',
    status: 'pending',
    total_odds: '4.5',
    legs: [
      { event_name: 'Third', id: '3', leg_index: 3, odds: '1.5', selection: '' },
      { event_name: 'First', id: '1', leg_index: 1, odds: 2, selection: null },
      { event_name: 'Second', id: '2', leg_index: 2, odds: 1.5, selection: 'Home' },
    ],
  });

  assert.deepEqual(bet.legs.map((leg) => leg.eventName), ['First', 'Second', 'Third']);
  assert.equal(bet.legs[0].selection, null);
  assert.equal(bet.stake, 25);
  assert.equal(bet.totalOdds, 4.5);
});

test('unknown statuses do not masquerade as a settlement outcome', () => {
  assert.equal(resolveBetStatus('unexpected'), 'unknown');
  assert.equal(resolveBetStatus('won'), 'won');
});

test('presents ordered relational Express legs without changing their odds', () => {
  const bet = mapBetRow({
    bet_type: 'parlay', id: 'bet-express', placed_at: '2026-07-17T00:00:00Z',
    stake: 10, status: 'pending', total_odds: 3,
    legs: [
      { event_name: 'Second event', id: '2', leg_index: 2, odds: 1.5, selection: 'Away' },
      { event_name: 'First event', id: '1', leg_index: 1, odds: 2, selection: 'Home' },
    ],
  });

  const coupon = couponPresentation(bet);
  assert.equal(coupon.label, 'Express · 2 legs');
  assert.equal(coupon.isLegacy, false);
  assert.deepEqual(coupon.legs.map((leg) => [leg.index, leg.eventName, leg.odds]), [
    [1, 'First event', 2], [2, 'Second event', 1.5],
  ]);
});

test('splits a legacy Express only when count, events and selections agree', () => {
  const bet = mapBetRow({
    bet_type: 'single', id: 'legacy', placed_at: '2026-06-29T00:00:00Z',
    stake: 1000, status: 'pending', total_odds: 4.11,
    legs: [{
      event_name: 'Event A + Event B + Event C + Event D', id: 'legacy-leg', odds: 4.11,
      market_type: 'Експрес (4 ноги)', selection: 'Pick A + Pick B + Pick C + Pick D',
    }],
  });

  const coupon = couponPresentation(bet);
  assert.equal(coupon.label, 'Express · 4 legs');
  assert.equal(coupon.isLegacy, true);
  assert.deepEqual(coupon.legs.map((leg) => [leg.eventName, leg.selection, leg.odds]), [
    ['Event A', 'Pick A', null], ['Event B', 'Pick B', null],
    ['Event C', 'Pick C', null], ['Event D', 'Pick D', null],
  ]);
});

test('fails closed when a legacy Express cannot be split unambiguously', () => {
  const bet = mapBetRow({
    bet_type: 'single', id: 'ambiguous', placed_at: '2026-06-29T00:00:00Z',
    stake: 10, status: 'pending', total_odds: 2,
    legs: [{
      event_name: 'Event A + Event B + Event C + Event D', id: 'legacy-leg', odds: 2,
      market_type: 'Експрес (4 ноги)', selection: 'Combined selection',
    }],
  });

  const coupon = couponPresentation(bet);
  assert.equal(coupon.label, 'Legacy Express');
  assert.equal(coupon.isLegacy, true);
  assert.equal(coupon.legs.length, 1);
  assert.equal(coupon.legs[0].eventName, 'Event A + Event B + Event C + Event D');
});

test('formats supported and fallback currencies', () => {
  assert.equal(currencySymbol('UAH'), '₴');
  assert.equal(currencySymbol('GBP'), '£');
  assert.equal(currencySymbol('JPY'), 'JPY ');
});

test('auth and read errors are sanitized', () => {
  assert.equal(sanitizeAuthError('Invalid login credentials'), 'Email or password is incorrect.');
  assert.equal(sanitizeAuthError('postgres secret raw detail'), 'Sign in failed. Please try again.');
  assert.equal(readErrorMessage(sanitizeReadError('Failed to fetch')), 'Could not connect. Check your internet connection.');
  assert.equal(readErrorMessage(new Error('STUB-RAW-DB-SECRET')), 'Could not load your bets. Please try again.');
});

test('refresh policy only runs while the app is active', () => {
  assert.equal(shouldRefreshForAppState('active'), true);
  assert.equal(shouldRefreshForAppState('background'), false);
  assert.equal(shouldRefreshForAppState('inactive'), false);
});
