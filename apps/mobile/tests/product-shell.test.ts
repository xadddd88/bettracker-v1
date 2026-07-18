import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

test('product shell exposes five persistent sections with Tracker as a nested Stack', () => {
  const tabs = source('src/app/(app)/_layout.tsx');
  const tracker = source('src/app/(app)/bets/_layout.tsx');

  assert.match(tabs, /import \{ Tabs \} from 'expo-router'/);
  for (const route of ['home', 'ai', 'bets', 'stats', 'more']) {
    assert.match(tabs, new RegExp(`name=["']${route}["']`));
  }
  for (const label of ['Home', 'AI', 'Tracker', 'Stats', 'More']) {
    assert.match(tabs, new RegExp(`title:\\s*["']${label}["']`));
  }
  assert.match(tabs, /tabBarHideOnKeyboard:\s*true/);
  assert.match(tracker, /import \{ Stack \} from 'expo-router'/);
  assert.match(tracker, /name="\[id\]"/);
  assert.match(tracker, /name="new"/);
});

test('Phase 1B AI route is preserved without a colliding placeholder', () => {
  assert.equal(existsSync(join(root, 'src/app/(app)/ai/index.tsx')), true);
  assert.equal(existsSync(join(root, 'src/app/(app)/ai.tsx')), false);
});

test('local tracker editor cannot perform network or financial writes', () => {
  const editor = source('src/app/(app)/bets/new.tsx');
  const draft = source('src/bets/draft.ts');
  const combined = `${editor}\n${draft}`;

  for (const forbidden of [
    /\bfetch\s*\(/,
    /\baxios\b/i,
    /\bsupabase\b/i,
    /\.rpc\s*\(/,
    /create_tracked_bet/,
    /idempotency/i,
    /service[_-]?role/i,
    /\/api\//,
  ]) {
    assert.doesNotMatch(combined, forbidden);
  }

  assert.match(editor, /Bet is valid\. Secure saving will be enabled in the next phase\./);
  assert.match(editor, /Review bet/);
});

test('all Phase 1C routes and the product shell component exist', () => {
  for (const path of [
    'src/app/(app)/home.tsx',
    'src/app/(app)/stats.tsx',
    'src/app/(app)/more.tsx',
    'src/app/(app)/bets/new.tsx',
    'src/ui/product-shell.tsx',
  ]) {
    assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
  }
});
