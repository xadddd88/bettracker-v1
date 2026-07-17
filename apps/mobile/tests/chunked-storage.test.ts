import assert from 'node:assert/strict';
import test from 'node:test';

import { createChunkedStorage, splitSecureValue, type KeyValueBackend } from '../src/auth/chunked-storage';

function memoryBackend() {
  const values = new Map<string, string>();
  const backend: KeyValueBackend = {
    async deleteItemAsync(key) { values.delete(key); },
    async getItemAsync(key) { return values.get(key) ?? null; },
    async setItemAsync(key, value) { values.set(key, value); },
  };
  return { backend, values };
}

test('splits values below the SecureStore per-value safety threshold', () => {
  assert.deepEqual(splitSecureValue('abcdef', 2), ['ab', 'cd', 'ef']);
});

test('round-trips a large session and replaces it atomically by slot', async () => {
  const { backend, values } = memoryBackend();
  const storage = createChunkedStorage(backend);
  const first = JSON.stringify({ access_token: 'a'.repeat(5_000) });
  const second = JSON.stringify({ access_token: 'b'.repeat(4_000) });

  await storage.setItem('session', first);
  assert.equal(await storage.getItem('session'), first);
  assert.equal(values.get('session.active'), '0');

  await storage.setItem('session', second);
  assert.equal(await storage.getItem('session'), second);
  assert.equal(values.get('session.active'), '1');
  assert.equal([...values.keys()].some((key) => key.startsWith('session.slot.0')), false);
});

test('removes both storage slots and fails closed on an incomplete session', async () => {
  const { backend, values } = memoryBackend();
  const storage = createChunkedStorage(backend);
  await storage.setItem('session', 'large-session');
  values.delete('session.slot.0.0');
  assert.equal(await storage.getItem('session'), null);
  await storage.removeItem('session');
  assert.equal(values.size, 0);
});
