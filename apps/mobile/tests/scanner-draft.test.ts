import assert from 'node:assert/strict';
import test from 'node:test';

import {
  consumeScannerDraft,
  scannerAnalysisToTrackerDraft,
  stageScannerDraft,
} from '../src/ai/scanner-draft';
import type { ScannerAnalysis } from '../src/ai/scanner-model';

const coupon: ScannerAnalysis = {
  bookmaker: 'Example Book',
  eventName: 'Flattened fallback',
  legs: [
    { eventName: 'Spain vs Argentina', marketType: 'Total goals', odds: 1.72, selection: 'Over 2.5', sport: 'soccer' },
    { eventName: 'Spain vs Argentina', marketType: 'Total corners', odds: 1.69, selection: 'Over 6.5', sport: 'soccer' },
  ],
  marketType: 'Express',
  selection: null,
  sport: 'soccer',
  stake: 25,
  totalOdds: 2.91,
};

test('scanner result becomes an editable draft without changing ordered legs', () => {
  const draft = scannerAnalysisToTrackerDraft(coupon);

  assert.ok(draft);
  assert.deepEqual(draft.legs.map((leg) => [leg.eventName, leg.marketType, leg.selection, leg.odds]), [
    ['Spain vs Argentina', 'Total goals', 'Over 2.5', '1.72'],
    ['Spain vs Argentina', 'Total corners', 'Over 6.5', '1.69'],
  ]);
  assert.equal(draft.totalOdds, '2.91');
  assert.equal(draft.stake, '25');
  assert.equal(draft.notes, '');
});

test('scanner draft conversion fails closed above the 20-leg contract', () => {
  const overflow = { ...coupon, legs: Array.from({ length: 21 }, () => coupon.legs[0]) };
  assert.equal(scannerAnalysisToTrackerDraft(overflow), null);
});

test('staged scanner draft is local, cloned and consumed once', () => {
  const draft = scannerAnalysisToTrackerDraft(coupon);
  assert.ok(draft);

  stageScannerDraft(draft);
  draft.legs[0].eventName = 'mutated after staging';

  const consumed = consumeScannerDraft();
  assert.equal(consumed?.legs[0].eventName, 'Spain vs Argentina');
  assert.equal(consumeScannerDraft(), null);
});
