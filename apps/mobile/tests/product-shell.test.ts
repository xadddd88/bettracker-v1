import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

test('product shell exposes three focused sections with Tracker as a nested Stack', () => {
  const tabs = source('src/app/(app)/_layout.tsx');
  const tracker = source('src/app/(app)/bets/_layout.tsx');

  assert.match(tabs, /import \{ Tabs \} from 'expo-router'/);
  for (const route of ['home', 'ai', 'bets']) {
    assert.match(tabs, new RegExp(`name=["']${route}["']`));
  }
  for (const label of ['Home', 'Scan', 'Tracker']) {
    assert.match(tabs, new RegExp(`title:\\s*["']${label}["']`));
  }
  for (const route of ['stats', 'more']) {
    assert.match(tabs, new RegExp(`name=["']${route}["'][\\s\\S]*?href:\\s*null`));
  }
  assert.match(tabs, /tabBarHideOnKeyboard:\s*true/);
  assert.match(tabs, /useSafeAreaInsets\(\)/);
  assert.match(tabs, /paddingBottom:\s*Math\.max\(insets\.bottom,\s*6\)/);
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

test('support routes remain available outside the focused tab bar', () => {
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

test('daily Home uses the read model and does not expose roadmap labels', () => {
  const home = source('src/app/(app)/home.tsx');
  const data = source('src/bets/data.ts');

  assert.match(home, /fetchBets\(userId\)/);
  assert.match(home, /fetchBankroll\(userId\)/);
  assert.match(home, /Overview/);
  assert.match(home, /Recent bets/);
  assert.doesNotMatch(home, /Founder build|CORE WORKFLOW|LOCAL REVIEW|READY|NEXT|LATER/);
  assert.match(data, /select\(['"]balance, currency['"]\)/);
  assert.doesNotMatch(data, /select\s*\(\s*['"`]\s*\*/);
});

test('Time Warp visual system is shared by daily mobile surfaces', () => {
  const backdrop = source('src/ui/time-warp.tsx');
  const motion = source('src/ui/motion.tsx');
  const ticket = source('src/ui/bet-ticket.tsx');
  const tabs = source('src/app/(app)/_layout.tsx');
  const trackerStack = source('src/app/(app)/bets/_layout.tsx');

  assert.match(backdrop, /TimeWarpBackdrop/);
  assert.match(backdrop, /WarpRail/);
  assert.match(backdrop, /colors\.magenta/);
  assert.match(backdrop, /colors\.ultraviolet/);
  assert.match(backdrop, /withRepeat/);
  assert.match(backdrop, /useReducedMotion/);
  assert.match(backdrop, /cancelAnimation/);
  assert.match(motion, /withSpring/);
  assert.match(motion, /withRepeat/);
  assert.match(motion, /useReducedMotion/);
  assert.match(tabs, /animation:\s*['"]fade['"]/);
  assert.match(trackerStack, /animation:\s*['"]slide_from_right['"]/);
  assert.match(ticket, /EXPRESS/);
  assert.match(ticket, /leg\.odds\.toFixed\(2\)/);

  for (const path of [
    'src/app/(app)/home.tsx',
    'src/app/(app)/ai/index.tsx',
    'src/app/(app)/bets/index.tsx',
    'src/app/(app)/bets/new.tsx',
    'src/app/(app)/bets/[id].tsx',
  ]) {
    assert.match(source(path), /TimeWarpBackdrop/);
  }
});
