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
  for (const label of ['HOME', 'SCAN', 'TRACKER']) {
    assert.match(tabs, new RegExp(`screen\\(['"]${label}['"]\\)`));
  }
  for (const route of ['stats', 'more']) {
    assert.match(tabs, new RegExp(`name=["']${route}["'][\\s\\S]*?href:\\s*null`));
  }
  assert.match(tabs, /tabBarHideOnKeyboard:\s*true/);
  assert.match(tabs, /tabBarActiveBackgroundColor:\s*semanticColors\.signal/);
  assert.match(tabs, /tabBarActiveTintColor:\s*semanticColors\.onSignal/);
  assert.match(tabs, /Platform\.OS === 'android' \? 48 : 44/);
  assert.doesNotMatch(tabs, /useSafeAreaInsets/);
  assert.match(tracker, /import \{ Stack \} from 'expo-router'/);
  assert.match(tracker, /name="\[id\]"/);
  assert.match(tracker, /name="new"/);
});

test('Broadcast Noir native shell keeps stable identity and opts into predictive Back', () => {
  const config = JSON.parse(source('app.json')) as {
    expo: {
      android: { package: string; predictiveBackGestureEnabled: boolean };
      ios: { bundleIdentifier: string };
      name: string;
      scheme: string;
      slug: string;
    };
  };

  assert.equal(config.expo.name, 'BetTracker');
  assert.equal(config.expo.android.predictiveBackGestureEnabled, true);
  assert.equal(config.expo.slug, 'xaddd');
  assert.equal(config.expo.scheme, 'xaddd');
  assert.equal(config.expo.ios.bundleIdentifier, 'com.dmitriykhodakivskyi.xaddd');
  assert.equal(config.expo.android.package, 'com.dmitriykhodakivskyi.xaddd');
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

test('daily Home uses the read model and exposes trusted Adaptive Action', () => {
  const home = source('src/app/(app)/home.tsx');
  const data = source('src/bets/data.ts');

  assert.match(home, /fetchBets\(userId\)/);
  assert.match(home, /fetchBankroll\(userId\)/);
  assert.match(home, /ONE USEFUL ACTION/);
  assert.match(home, /ADAPTIVE ACTION/);
  assert.match(home, /Review pending bets/);
  assert.match(home, /Scan coupon/);
  assert.match(home, /RECENT BETS/);
  assert.doesNotMatch(home, /LIVE DATA|EventPulse|watchlist|Scout for new value/);
  assert.match(home, /semanticColors\.signal/);
  assert.match(home, /ReduceMotion\.System/);
  assert.match(data, /select\(['"]balance, currency['"]\)/);
  assert.doesNotMatch(data, /select\s*\(\s*['"`]\s*\*/);
});

test('legacy editorial motion remains isolated from the migrated Home', () => {
  const backdrop = source('src/ui/time-warp.tsx');
  const motion = source('src/ui/motion.tsx');
  const ticket = source('src/ui/bet-ticket.tsx');
  const tabs = source('src/app/(app)/_layout.tsx');
  const trackerStack = source('src/app/(app)/bets/_layout.tsx');

  assert.match(backdrop, /EditorialBackdrop/);
  assert.match(backdrop, /KineticType/);
  assert.match(backdrop, /EditorialRule/);
  assert.match(backdrop, /#E8FF00/);
  assert.match(backdrop, /withRepeat/);
  assert.match(backdrop, /useReducedMotion/);
  assert.match(backdrop, /cancelAnimation/);
  assert.match(motion, /withSpring/);
  assert.match(motion, /useReducedMotion/);
  assert.match(tabs, /animation:\s*['"]shift['"]/);
  assert.match(trackerStack, /animation:\s*['"]slide_from_right['"]/);
  assert.match(ticket, /EXPRESS/);
  assert.match(ticket, /totalOdds\?\.toFixed\(2\)/);
  assert.doesNotMatch(source('src/app/(app)/home.tsx'), /(?:EditorialBackdrop|TimeWarpBackdrop|KineticType)/);

  for (const path of [
    'src/app/(app)/ai/index.tsx',
    'src/app/(app)/bets/index.tsx',
    'src/app/(app)/bets/new.tsx',
    'src/app/(app)/bets/[id].tsx',
  ]) {
    assert.match(source(path), /(?:EditorialBackdrop|TimeWarpBackdrop)/);
  }
});
