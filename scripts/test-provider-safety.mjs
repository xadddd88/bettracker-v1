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
import Module from 'node:module';
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

async function readJsonResponse(response) {
  return {
    status: response.status,
    body: await response.json(),
  };
}

function withCompiledAlias(fn) {
  const originalResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      return originalResolveFilename.call(this, path.join(buildDir, request.slice(2)), parent, isMain, options);
    }

    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      Module._resolveFilename = originalResolveFilename;
    });
}

function clearCompiledFixtureSyncModules() {
  for (const relPath of [
    'app/api/admin/sports/fixtures/sync/route.js',
    'lib/providers/fixture-sync.js',
    'lib/supabase/admin.js',
  ]) {
    const compiledPath = path.join(buildDir, relPath);
    try {
      delete require.cache[require.resolve(compiledPath)];
    } catch {
      // Module may not have been loaded yet.
    }
  }
}

async function withFixtureSyncRoute(fn) {
  return withCompiledAlias(async () => {
    clearCompiledFixtureSyncModules();
    const route = require(path.join(buildDir, 'app/api/admin/sports/fixtures/sync/route.js'));
    return fn(route);
  });
}

function clearCompiledOddsDryRunModules() {
  for (const relPath of [
    'app/api/admin/sports/odds/dry-run/route.js',
    'lib/providers/odds-dry-run.js',
    'lib/supabase/admin.js',
  ]) {
    const compiledPath = path.join(buildDir, relPath);
    try {
      delete require.cache[require.resolve(compiledPath)];
    } catch {
      // Module may not have been loaded yet.
    }
  }
}

async function withOddsDryRunRoute(fn) {
  return withCompiledAlias(async () => {
    clearCompiledOddsDryRunModules();
    const route = require(path.join(buildDir, 'app/api/admin/sports/odds/dry-run/route.js'));
    return fn(route);
  });
}

async function withOddsDryRunRouteAndAdminMock(adminExports, fn) {
  return withCompiledAlias(async () => {
    clearCompiledOddsDryRunModules();
    const adminPath = path.join(buildDir, 'lib/supabase/admin.js');
    require.cache[require.resolve(adminPath)] = {
      id: adminPath,
      filename: adminPath,
      loaded: true,
      exports: adminExports,
    };
    const route = require(path.join(buildDir, 'app/api/admin/sports/odds/dry-run/route.js'));
    try {
      return await fn(route);
    } finally {
      clearCompiledOddsDryRunModules();
    }
  });
}

