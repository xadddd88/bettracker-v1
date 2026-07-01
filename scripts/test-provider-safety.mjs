#!/usr/bin/env node
/**
 * Safety/validation checks for the M1.2.a provider adapters
 * (lib/providers/*). Run against the compiled output in
 * build/provider-smoke/ (see tsconfig.scripts.json) so this exercises the
 * real TypeScript logic, not a duplicated re-implementation.
 *
 * Covers: URL redaction, provider error sanitization, missing-env
 * reporting, no NEXT_PUBLIC provider keys, and that the not-yet-implemented
 * sync methods never make a network call.
 *
 * Run:  npm run test:provider-safety   (builds then runs this)
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(__dirname, '..');
const buildDir = path.join(repoRoot, 'build', 'provider-smoke');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${name}`);
    console.error(`      ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${name}`);
    console.error(`      ${err.message}`);
    failed++;
  }
}

// Runs `node -e <script>` in a fresh process with the given env vars, so
// lib/env.ts's module-level `cached` value can never leak between cases.
function runInFreshProcess(script, env) {
  return execFileSync(process.execPath, ['-e', script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

console.log('\nProvider adapter safety checks (M1.2.a)\n');

// ── 1. redactUrl — case-insensitive secret param redaction ──────────────
test('redactUrl redacts APIkey (mixed case, api-tennis.com)', () => {
  const { redactUrl } = require(path.join(buildDir, 'lib/providers/errors.js'));
  const out = redactUrl('https://api.api-tennis.com/tennis/?method=get_events&APIkey=SUPERSECRET');
  assert.ok(!out.includes('SUPERSECRET'), `leaked secret: ${out}`);
  assert.ok(out.includes('APIkey=REDACTED'), `did not redact: ${out}`);
});

test('redactUrl redacts lowercase api_token/apikey/key/token', () => {
  const { redactUrl } = require(path.join(buildDir, 'lib/providers/errors.js'));
  for (const param of ['api_token', 'apikey', 'api_key', 'token', 'key']) {
    const out = redactUrl(`https://example.com/x?${param}=SECRETVALUE&sport=football`);
    assert.ok(!out.includes('SECRETVALUE'), `${param} leaked: ${out}`);
    assert.ok(out.includes('sport=football'), `non-secret param dropped: ${out}`);
  }
});

test('redactUrl leaves non-secret query params untouched', () => {
  const { redactUrl } = require(path.join(buildDir, 'lib/providers/errors.js'));
  const out = redactUrl('https://example.com/x?dateFrom=2026-07-01&dateTo=2026-07-02');
  assert.equal(out, 'https://example.com/x?dateFrom=2026-07-01&dateTo=2026-07-02');
});

test('redactUrl falls back safely on an unparseable URL', () => {
  const { redactUrl } = require(path.join(buildDir, 'lib/providers/errors.js'));
  assert.equal(redactUrl('not a url'), '[unparseable_url]');
});

// ── 2. sanitizeProviderError — never surfaces the raw secret ─────────────
test('sanitizeProviderError message contains REDACTED, not the raw token', () => {
  const { sanitizeProviderError } = require(path.join(buildDir, 'lib/providers/errors.js'));
  const err = sanitizeProviderError(
    'sportmonks',
    'auth',
    401,
    'https://api.sportmonks.com/v3/football/leagues?api_token=SUPERSECRET'
  );
  assert.ok(!err.message.includes('SUPERSECRET'), `leaked secret: ${err.message}`);
  assert.ok(err.message.includes('REDACTED'));
  assert.equal(err.provider, 'sportmonks');
  assert.equal(err.kind, 'auth');
  assert.equal(err.httpStatus, 401);
});

test('SportMonks pingSmoke URL shape cannot leak SPORTMONKS_TOKEN through ProviderError', () => {
  const { sanitizeProviderError } = require(path.join(buildDir, 'lib/providers/errors.js'));
  // Mirrors exactly what SportMonksAdapter.pingSmoke() builds.
  const url = new URL('https://api.sportmonks.com/v3/football/leagues');
  url.searchParams.set('per_page', '1');
  url.searchParams.set('api_token', 'REAL_SPORTMONKS_TOKEN_VALUE');
  const err = sanitizeProviderError('sportmonks', 'auth', 401, url.toString());
  assert.ok(!err.message.includes('REAL_SPORTMONKS_TOKEN_VALUE'), `leaked token: ${err.message}`);
  assert.ok(err.message.includes('api_token=REDACTED'), `did not redact api_token: ${err.message}`);
  assert.ok(err.message.includes('per_page=1'), `non-secret param dropped: ${err.message}`);
});

// ── 3. Missing-env reporting names exactly the absent vars ───────────────
test('findMissingEnvNames lists all three when none are set', () => {
  const out = runInFreshProcess(
    `
    delete process.env.API_FOOTBALL_KEY;
    delete process.env.SPORTMONKS_TOKEN;
    delete process.env.API_TENNIS_KEY;
    const { findMissingEnvNames } = require(${JSON.stringify(path.join(buildDir, 'lib/providers/smoke.js'))});
    console.log(JSON.stringify(findMissingEnvNames()));
    `,
    { API_FOOTBALL_KEY: '', SPORTMONKS_TOKEN: '', API_TENNIS_KEY: '' }
  );
  const names = JSON.parse(out.trim().split('\n').pop());
  assert.deepEqual(names.sort(), ['API_FOOTBALL_KEY', 'API_TENNIS_KEY', 'SPORTMONKS_TOKEN']);
});

test('findMissingEnvNames lists only the one absent var', () => {
  const out = runInFreshProcess(
    `
    delete process.env.SPORTMONKS_TOKEN;
    const { findMissingEnvNames } = require(${JSON.stringify(path.join(buildDir, 'lib/providers/smoke.js'))});
    console.log(JSON.stringify(findMissingEnvNames()));
    `,
    { API_FOOTBALL_KEY: 'dummy', API_TENNIS_KEY: 'dummy' }
  );
  const names = JSON.parse(out.trim().split('\n').pop());
  assert.deepEqual(names, ['SPORTMONKS_TOKEN']);
});

test('runProviderSmoke() skips (ranSmoke=false) and never touches the network when env is missing', () => {
  const out = runInFreshProcess(
    `
    delete process.env.API_FOOTBALL_KEY;
    delete process.env.SPORTMONKS_TOKEN;
    delete process.env.API_TENNIS_KEY;
    const { runProviderSmoke } = require(${JSON.stringify(path.join(buildDir, 'lib/providers/smoke.js'))});
    runProviderSmoke().then(r => console.log(JSON.stringify(r)));
    `,
    { API_FOOTBALL_KEY: '', SPORTMONKS_TOKEN: '', API_TENNIS_KEY: '' }
  );
  const report = JSON.parse(out.trim().split('\n').pop());
  assert.equal(report.ranSmoke, false);
  assert.deepEqual(report.results, []);
  assert.deepEqual(report.missingEnv.sort(), ['API_FOOTBALL_KEY', 'API_TENNIS_KEY', 'SPORTMONKS_TOKEN']);
});

// ── 4. No NEXT_PUBLIC provider keys anywhere in lib/providers ────────────
test('no NEXT_PUBLIC provider env vars referenced in lib/providers', () => {
  const providersDir = path.join(repoRoot, 'lib', 'providers');
  const offenders = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (full.endsWith('.ts')) {
        const content = readFileSync(full, 'utf8');
        if (content.includes('NEXT_PUBLIC')) offenders.push(full);
      }
    }
  })(providersDir);
  assert.deepEqual(offenders, [], `NEXT_PUBLIC referenced in: ${offenders.join(', ')}`);
});

// ── 5. Not-yet-implemented sync methods never make a network call ────────
await testAsync('fetchFixtures/fetchOdds/fetchResults/fetchEnrichment reject instantly, no network', async () => {
  const { ApiFootballAdapter } = require(path.join(buildDir, 'lib/providers/adapters/api-football.js'));
  const { SportMonksAdapter } = require(path.join(buildDir, 'lib/providers/adapters/sportmonks.js'));
  const { ApiTennisAdapter } = require(path.join(buildDir, 'lib/providers/adapters/api-tennis.js'));

  const calls = [
    () => new ApiFootballAdapter().fetchFixtures({ dateFrom: '2026-07-01', dateTo: '2026-07-02' }),
    () => new ApiFootballAdapter().fetchOdds({ providerFixtureIds: ['1'] }),
    () => new ApiFootballAdapter().fetchResults({ providerFixtureIds: ['1'] }),
    () => new ApiTennisAdapter().fetchFixtures({ dateFrom: '2026-07-01', dateTo: '2026-07-02' }),
    () => new ApiTennisAdapter().fetchOdds({ providerFixtureIds: ['1'] }),
    () => new ApiTennisAdapter().fetchResults({ providerFixtureIds: ['1'] }),
    () => new SportMonksAdapter().fetchEnrichment({ providerFixtureId: '1' }),
  ];

  for (const call of calls) {
    const start = Date.now();
    await assert.rejects(call(), /scaffold/, 'expected scaffold-only rejection');
    const elapsed = Date.now() - start;
    // A real network call would take much longer than this even to fail
    // fast (DNS + TLS); scaffold throws must be effectively instant.
    assert.ok(elapsed < 200, `took ${elapsed}ms — looks like a real network call`);
  }
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
