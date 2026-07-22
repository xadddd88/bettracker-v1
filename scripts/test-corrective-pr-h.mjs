#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(repoRoot, 'build', 'provider-smoke');
const require = createRequire(import.meta.url);
let passed = 0;

function test(name, run) {
  run();
  passed += 1;
  console.log(`  PASS  ${name}`);
}

function source(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function loadWebPerformance() {
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      return originalResolveFilename.call(this, path.join(buildDir, request.slice(2)), parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  try {
    return require(path.join(buildDir, 'lib', 'analytics', 'performance.js'));
  } finally {
    Module._resolveFilename = originalResolveFilename;
  }
}

console.log('\nPR H corrective gate:');

const webPerformance = loadWebPerformance();

test('Web By sport assigns a same-sport Express to its sport', () => {
  assert.equal(webPerformance.betSportBucket({ legs: [{ sport: 'tennis' }, { sport: 'tennis' }] }), 'tennis');
});

test('Web By sport assigns a cross-sport Express to Mixed', () => {
  assert.equal(webPerformance.betSportBucket({ legs: [{ sport: 'soccer' }, { sport: 'basketball' }] }), 'mixed');
  assert.equal(webPerformance.betSportBucket({ legs: [{ sport: null }] }), 'other');
  assert.match(source('lib/analytics/performance.ts'), /const sport = betSportBucket\(bet\)/);
});

test('native scanner continues through an in-memory draft without auto-save', () => {
  const scanner = source('apps/mobile/src/app/(app)/ai/index.tsx');
  const tracker = source('apps/mobile/src/app/(app)/bets/new.tsx');
  const handoff = source('apps/mobile/src/bets/scanner-draft-handoff.ts');

  assert.match(scanner, /Continue to Tracker/);
  assert.match(scanner, /setScannerDraftHandoff\(analysis\)/);
  assert.match(scanner, /router\.push\('\/\(app\)\/bets\/new'\)/);
  assert.doesNotMatch(scanner, /saveTrackedBet|\/api\/bets\/tracked/);
  assert.doesNotMatch(handoff, /router|params|rawText|fetch|saveTrackedBet|\/api\//);
  assert.match(tracker, /peekScannerDraftHandoff\(\)/);
  assert.match(tracker, /clearScannerDraftHandoff\(initialHandoff\)/);
  assert.match(tracker, /if \(!reviewedPayload \|\| savingRef\.current\) return/);
  assert.match(tracker, /Review bet/);
  assert.match(tracker, /Save bet/);
  assert.match(tracker, /saveTrackedBet\(reviewedPayload, begin\.key\)/);
});

test('incomplete scanner drafts are visibly review-gated and remain editable', () => {
  const tracker = source('apps/mobile/src/app/(app)/bets/new.tsx');
  const handoff = source('apps/mobile/src/bets/scanner-draft-handoff.ts');

  assert.match(tracker, /Needs review: scanner fields are incomplete/);
  assert.match(tracker, /editable=\{!disabled\}/);
  assert.match(handoff, /needsReview:/);
  assert.match(handoff, /source: 'scanner'/);
});

test('mobile P&L is gated by supported settlement status', () => {
  const models = source('apps/mobile/src/bets/models.ts');
  assert.match(models, /isSupportedSettlementStatus\(bet\.status\) && bet\.pnl !== null/);
  assert.match(models, /return \{ label: 'P&L', value: '—' \}/);
});

test('sign-in SafeAreaView comes from safe-area-context with top and side edges', () => {
  const signIn = source('apps/mobile/src/app/sign-in.tsx');
  assert.match(signIn, /import \{ SafeAreaView \} from 'react-native-safe-area-context'/);
  assert.match(signIn, /<SafeAreaView edges=\{\['top', 'left', 'right'\]\}/);
});

console.log(`\n${passed} corrective checks passed\n`);
