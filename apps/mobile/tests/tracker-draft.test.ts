import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeDraftExpressOdds,
  emptyTrackerLeg,
  MAX_DRAFT_LEGS,
  parseDraftDecimal,
  type TrackerDraft,
  validateTrackerDraft,
} from '../src/bets/draft';

function validSingle(): TrackerDraft {
  return {
    bookmaker: '',
    legs: [
      {
        ...emptyTrackerLeg('leg-1'),
        eventName: 'Arsenal — Chelsea',
        marketType: 'Match result',
        odds: '1.85',
        selection: 'Arsenal',
      },
    ],
    notes: '',
    stake: '25',
    totalOdds: '',
  };
}

test('draft decimal parser is strict and accepts dot or comma', () => {
  assert.equal(parseDraftDecimal('1.85'), 1.85);
  assert.equal(parseDraftDecimal(' 2,40 '), 2.4);
  assert.equal(parseDraftDecimal(''), null);
  assert.equal(parseDraftDecimal('1.2.3'), null);
  assert.equal(parseDraftDecimal('NaN'), null);
  assert.equal(parseDraftDecimal('2x'), null);
});

test('manual Single validates with total odds derived from its leg', () => {
  const result = validateTrackerDraft(validSingle());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.payload.source, 'manual');
  assert.equal(result.payload.total_odds, null);
  assert.equal(result.payload.legs.length, 1);
  assert.equal(result.payload.legs[0]?.odds, 1.85);
});

test('empty selection, bookmaker, and notes normalize to null', () => {
  const draft = validSingle();
  draft.legs[0]!.selection = '   ';
  draft.bookmaker = '   ';
  draft.notes = '';
  const result = validateTrackerDraft(draft);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.payload.legs[0]?.selection, null);
  assert.equal(result.payload.bookmaker, null);
  assert.equal(result.payload.notes, null);
});

test('Express requires a separately entered total', () => {
  const draft = validSingle();
  draft.legs.push({
    ...emptyTrackerLeg('leg-2', 'tennis'),
    eventName: 'Player A — Player B',
    marketType: 'Total games',
    odds: '2.10',
    selection: 'Over 22.5',
  });

  const missing = validateTrackerDraft(draft);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.ok(missing.issues.some((issue) => issue.field === 'totalOdds'));

  draft.totalOdds = '3.75';
  const valid = validateTrackerDraft(draft);
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.payload.total_odds, 3.75);
});

test('20 legs pass and preserve editor order', () => {
  const draft = validSingle();
  draft.legs = Array.from({ length: MAX_DRAFT_LEGS }, (_, index) => ({
    ...emptyTrackerLeg(`leg-${index + 1}`, index % 2 === 0 ? 'soccer' : 'tennis'),
    eventName: `Event ${index + 1}`,
    marketType: `Market ${index + 1}`,
    odds: '1.10',
  }));
  draft.totalOdds = '6.73';

  const result = validateTrackerDraft(draft);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.legs.length, 20);
  assert.deepEqual(
    result.payload.legs.map((leg) => leg.event_name),
    Array.from({ length: 20 }, (_, index) => `Event ${index + 1}`),
  );
});

test('21 legs fail closed', () => {
  const draft = validSingle();
  draft.legs = Array.from({ length: MAX_DRAFT_LEGS + 1 }, (_, index) => ({
    ...emptyTrackerLeg(`leg-${index + 1}`),
    eventName: `Event ${index + 1}`,
    marketType: 'Winner',
    odds: '1.20',
  }));
  draft.totalOdds = '10';

  const result = validateTrackerDraft(draft);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((issue) => issue.field === 'legs'));
});

test('invalid odds and stake fail before a payload exists', () => {
  const draft = validSingle();
  draft.legs[0]!.odds = '1';
  draft.stake = '-5';

  const result = validateTrackerDraft(draft);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => issue.field === 'legs.0.odds'));
    assert.ok(result.issues.some((issue) => issue.field === 'stake'));
  }
});

test('Express preview multiplies only complete valid leg odds', () => {
  const first = { ...emptyTrackerLeg('leg-1'), odds: '1.5' };
  const second = { ...emptyTrackerLeg('leg-2'), odds: '2.25' };
  assert.equal(computeDraftExpressOdds([first]), null);
  assert.equal(computeDraftExpressOdds([first, second]), 3.375);
  second.odds = '';
  assert.equal(computeDraftExpressOdds([first, second]), null);
});
