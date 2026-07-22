import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveHomeAction } from '../src/home/adaptive-action';

test('saved draft takes priority only when the app reports one', () => {
  assert.equal(resolveHomeAction({ draftAvailable: true, pendingCount: 3 }).kind, 'continue_draft');
});

test('pending records are reviewed before a new scan', () => {
  assert.deepEqual(resolveHomeAction({ draftAvailable: false, pendingCount: 2 }), {
    detail: 'Confirm only outcomes you know. Unresolved records remain untouched.',
    href: '/(app)/bets',
    kind: 'review_pending',
    label: 'Review 2 pending bets',
    meta: '2 records need attention',
  });
});

test('scan is the safe default when there is no persisted draft or pending record', () => {
  assert.equal(resolveHomeAction({ draftAvailable: false, pendingCount: 0 }).kind, 'scan_coupon');
});
