import assert from 'node:assert/strict';
import test from 'node:test';

import type { ScannerAnalysis } from '../src/ai/scanner-model';
import {
  clearScannerDraftHandoff,
  peekScannerDraftHandoff,
  scannerAnalysisToTrackerDraft,
  setScannerDraftHandoff,
} from '../src/bets/scanner-draft-handoff';
import { validateTrackerDraft } from '../src/bets/draft';

function analysis(patch: Partial<ScannerAnalysis> = {}): ScannerAnalysis {
  return {
    bookmaker: 'Bet365',
    eventName: null,
    legs: [{ eventName: 'Arsenal — Chelsea', marketType: 'Winner', odds: 1.8, selection: 'Arsenal', sport: 'soccer' }],
    marketType: null,
    selection: null,
    sport: null,
    stake: 25,
    totalOdds: 1.8,
    ...patch,
  };
}

test('scanner result becomes a prefilled editable draft and still requires explicit validation', () => {
  const handoff = scannerAnalysisToTrackerDraft(analysis());
  assert.equal(handoff.needsReview, false);
  assert.equal(handoff.draft.source, 'scanner');
  assert.equal(handoff.draft.legs[0]?.eventName, 'Arsenal — Chelsea');

  handoff.draft.legs[0]!.eventName = 'Edited by user';
  const validation = validateTrackerDraft(handoff.draft);
  assert.equal(validation.ok, true);
  if (validation.ok) {
    assert.equal(validation.payload.legs[0]?.event_name, 'Edited by user');
    assert.equal(validation.payload.source, 'scanner');
  }
});

test('incomplete scanner result fails closed into safe empty fields with Needs review', () => {
  const handoff = scannerAnalysisToTrackerDraft(analysis({
    bookmaker: 'x'.repeat(101),
    legs: [{ eventName: 'Known event', marketType: null, odds: null, selection: null, sport: 'unrecognized' }],
    stake: -1,
  }));

  assert.equal(handoff.needsReview, true);
  assert.deepEqual(handoff.draft.legs[0], {
    eventName: 'Known event',
    id: 'scanner-leg-1',
    marketType: '',
    odds: '',
    selection: '',
    sport: 'other',
  });
  assert.equal(handoff.draft.bookmaker, '');
  assert.equal(handoff.draft.stake, '');
  assert.equal(validateTrackerDraft(handoff.draft).ok, false);
  assert.equal('rawText' in handoff.draft, false);
});

test('scanner handoff is in-memory and consumed once', () => {
  setScannerDraftHandoff(analysis());
  const handoff = peekScannerDraftHandoff();
  assert.equal(handoff?.draft.legs[0]?.selection, 'Arsenal');
  if (!handoff) return;
  clearScannerDraftHandoff(handoff);
  assert.equal(peekScannerDraftHandoff(), null);
});
