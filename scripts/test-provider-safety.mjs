#!/usr/bin/env node
/**
 * Safety/validation checks for the M1.2.b provider adapters and fixture sync
 * service. Run against the compiled output in build/provider-smoke/ (see
 * tsconfig.scripts.json) so this exercises the real TypeScript logic, not a
 * duplicated re-implementation.
 *
 * Covers: URL redaction, provider error sanitization, missing-env reporting,
 * no NEXT_PUBLIC provider keys, fixture-fetch parsing through stubbed network
 * responses, dry-run no-write behavior, and non-fixture methods staying out of
 * scope.
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
const tennisAuthParam = ['API', 'key'].join('');

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

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function footballPayload() {
  return {
    errors: [],
    response: [
      {
        fixture: {
          id: 12345,
          date: '2026-07-01T18:00:00+00:00',
          timezone: 'UTC',
          venue: { name: 'Test Stadium', city: 'London' },
          status: { short: 'NS', long: 'Not Started' },
        },
        league: {
          id: 39,
          name: 'English Premier League',
          country: 'England',
          season: 2026,
          round: 'Regular Season - 1',
        },
        teams: {
          home: { id: 33, name: 'Manchester United' },
          away: { id: 40, name: 'Liverpool' },
        },
      },
    ],
  };
}

function tennisPayload() {
  return {
    success: 1,
    result: [
      {
        event_key: 'abc-123',
        event_date: '2026-07-01',
        event_time: '10:15',
        event_first_player: 'Player A',
        first_player_key: '111',
        event_second_player: 'Player B',
        second_player_key: '222',
        event_status: '',
        event_live: '0',
        event_type_type: 'Atp Singles',
        tournament_name: 'Test Open',
        tournament_key: '999',
        tournament_round: 'Round 1',
        tournament_season: '2026',
      },
    ],
  };
}

console.log('\nProvider adapter safety checks (M1.2.b)\n');

// ── 1. redactUrl — case-insensitive secret param redaction ──────────────
test('redactUrl redacts tennis mixed-case auth query param', () => {
  const { redactUrl } = require(path.join(buildDir, 'lib/providers/errors.js'));
  const out = redactUrl(`https://api.api-tennis.com/tennis/?method=get_events&${tennisAuthParam}=SUPERSECRET`);
  assert.ok(!out.includes('SUPERSECRET'), `leaked secret: ${out}`);
  assert.ok(out.includes(`${tennisAuthParam}=REDACTED`), `did not redact: ${out}`);
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

// ── 5. M1.2.b fixture fetch and dry-run behavior ─────────────────────────
process.env.API_FOOTBALL_KEY = 'dummy-football';
process.env.API_TENNIS_KEY = 'dummy-tennis';
process.env.SPORTMONKS_TOKEN = 'dummy-sportmonks';

testAsync('ApiFootballAdapter.fetchFixtures maps provider fixtures into canonical drafts', async () => {
  const originalFetch = globalThis.fetch;
  const { ApiFootballAdapter } = require(path.join(buildDir, 'lib/providers/adapters/api-football.js'));
  let observedUrl = '';
  let observedHeaders = null;

  globalThis.fetch = async (url, init = {}) => {
    observedUrl = String(url);
    observedHeaders = init.headers;
    return jsonResponse(footballPayload());
  };

  try {
    const rows = await new ApiFootballAdapter().fetchFixtures({
      competitionIds: ['39'],
      dateFrom: '2026-07-01',
      dateTo: '2026-07-02',
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].providerFixtureId, '12345');
    assert.equal(rows[0].fixture.sport, 'football');
    assert.equal(rows[0].fixture.status, 'scheduled');
    assert.equal(rows[0].fixture.homeRef, 'api_football:team:33');
    assert.equal(rows[0].fixture.awayRef, 'api_football:team:40');
    assert.ok(observedUrl.includes('/fixtures'));
    assert.ok(observedUrl.includes('from=2026-07-01'));
    assert.ok(observedUrl.includes('to=2026-07-02'));
    assert.ok(observedUrl.includes('league=39'));
    assert.equal(observedHeaders['x-apisports-key'], 'dummy-football');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

testAsync('ApiTennisAdapter.fetchFixtures maps provider fixtures into canonical drafts', async () => {
  const originalFetch = globalThis.fetch;
  const { ApiTennisAdapter } = require(path.join(buildDir, 'lib/providers/adapters/api-tennis.js'));
  let observedUrl = '';

  globalThis.fetch = async (url) => {
    observedUrl = String(url);
    return jsonResponse(tennisPayload());
  };

  try {
    const rows = await new ApiTennisAdapter().fetchFixtures({
      competitionIds: ['999'],
      dateFrom: '2026-07-01',
      dateTo: '2026-07-02',
    });

    const url = new URL(observedUrl);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].providerFixtureId, 'abc-123');
    assert.equal(rows[0].fixture.sport, 'tennis');
    assert.equal(rows[0].fixture.status, 'scheduled');
    assert.equal(rows[0].fixture.participantARef, 'api_tennis:player:111');
    assert.equal(rows[0].fixture.participantBRef, 'api_tennis:player:222');
    assert.equal(url.searchParams.get('method'), 'get_fixtures');
    assert.equal(url.searchParams.get('date_start'), '2026-07-01');
    assert.equal(url.searchParams.get('date_stop'), '2026-07-02');
    assert.equal(url.searchParams.get('tournament_key'), '999');
    assert.equal(url.searchParams.get(tennisAuthParam), 'dummy-tennis');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await testAsync('runFixtureSync dry-run returns counts without requiring Supabase service role', async () => {
  const originalFetch = globalThis.fetch;
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { runFixtureSync } = require(path.join(buildDir, 'lib/providers/fixture-sync.js'));

  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  globalThis.fetch = async (url) => {
    const rawUrl = String(url);
    if (rawUrl.includes('api-tennis')) return jsonResponse(tennisPayload());
    return jsonResponse(footballPayload());
  };

  try {
    const report = await runFixtureSync({
      providers: ['api_football', 'api_tennis'],
      dateFrom: '2026-07-01',
      dateTo: '2026-07-02',
      dryRun: true,
    });

    assert.equal(report.dryRun, true);
    assert.equal(report.totals.fetched, 2);
    assert.equal(report.totals.insertedCanonicalFixtures, 0);
    assert.equal(report.totals.insertedProviderLinks, 0);
    assert.equal(report.totals.failedWrites, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalServiceRole) process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
  }
});

await testAsync('fetchOdds/fetchResults/fetchEnrichment remain out of scope and never touch network', async () => {
  const originalFetch = globalThis.fetch;
  const { ApiFootballAdapter } = require(path.join(buildDir, 'lib/providers/adapters/api-football.js'));
  const { SportMonksAdapter } = require(path.join(buildDir, 'lib/providers/adapters/sportmonks.js'));
  const { ApiTennisAdapter } = require(path.join(buildDir, 'lib/providers/adapters/api-tennis.js'));
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error('network should not be called');
  };

  try {
    const calls = [
      () => new ApiFootballAdapter().fetchOdds({ providerFixtureIds: ['1'] }),
      () => new ApiFootballAdapter().fetchResults({ providerFixtureIds: ['1'] }),
      () => new ApiTennisAdapter().fetchOdds({ providerFixtureIds: ['1'] }),
      () => new ApiTennisAdapter().fetchResults({ providerFixtureIds: ['1'] }),
      () => new SportMonksAdapter().fetchEnrichment({ providerFixtureId: '1' }),
    ];

    for (const call of calls) {
      const start = Date.now();
      await assert.rejects(call(), /scope|scaffold/, 'expected out-of-scope rejection');
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 200, `took ${elapsed}ms — looks like a real network call`);
    }

    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
