import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

type CaptureLockModule = {
  runWithCaptureLock<T>(
    lock: { current: boolean },
    operation: () => Promise<T>,
  ): Promise<T | undefined>;
};

test('two simultaneous capture requests launch the picker exactly once', async () => {
  const modulePath = join(process.cwd(), 'src/ai/capture-lock.ts');
  assert.ok(existsSync(modulePath), 'capture lock module must exist');

  const { runWithCaptureLock } = (await import(
    pathToFileURL(modulePath).href
  )) as CaptureLockModule;
  const lock = { current: false };
  let launches = 0;
  let releasePicker: ((value: string) => void) | undefined;

  const launchPicker = () => {
    launches += 1;
    return new Promise<string>((resolve) => {
      releasePicker = resolve;
    });
  };

  const first = runWithCaptureLock(lock, launchPicker);
  const second = runWithCaptureLock(lock, launchPicker);

  assert.equal(launches, 1);
  assert.equal(lock.current, true);
  assert.equal(await second, undefined);

  assert.ok(releasePicker, 'first picker request must be pending');
  releasePicker('ready');

  assert.equal(await first, 'ready');
  assert.equal(lock.current, false);
});

test('capture lock is released when the picker operation fails', async () => {
  const modulePath = join(process.cwd(), 'src/ai/capture-lock.ts');
  assert.ok(existsSync(modulePath), 'capture lock module must exist');

  const { runWithCaptureLock } = (await import(
    pathToFileURL(modulePath).href
  )) as CaptureLockModule;
  const lock = { current: false };

  await assert.rejects(
    runWithCaptureLock(lock, async () => {
      throw new Error('picker failed');
    }),
    /picker failed/,
  );

  assert.equal(lock.current, false);
});
