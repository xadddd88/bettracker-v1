import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginSubmit,
  createSubmitIntent,
  fingerprintPayload,
  resolveSubmit,
} from '../src/bets/submit-intent';

test('double submit is blocked and retry reuses the same key', () => {
  let generated = 0;
  const generate = () => `00000000-0000-4000-8000-00000000000${++generated}`;
  const fingerprint = fingerprintPayload({ stake: 25 });

  const first = beginSubmit(createSubmitIntent(), fingerprint, generate);
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const duplicate = beginSubmit(first.intent, fingerprint, generate);
  assert.deepEqual(duplicate, { intent: first.intent, ok: false, reason: 'in_flight' });

  const retry = beginSubmit(resolveSubmit(first.intent, 'retryable'), fingerprint, generate);
  assert.equal(retry.ok, true);
  if (!retry.ok) return;
  assert.equal(retry.key, first.key);
  assert.equal(generated, 1);
});

test('conflict locks the unchanged payload and edit creates a fresh intent', () => {
  let generated = 0;
  const generate = () => `00000000-0000-4000-8000-00000000000${++generated}`;
  const first = beginSubmit(createSubmitIntent(), fingerprintPayload({ stake: 25 }), generate);
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const conflicted = resolveSubmit(first.intent, 'conflict');
  assert.equal(beginSubmit(conflicted, fingerprintPayload({ stake: 25 }), generate).ok, false);

  const edited = beginSubmit(conflicted, fingerprintPayload({ stake: 30 }), generate);
  assert.equal(edited.ok, true);
  if (edited.ok) assert.notEqual(edited.key, first.key);
});