function authorizedOddsDryRunRequest(body) {
  return new Request('https://example.test/api/admin/sports/odds/dry-run', {
    method: 'POST',
    headers: {
      authorization: 'Bearer operator-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function authorizedFixtureSyncRequest(body) {
  return new Request('https://example.test/api/admin/sports/fixtures/sync', {
    method: 'POST',
    headers: {
      authorization: 'Bearer operator-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
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

function footballPayloadMany(count) {
  const base = footballPayload().response[0];
  return {
    errors: [],
    response: Array.from({ length: count }, (_, index) => ({
      ...base,
      fixture: {
        ...base.fixture,
        id: 12000 + index,
      },
      teams: {
        home: { id: 3300 + index, name: `Home ${index}` },
        away: { id: 4400 + index, name: `Away ${index}` },
      },
    })),
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

function oddsFixture(overrides = {}) {
  return {
    canonicalFixtureId: 'canonical-fixture-1',
    sport: 'football',
    status: 'scheduled',
    kickoffAt: '2026-12-31T18:00:00Z',
    provider: 'api_football',
    providerFixtureId: '12345',
    mappingConfidence: 'exact',
    ...overrides,
  };
}

function documentedOddsEndpoint(overrides = {}) {
  return {
    endpoint: 'https://v3.football.api-sports.io/odds',
    requestShape: 'GET /odds?fixture=<providerFixtureId>&bet=match_winner',
    quotaCostPerRequest: 1,
    ...overrides,
  };
}

function oddsProviderPayload(overrides = {}) {
  return {
    get: 'odds',
    parameters: { fixture: '1576052', bet: '1' },
    errors: [],
    results: 1,
    paging: { current: 1, total: 1 },
    response: [
      {
        fixture: { id: 1576052 },
        update: '2026-07-05T12:00:00+00:00',
        bookmakers: [
          {
            id: 6,
            name: 'Bwin',
            bets: [
              {
                id: 1,
                name: 'Match Winner',
                values: [
                  { value: 'Home', odd: '2.00' },
                  { value: 'Draw', odd: '3.25' },
                  { value: 'Away', odd: '4.10' },
                ],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function createOddsDryRunSupabaseMock({ link, fixture }) {
  const calls = [];
  const mutations = [];

  return {
    calls,
    mutations,
    client: {
      from(table) {
        const filters = [];
        const builder = {
          select(columns) {
            calls.push({ table, op: 'select', columns });
            return builder;
          },
          eq(column, value) {
            calls.push({ table, op: 'eq', column, value });
            filters.push({ column, value });
            return builder;
          },
          async maybeSingle() {
            calls.push({ table, op: 'maybeSingle', filters: [...filters] });
            if (table === 'fixture_provider_links') return { data: link, error: null };
            if (table === 'canonical_fixtures') return { data: fixture, error: null };
            return { data: null, error: null };
          },
          insert(payload) {
            mutations.push({ table, op: 'insert', payload });
            throw new Error('odds dry-run must not insert');
          },
          update(payload) {
            mutations.push({ table, op: 'update', payload });
            throw new Error('odds dry-run must not update');
          },
          upsert(payload) {
            mutations.push({ table, op: 'upsert', payload });
            throw new Error('odds dry-run must not upsert');
          },
          delete() {
            mutations.push({ table, op: 'delete' });
            throw new Error('odds dry-run must not delete');
          },
        };
        return builder;
      },
    },
  };
}

function exactOddsProviderLink(overrides = {}) {
  return {
    id: 'provider-link-1',
    canonical_fixture_id: 'canonical-fixture-1',
    provider: 'api_football',
    provider_fixture_id: '1576052',
    mapping_confidence: 'exact',
    ...overrides,
  };
}

function scheduledFootballFixture(overrides = {}) {
  return {
    id: 'canonical-fixture-1',
    sport: 'football',
    status: 'scheduled',
    kickoff_at: '2026-12-31T18:00:00Z',
    ...overrides,
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

// ── 4b. M1.3 odds endpoint discovery planner stays read-only/sanitized ─────
await testAsync('odds discovery blocks provider calls when endpoint or cost is unknown', async () => {
  const { runOddsEndpointDiscoveryDryRun } = require(path.join(buildDir, 'lib/providers/odds-discovery.js'));
  let providerCalls = 0;

  const report = await runOddsEndpointDiscoveryDryRun({
    provider: 'api_football',
    market: 'match_winner',
    dryRun: true,
    now: '2026-12-31T17:00:00Z',
    endpointDocumentation: {
      endpoint: null,
      requestShape: null,
      quotaCostPerRequest: null,
    },
    fixtures: [oddsFixture()],
    fetchProviderOdds: async () => {
      providerCalls++;
      return [];
    },
  });

  assert.equal(providerCalls, 0);
  assert.equal(report.providerCall.allowed, false);
  assert.ok(report.providerCall.blockedReasons.includes('api_football odds endpoint/request/cost is not documented'));
  assert.equal(report.estimatedProviderRequests, 1);
  assert.equal(report.totals.fixturesChecked, 1);
  assert.equal(report.totals.providerLinksFound, 1);
});

await testAsync('odds discovery blocks non-scheduled fixtures before provider calls', async () => {
  const { runOddsEndpointDiscoveryDryRun } = require(path.join(buildDir, 'lib/providers/odds-discovery.js'));
  let providerCalls = 0;

  const report = await runOddsEndpointDiscoveryDryRun({
    provider: 'api_football',
    market: 'match_winner',
    dryRun: true,
    now: '2026-12-31T17:00:00Z',
    endpointDocumentation: documentedOddsEndpoint(),
    fixtures: [oddsFixture({ status: 'live' })],
    fetchProviderOdds: async () => {
      providerCalls++;
      return [];
    },
  });

  assert.equal(providerCalls, 0);
  assert.equal(report.fixtures[0].eligible, false);
  assert.ok(report.fixtures[0].blockedReasons.includes('fixture status is not scheduled'));
  assert.equal(report.providerCall.allowed, false);
});

await testAsync('odds discovery blocks missing kickoff before provider calls', async () => {
  const { runOddsEndpointDiscoveryDryRun } = require(path.join(buildDir, 'lib/providers/odds-discovery.js'));
  let providerCalls = 0;

  const report = await runOddsEndpointDiscoveryDryRun({
    provider: 'api_football',
    market: 'match_winner',
    dryRun: true,
    now: '2026-12-31T17:00:00Z',
    endpointDocumentation: documentedOddsEndpoint(),
    fixtures: [oddsFixture({ kickoffAt: null })],
    fetchProviderOdds: async () => {
      providerCalls++;
      return [];
    },
  });

  assert.equal(providerCalls, 0);
  assert.equal(report.fixtures[0].eligible, false);
  assert.ok(report.fixtures[0].blockedReasons.includes('kickoff_at is missing'));
  assert.equal(report.providerCall.allowed, false);
});

await testAsync('odds discovery empty bookmaker allowlist prevents write mode', async () => {
  const { runOddsEndpointDiscoveryDryRun } = require(path.join(buildDir, 'lib/providers/odds-discovery.js'));
  const originalWriteEnabled = process.env.SPORTS_ODDS_SYNC_WRITE_ENABLED;
  let providerCalls = 0;

  process.env.SPORTS_ODDS_SYNC_WRITE_ENABLED = 'true';

  try {
    const report = await runOddsEndpointDiscoveryDryRun({
      provider: 'api_football',
      market: 'match_winner',
      dryRun: false,
      operatorConfirm: 'WRITE_ODDS_SNAPSHOT_M1_3',
      now: '2026-12-31T17:00:00Z',
      endpointDocumentation: documentedOddsEndpoint(),
      fixtures: [oddsFixture()],
      bookmakerAllowlist: [],
      fetchProviderOdds: async () => {
        providerCalls++;
        return [];
      },
    });

    assert.equal(providerCalls, 0);
    assert.equal(report.writeEnabled, true);
    assert.equal(report.operatorConfirmed, true);
    assert.equal(report.write.allowed, false);
    assert.ok(report.write.blockedReasons.includes('approved bookmaker allowlist is empty'));
    assert.equal(report.write.writeSkipped, true);
  } finally {
    if (originalWriteEnabled === undefined) {
      delete process.env.SPORTS_ODDS_SYNC_WRITE_ENABLED;
    } else {
      process.env.SPORTS_ODDS_SYNC_WRITE_ENABLED = originalWriteEnabled;
    }
  }
});

await testAsync('odds discovery planner never reports writes allowed in M1.3 discovery mode', async () => {
  const { runOddsEndpointDiscoveryDryRun } = require(path.join(buildDir, 'lib/providers/odds-discovery.js'));
  const originalWriteEnabled = process.env.SPORTS_ODDS_SYNC_WRITE_ENABLED;

  process.env.SPORTS_ODDS_SYNC_WRITE_ENABLED = 'true';

  try {
    const report = await runOddsEndpointDiscoveryDryRun({
      provider: 'api_football',
      market: 'match_winner',
      dryRun: false,
      operatorConfirm: 'WRITE_ODDS_SNAPSHOT_M1_3',
      now: '2026-12-31T17:00:00Z',
      endpointDocumentation: documentedOddsEndpoint(),
      fixtures: [oddsFixture()],
      bookmakerAllowlist: [{ providerBookmakerId: '8', name: 'Fixture Book' }],
      fetchProviderOdds: async () => [
        {
          providerFixtureId: '12345',
          bookmakers: [{ providerBookmakerId: '8', name: 'Fixture Book' }],
          markets: [{ providerMarketId: '1', name: 'Match Winner' }],
        },
      ],
    });

    assert.equal(report.write.allowed, false);
    assert.equal(report.write.writeSkipped, true);
    assert.ok(
      report.write.blockedReasons.includes('odds writes are not implemented in M1.3 discovery planner')
    );
  } finally {
    if (originalWriteEnabled === undefined) {
      delete process.env.SPORTS_ODDS_SYNC_WRITE_ENABLED;
    } else {
      process.env.SPORTS_ODDS_SYNC_WRITE_ENABLED = originalWriteEnabled;
    }
  }
});

await testAsync('odds discovery dry-run returns sanitized bookmaker and market coverage', async () => {
  const { runOddsEndpointDiscoveryDryRun } = require(path.join(buildDir, 'lib/providers/odds-discovery.js'));

  const report = await runOddsEndpointDiscoveryDryRun({
    provider: 'api_football',
    market: 'match_winner',
    dryRun: true,
    now: '2026-12-31T17:00:00Z',
    endpointDocumentation: documentedOddsEndpoint(),
    fixtures: [oddsFixture()],
    fetchProviderOdds: async () => [
      {
        providerFixtureId: '12345',
        bookmakers: [{ providerBookmakerId: '8', name: 'Fixture Book' }],
        markets: [{ providerMarketId: '1', name: 'Match Winner' }],
        rawProviderPayload: { token: 'SECRET_TOKEN', nested: { api_key: 'SECRET_API_KEY' } },
      },
    ],
  });

  assert.equal(report.dryRun, true);
  assert.equal(report.writeEnabled, false);
  assert.equal(report.totals.fixturesChecked, 1);
  assert.equal(report.totals.providerLinksFound, 1);
  assert.equal(report.totals.oddsAvailable, 1);
  assert.equal(report.totals.oddsUnavailable, 0);
  assert.deepEqual(report.discoveredBookmakers, [{ providerBookmakerId: '8', name: 'Fixture Book' }]);
  assert.deepEqual(report.discoveredMarkets, [{ providerMarketId: '1', name: 'Match Winner' }]);
  assert.equal(JSON.stringify(report).includes('SECRET_TOKEN'), false);
  assert.equal(JSON.stringify(report).includes('SECRET_API_KEY'), false);
  assert.equal(JSON.stringify(report).includes('rawProviderPayload'), false);
});

// ── 4c. M1.3 read-only odds dry-run implementation stays scoped/safe ───────
await testAsync('read-only odds dry-run pre-flight failure blocks provider call', async () => {
  const { runReadOnlyOddsDryRun } = require(path.join(buildDir, 'lib/providers/odds-dry-run.js'));
  const supabase = createOddsDryRunSupabaseMock({
    link: exactOddsProviderLink(),
    fixture: scheduledFootballFixture({ status: 'live' }),
  });
  let providerCalls = 0;

  const report = await runReadOnlyOddsDryRun({
    supabase: supabase.client,
    now: '2026-12-31T17:00:00Z',
    fetchProviderOdds: async () => {
      providerCalls++;
      return oddsProviderPayload();
    },
  });

  assert.equal(providerCalls, 0);
  assert.equal(report.requestAttempted, false);
  assert.equal(report.actualProviderRequests, 0);
  assert.equal(report.preflight.passed, false);
  assert.ok(report.preflight.blockedReasons.includes('canonical fixture status is not scheduled'));
  assert.deepEqual(supabase.mutations, []);
});

await testAsync('read-only odds dry-run successful pre-flight allows exactly one provider call', async () => {
  const { runReadOnlyOddsDryRun } = require(path.join(buildDir, 'lib/providers/odds-dry-run.js'));
  const supabase = createOddsDryRunSupabaseMock({
    link: exactOddsProviderLink(),
    fixture: scheduledFootballFixture(),
  });
  const providerRequests = [];

  const report = await runReadOnlyOddsDryRun({
    supabase: supabase.client,
    now: '2026-12-31T17:00:00Z',
    fetchProviderOdds: async (request) => {
      providerRequests.push(request);
      return oddsProviderPayload();
    },
  });

  assert.equal(providerRequests.length, 1);
  assert.deepEqual(providerRequests[0], { providerFixtureId: '1576052', betId: 1, page: 1 });
  assert.equal(report.requestAttempted, true);
  assert.equal(report.actualProviderRequests, 1);
  assert.equal(report.estimatedProviderRequests, 1);
  assert.deepEqual(report.paging, { current: 1, total: 1 });
  assert.equal(report.oddsAvailable, true);
  assert.deepEqual(report.discoveredBookmakers, [{ providerBookmakerId: '6', name: 'Bwin' }]);
  assert.deepEqual(report.discoveredMarkets, [{ providerMarketId: '1', name: 'Match Winner' }]);
  assert.equal(report.valuesPresent, true);
  assert.equal(report.paginationOverflow, false);
  assert.deepEqual(supabase.mutations, []);
});

await testAsync('read-only odds dry-run stops after page 1 when provider reports more pages', async () => {
  const { runReadOnlyOddsDryRun } = require(path.join(buildDir, 'lib/providers/odds-dry-run.js'));
  const supabase = createOddsDryRunSupabaseMock({
    link: exactOddsProviderLink(),
    fixture: scheduledFootballFixture(),
  });
  let providerCalls = 0;

  const report = await runReadOnlyOddsDryRun({
    supabase: supabase.client,
    now: '2026-12-31T17:00:00Z',
    fetchProviderOdds: async () => {
      providerCalls++;
      return oddsProviderPayload({ paging: { current: 1, total: 2 } });
    },
  });

  assert.equal(providerCalls, 1);
  assert.equal(report.actualProviderRequests, 1);
  assert.deepEqual(report.paging, { current: 1, total: 2 });
  assert.equal(report.paginationOverflow, true);
  assert.ok(report.stopReasons.includes('provider pagination total exceeds approved page-1 budget'));
});

await testAsync('read-only odds dry-run report contains no token, raw payload, odds prices, or betting-signal fields', async () => {
  const { runReadOnlyOddsDryRun } = require(path.join(buildDir, 'lib/providers/odds-dry-run.js'));
  const supabase = createOddsDryRunSupabaseMock({
    link: exactOddsProviderLink(),
    fixture: scheduledFootballFixture(),
  });

  const report = await runReadOnlyOddsDryRun({
    supabase: supabase.client,
    now: '2026-12-31T17:00:00Z',
    fetchProviderOdds: async () => oddsProviderPayload({
      secret: 'SECRET_PROVIDER_TOKEN',
      rawProviderPayload: { apiKey: 'SECRET_API_KEY' },
      response: [
        {
          fixture: { id: 1576052 },
          edge_percent: -17.4,
          model_probability: 28,
          bookmakers: [
            {
              id: 6,
              name: 'Bwin',
              bets: [
                {
                  id: 1,
                  name: 'Match Winner',
                  values: [
                    { value: 'Home', odd: '2.00' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  });

  const serialized = JSON.stringify(report);
  for (const forbidden of [
    'SECRET_PROVIDER_TOKEN',
    'SECRET_API_KEY',
    'rawProviderPayload',
    'model_probability',
    'modelProbability',
    'implied_probability',
    'impliedProbability',
    'edge_percent',
    'edge',
    'EV',
    'ev',
    '2.00',
    '17.4',
    '28',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `forbidden artifact leaked: ${forbidden}`);
  }
  assert.equal(report.valuesPresent, true);
  assert.deepEqual(supabase.mutations, []);
});

await testAsync('read-only odds dry-run route requires operator authorization before Supabase/provider calls', async () => {
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';

  try {
    await withOddsDryRunRoute(async ({ POST }) => {
      const response = await POST(
        new Request('https://example.test/api/admin/sports/odds/dry-run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dryRun: true }),
        })
      );
      const result = await readJsonResponse(response);

      assert.equal(result.status, 401);
      assert.equal(result.body.success, false);
      assert.equal(result.body.error, 'Unauthorized');
    });
  } finally {
    clearCompiledOddsDryRunModules();
    if (originalToken === undefined) {
      delete process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
    } else {
      process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = originalToken;
    }
  }
});

// ── 5. M1.2.b fixture fetch and dry-run behavior ─────────────────────────
await testAsync('read-only odds dry-run route rejects empty body before Supabase/provider calls', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  let fetchCalls = 0;
  let adminCalls = 0;

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error('provider fetch should not be called');
  };

  try {
    await withOddsDryRunRouteAndAdminMock(
      {
        createAdminClient() {
          adminCalls++;
          throw new Error('Supabase should not be touched');
        },
      },
      async ({ POST }) => {
        const response = await POST(authorizedOddsDryRunRequest({}));
        const result = await readJsonResponse(response);

        assert.equal(result.status, 400);
        assert.equal(result.body.success, false);
        assert.equal(result.body.error, 'Invalid input');
        assert.equal(adminCalls, 0);
        assert.equal(fetchCalls, 0);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
    } else {
      process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = originalToken;
    }
  }
});

await testAsync('read-only odds dry-run route rejects missing or wrong runtime confirmation before Supabase/provider calls', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  let fetchCalls = 0;
  let adminCalls = 0;

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error('provider fetch should not be called');
  };

  try {
    await withOddsDryRunRouteAndAdminMock(
      {
        createAdminClient() {
          adminCalls++;
          throw new Error('Supabase should not be touched');
        },
      },
      async ({ POST }) => {
        for (const body of [
          { dryRun: true, providerFixtureId: '1576052', betId: 1 },
          {
            dryRun: true,
            providerFixtureId: '1576052',
            betId: 1,
            operatorConfirm: 'WRONG_CONFIRMATION',
          },
        ]) {
          const response = await POST(authorizedOddsDryRunRequest(body));
          const result = await readJsonResponse(response);

          assert.equal(result.status, 400);
          assert.equal(result.body.success, false);
          assert.equal(
            result.body.error,
            'read-only odds dry-run requires explicit operator confirmation'
          );
        }

        assert.equal(adminCalls, 0);
        assert.equal(fetchCalls, 0);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
    } else {
      process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = originalToken;
    }
  }
});

await testAsync('read-only odds dry-run route accepts exact approved body and makes at most one provider call under mocks', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  const originalFootballKey = process.env.API_FOOTBALL_KEY;
  const supabase = createOddsDryRunSupabaseMock({
    link: exactOddsProviderLink(),
    fixture: scheduledFootballFixture(),
  });
  let providerCalls = 0;

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  process.env.API_FOOTBALL_KEY = 'dummy-football';
  globalThis.fetch = async (url, init = {}) => {
    providerCalls++;
    const parsedUrl = new URL(String(url));
    assert.equal(parsedUrl.pathname, '/odds');
    assert.equal(parsedUrl.searchParams.get('fixture'), '1576052');
    assert.equal(parsedUrl.searchParams.get('bet'), '1');
    assert.equal(parsedUrl.searchParams.get('page'), null);
    assert.equal(init.headers['x-apisports-key'], 'dummy-football');
    return jsonResponse(oddsProviderPayload());
  };

  try {
    await withOddsDryRunRouteAndAdminMock(
      {
        createAdminClient() {
          return supabase.client;
        },
      },
      async ({ POST }) => {
        const response = await POST(
          authorizedOddsDryRunRequest({
            dryRun: true,
            providerFixtureId: '1576052',
            betId: 1,
            operatorConfirm: 'RUN_READ_ONLY_ODDS_DRY_RUN_M1_3',
          })
        );
        const result = await readJsonResponse(response);

        assert.equal(result.status, 200);
        assert.equal(result.body.success, true);
        assert.equal(result.body.report.requestAttempted, true);
        assert.equal(result.body.report.actualProviderRequests, 1);
        assert.equal(providerCalls, 1);
        assert.deepEqual(supabase.mutations, []);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
    } else {
      process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = originalToken;
    }
    if (originalFootballKey === undefined) {
      delete process.env.API_FOOTBALL_KEY;
    } else {
      process.env.API_FOOTBALL_KEY = originalFootballKey;
    }
  }
});

process.env.API_FOOTBALL_KEY = 'dummy-football';
process.env.API_TENNIS_KEY = 'dummy-tennis';
process.env.SPORTMONKS_TOKEN = 'dummy-sportmonks';

await testAsync('fixture sync route rejects date ranges above the 7-day safety limit', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  const originalResolveFilename = Module._resolveFilename;
  let fetchCalls = 0;

  Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      return originalResolveFilename.call(this, path.join(buildDir, request.slice(2)), parent, isMain, options);
    }

    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error('provider fetch should not be called');
  };

  try {
    const { POST } = require(path.join(buildDir, 'app/api/admin/sports/fixtures/sync/route.js'));
    const response = await POST(
      new Request('https://example.test/api/admin/sports/fixtures/sync', {
        method: 'POST',
        headers: {
          authorization: 'Bearer operator-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          providers: ['api_football'],
          dateFrom: '2026-07-01',
          dateTo: '2026-07-08',
          dryRun: true,
        }),
      })
    );
    const result = await readJsonResponse(response);

    assert.equal(result.status, 400);
    assert.equal(result.body.success, false);
    assert.equal(result.body.error, 'date range exceeds M1.2.b safety limit of 7 days');
    assert.equal(result.body.details, undefined);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Module._resolveFilename = originalResolveFilename;

    if (originalToken === undefined) {
      delete process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
    } else {
      process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = originalToken;
    }
  }
});

await testAsync('fixture sync route blocks multi-provider write attempts before provider fetch', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  let fetchCalls = 0;

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error('provider fetch should not be called');
  };

  try {
    await withFixtureSyncRoute(async ({ POST }) => {
      const response = await POST(
        authorizedFixtureSyncRequest({
          providers: ['api_football', 'api_tennis'],
          dateFrom: '2026-07-01',
          dateTo: '2026-07-01',
          dryRun: false,
          operatorConfirm: 'WRITE_FIXTURE_SYNC_M1_2_B',
        })
      );
      const result = await readJsonResponse(response);

      assert.equal(result.status, 400);
      assert.equal(result.body.success, false);
      assert.equal(result.body.error, 'fixture write requires exactly one provider');
      assert.equal(result.body.details, undefined);
      assert.equal(fetchCalls, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
    } else {
      process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = originalToken;
    }
  }
});

await testAsync('fixture sync route blocks multi-day write attempts before provider fetch', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  let fetchCalls = 0;

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error('provider fetch should not be called');
  };

  try {
    await withFixtureSyncRoute(async ({ POST }) => {
      const response = await POST(
        authorizedFixtureSyncRequest({
          providers: ['api_football'],
          dateFrom: '2026-07-01',
          dateTo: '2026-07-02',
          dryRun: false,
          operatorConfirm: 'WRITE_FIXTURE_SYNC_M1_2_B',
        })
      );
      const result = await readJsonResponse(response);

      assert.equal(result.status, 400);
      assert.equal(result.body.success, false);
      assert.equal(result.body.error, 'fixture write requires a single-day date range');
      assert.equal(result.body.details, undefined);
      assert.equal(fetchCalls, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
    } else {
      process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = originalToken;
    }
  }
});

await testAsync('fixture sync route blocks write cap overflow before Supabase write', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  const originalWriteEnabled = process.env.SPORTS_FIXTURE_SYNC_WRITE_ENABLED;
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let fetchCalls = 0;

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  process.env.SPORTS_FIXTURE_SYNC_WRITE_ENABLED = 'true';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  globalThis.fetch = async () => {
    fetchCalls++;
    return jsonResponse(footballPayloadMany(26));
  };

  try {
    await withFixtureSyncRoute(async ({ POST }) => {
      const response = await POST(
        authorizedFixtureSyncRequest({
          providers: ['api_football'],
          dateFrom: '2026-07-01',
          dateTo: '2026-07-01',
          dryRun: false,
          operatorConfirm: 'WRITE_FIXTURE_SYNC_M1_2_B',
        })
      );
      const result = await readJsonResponse(response);

      assert.equal(result.status, 400);
      assert.equal(result.body.success, false);
      assert.equal(result.body.error, 'fixture write safety cap exceeded');
      assert.equal(result.body.details, undefined);
      assert.equal(fetchCalls, 1);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
    } else {
      process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = originalToken;
    }
    if (originalWriteEnabled === undefined) {
      delete process.env.SPORTS_FIXTURE_SYNC_WRITE_ENABLED;
    } else {
      process.env.SPORTS_FIXTURE_SYNC_WRITE_ENABLED = originalWriteEnabled;
    }
    if (originalServiceRole === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
    }
  }
});

await testAsync('fixture sync route keeps dry-run multi-provider behavior within the 7-day limit', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  globalThis.fetch = async (url) => {
    const rawUrl = String(url);
    if (rawUrl.includes('api-tennis')) return jsonResponse(tennisPayload());
    return jsonResponse(footballPayload());
  };

  try {
    await withFixtureSyncRoute(async ({ POST }) => {
      const response = await POST(
        authorizedFixtureSyncRequest({
          providers: ['api_football', 'api_tennis'],
          dateFrom: '2026-07-01',
          dateTo: '2026-07-01',
          dryRun: true,
        })
      );
      const result = await readJsonResponse(response);

      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);
      assert.equal(result.body.report.dryRun, true);
      assert.equal(result.body.report.totals.fetched, 2);
      assert.equal(result.body.report.totals.insertedCanonicalFixtures, 0);
      assert.equal(result.body.report.totals.insertedProviderLinks, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
    } else {
      process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = originalToken;
    }
  }
});

await testAsync('fixture sync route keeps dry-run multi-day behavior within the 7-day limit', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  const observedUrls = [];

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  globalThis.fetch = async (url) => {
    observedUrls.push(String(url));
    return jsonResponse(footballPayload());
  };

  try {
    await withFixtureSyncRoute(async ({ POST }) => {
      const response = await POST(
        authorizedFixtureSyncRequest({
          providers: ['api_football'],
          dateFrom: '2026-07-01',
          dateTo: '2026-07-07',
          dryRun: true,
        })
      );
      const result = await readJsonResponse(response);

      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);
      assert.equal(result.body.report.dryRun, true);
      assert.equal(result.body.report.totals.fetched, 7);
      assert.equal(observedUrls.length, 7);
      assert.equal(result.body.report.totals.insertedCanonicalFixtures, 0);
      assert.equal(result.body.report.totals.insertedProviderLinks, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
    } else {
      process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = originalToken;
    }
  }
});

await testAsync('runFixtureSync writes a small batch only when all write gates are satisfied', async () => {
  const originalFetch = globalThis.fetch;
  const originalWriteEnabled = process.env.SPORTS_FIXTURE_SYNC_WRITE_ENABLED;
  const adminPath = path.join(buildDir, 'lib/supabase/admin.js');
  const fixtureSyncPath = path.join(buildDir, 'lib/providers/fixture-sync.js');
  const calls = [];

  process.env.SPORTS_FIXTURE_SYNC_WRITE_ENABLED = 'true';
  globalThis.fetch = async () => jsonResponse(footballPayload());

  clearCompiledFixtureSyncModules();
  require.cache[require.resolve(adminPath)] = {
    id: adminPath,
    filename: adminPath,
    loaded: true,
    exports: {
      createAdminClient() {
        calls.push({ op: 'createAdminClient' });
        return {
          from(table) {
            const builder = {
              select(columns) {
                calls.push({ table, op: 'select', columns });
                return builder;
              },
              eq(column, value) {
                calls.push({ table, op: 'eq', column, value });
                return builder;
              },
              async maybeSingle() {
                calls.push({ table, op: 'maybeSingle' });
                return { data: null, error: null };
              },
              insert(payload) {
                calls.push({ table, op: 'insert', payload });
                if (table === 'canonical_fixtures') return builder;
                return { error: null };
              },
              async single() {
                calls.push({ table, op: 'single' });
                return { data: { id: 'fixture-1' }, error: null };
              },
              update(payload) {
                calls.push({ table, op: 'update', payload });
                return builder;
              },
            };
            return builder;
          },
        };
      },
    },
  };

  try {
    const { runFixtureSync } = require(fixtureSyncPath);
    const report = await runFixtureSync({
      providers: ['api_football'],
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dryRun: false,
      operatorConfirm: 'WRITE_FIXTURE_SYNC_M1_2_B',
    });

    assert.equal(report.dryRun, false);
    assert.equal(report.writeEnabled, true);
    assert.equal(report.operatorConfirmed, true);
    assert.equal(report.totals.fetched, 1);
    assert.equal(report.totals.insertedCanonicalFixtures, 1);
    assert.equal(report.totals.insertedProviderLinks, 1);
    assert.equal(calls.filter((call) => call.op === 'createAdminClient').length, 1);
    assert.equal(calls.some((call) => call.table === 'canonical_fixtures' && call.op === 'insert'), true);
    assert.equal(calls.some((call) => call.table === 'fixture_provider_links' && call.op === 'insert'), true);
  } finally {
    globalThis.fetch = originalFetch;
    clearCompiledFixtureSyncModules();
    if (originalWriteEnabled === undefined) {
      delete process.env.SPORTS_FIXTURE_SYNC_WRITE_ENABLED;
    } else {
      process.env.SPORTS_FIXTURE_SYNC_WRITE_ENABLED = originalWriteEnabled;
    }
  }
});

await testAsync('ApiFootballAdapter.fetchFixtures fetches unfiltered ranges one day at a time', async () => {
  const originalFetch = globalThis.fetch;
  const { ApiFootballAdapter } = require(path.join(buildDir, 'lib/providers/adapters/api-football.js'));
  const observedUrls = [];

  globalThis.fetch = async (url) => {
    observedUrls.push(String(url));
    return jsonResponse({ errors: [], response: [] });
  };

  try {
    const rows = await new ApiFootballAdapter().fetchFixtures({
      dateFrom: '2026-07-04',
      dateTo: '2026-07-05',
    });

    assert.equal(rows.length, 0);
    assert.equal(observedUrls.length, 2);
    assert.deepEqual(
      observedUrls.map((rawUrl) => new URL(rawUrl).searchParams.get('date')),
      ['2026-07-04', '2026-07-05']
    );

    for (const rawUrl of observedUrls) {
      const url = new URL(rawUrl);
      assert.equal(url.searchParams.get('from'), null);
      assert.equal(url.searchParams.get('to'), null);
      assert.equal(url.searchParams.get('league'), null);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await testAsync('ApiFootballAdapter.fetchFixtures maps provider fixtures into canonical drafts', async () => {
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

await testAsync('ApiTennisAdapter.fetchFixtures maps provider fixtures into canonical drafts', async () => {
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
    assert.equal(report.totals.fetched, 3);
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
