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

function clearCompiledOddsReferenceDiscoveryModules() {
  for (const relPath of [
    'app/api/admin/sports/odds/reference-discovery/route.js',
    'lib/providers/odds-reference-discovery.js',
  ]) {
    const compiledPath = path.join(buildDir, relPath);
    try {
      delete require.cache[require.resolve(compiledPath)];
    } catch {
      // Module may not have been loaded yet.
    }
  }
}

async function withOddsReferenceDiscoveryRoute(fn) {
  return withCompiledAlias(async () => {
    clearCompiledOddsReferenceDiscoveryModules();
    const route = require(path.join(buildDir, 'app/api/admin/sports/odds/reference-discovery/route.js'));
    try {
      return await fn(route);
    } finally {
      clearCompiledOddsReferenceDiscoveryModules();
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

function authorizedOddsReferenceDiscoveryRequest(body) {
  return new Request('https://example.test/api/admin/sports/odds/reference-discovery', {
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
    paging: { current: 1, total: 1 },
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
    paging: { current: 1, total: 1 },
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

function oddsBookmakersPayload(overrides = {}) {
  return {
    get: 'odds/bookmakers',
    parameters: [],
    errors: [],
    results: 2,
    paging: { current: 1, total: 1 },
    response: [
      { id: 6, name: 'Bwin' },
      { id: 8, name: 'Bet365' },
    ],
    ...overrides,
  };
}

function actualOddsBookmakersPayload(overrides = {}) {
  return oddsBookmakersPayload({
    results: 3,
    response: [
      { id: 6, name: 'Bwin' },
      { bookmaker: { id: 8, name: 'Bet365' } },
      { id: '11', name: '1xBet' },
    ],
    ...overrides,
  });
}

function oddsMappingPayload(overrides = {}) {
  return {
    get: 'odds/mapping',
    parameters: [],
    errors: [],
    results: 1,
    paging: { current: 1, total: 1 },
    response: [
      {
        league: { id: 39, season: 2026 },
        fixture: { id: 1576052 },
        update: '2026-07-05T12:00:00+00:00',
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

// ── 4d. M1.3 bookmaker/mapping reference discovery stays read-only/safe ─────
await testAsync('bookmaker/mapping discovery helper makes one request per approved endpoint', async () => {
  const { runBookmakerMappingDiscovery } = require(path.join(buildDir, 'lib/providers/odds-reference-discovery.js'));
  const requests = [];

  const report = await runBookmakerMappingDiscovery({
    fetchProviderReference: async (request) => {
      requests.push(request);
      if (request.endpoint === 'bookmakers') return oddsBookmakersPayload();
      if (request.endpoint === 'mapping') return oddsMappingPayload();
      throw new Error(`unexpected endpoint ${request.endpoint}`);
    },
  });

  assert.deepEqual(requests, [{ endpoint: 'bookmakers' }, { endpoint: 'mapping' }]);
  assert.equal(report.dryRun, true);
  assert.equal(report.provider, 'api_football');
  assert.equal(report.estimatedProviderRequests, 2);
  assert.equal(report.actualProviderRequests, 2);
  assert.equal(report.writeSkipped, true);
  assert.equal(report.paginationOverflow, false);
  assert.deepEqual(report.stopReasons, []);
  assert.deepEqual(report.discoveredBookmakers, [
    { providerBookmakerId: '6', name: 'Bwin' },
    { providerBookmakerId: '8', name: 'Bet365' },
  ]);
  assert.deepEqual(report.mappingCoverage, [
    {
      league: { id: '39', season: '2026' },
      fixture: { id: '1576052' },
      update: '2026-07-05T12:00:00+00:00',
    },
  ]);
});

await testAsync('bookmaker/mapping discovery accepts actual wrapped bookmaker rows as valid shape', async () => {
  const { runBookmakerMappingDiscovery } = require(path.join(buildDir, 'lib/providers/odds-reference-discovery.js'));
  const requests = [];

  const report = await runBookmakerMappingDiscovery({
    fetchProviderReference: async (request) => {
      requests.push(request);
      if (request.endpoint === 'bookmakers') return actualOddsBookmakersPayload();
      if (request.endpoint === 'mapping') return oddsMappingPayload();
      throw new Error(`unexpected endpoint ${request.endpoint}`);
    },
  });

  assert.deepEqual(requests, [{ endpoint: 'bookmakers' }, { endpoint: 'mapping' }]);
  assert.equal(report.actualProviderRequests, 2);
  assert.deepEqual(report.stopReasons, []);
  assert.equal(report.endpoints.find((endpoint) => endpoint.endpoint === 'bookmakers').responseShapeValid, true);
  assert.deepEqual(report.discoveredBookmakers, [
    { providerBookmakerId: '6', name: 'Bwin' },
    { providerBookmakerId: '8', name: 'Bet365' },
    { providerBookmakerId: '11', name: '1xBet' },
  ]);
});

await testAsync('bookmaker/mapping discovery reports bookmaker row diagnostics for valid rows', async () => {
  const { runBookmakerMappingDiscovery } = require(path.join(buildDir, 'lib/providers/odds-reference-discovery.js'));

  const report = await runBookmakerMappingDiscovery({
    fetchProviderReference: async (request) => {
      if (request.endpoint === 'bookmakers') return actualOddsBookmakersPayload();
      if (request.endpoint === 'mapping') return oddsMappingPayload();
      throw new Error(`unexpected endpoint ${request.endpoint}`);
    },
  });

  const bookmakerEndpoint = report.endpoints.find((endpoint) => endpoint.endpoint === 'bookmakers');
  assert.equal(bookmakerEndpoint.bookmakerRowsTotal, 3);
  assert.equal(bookmakerEndpoint.validBookmakerRows, 3);
  assert.equal(bookmakerEndpoint.invalidBookmakerRows, 0);
  assert.deepEqual(bookmakerEndpoint.invalidBookmakerRowReasons, []);
  assert.equal(bookmakerEndpoint.responseShapeValid, true);
});

await testAsync('bookmaker/mapping discovery treats missing bookmaker name as non-fatal and continues to mapping', async () => {
  const { runBookmakerMappingDiscovery } = require(path.join(buildDir, 'lib/providers/odds-reference-discovery.js'));
  const requests = [];

  const report = await runBookmakerMappingDiscovery({
    fetchProviderReference: async (request) => {
      requests.push(request);
      if (request.endpoint === 'bookmakers') {
        return oddsBookmakersPayload({
          results: 3,
          response: [
            { id: 6, name: 'Bwin' },
            { id: 99 },
            { bookmaker: { id: 8, name: 'Bet365' } },
          ],
        });
      }
      if (request.endpoint === 'mapping') return oddsMappingPayload();
      throw new Error(`unexpected endpoint ${request.endpoint}`);
    },
  });

  const bookmakerEndpoint = report.endpoints.find((endpoint) => endpoint.endpoint === 'bookmakers');
  assert.deepEqual(requests, [{ endpoint: 'bookmakers' }, { endpoint: 'mapping' }]);
  assert.equal(report.actualProviderRequests, 2);
  assert.deepEqual(report.stopReasons, []);
  assert.ok(report.nonFatalWarnings.includes('bookmaker row missing name'));
  assert.equal(bookmakerEndpoint.responseShapeValid, true);
  assert.equal(bookmakerEndpoint.bookmakerRowsTotal, 3);
  assert.equal(bookmakerEndpoint.validBookmakerRows, 2);
  assert.equal(bookmakerEndpoint.invalidBookmakerRows, 0);
  assert.equal(bookmakerEndpoint.partialBookmakerRows, 1);
  assert.deepEqual(bookmakerEndpoint.invalidBookmakerRowReasons, []);
  assert.deepEqual(bookmakerEndpoint.partialBookmakerRowReasons, ['missing name']);
  assert.ok(bookmakerEndpoint.nonFatalWarnings.includes('bookmaker row missing name'));
  assert.deepEqual(report.discoveredBookmakers, [
    { providerBookmakerId: '6', name: 'Bwin' },
    { providerBookmakerId: '8', name: 'Bet365' },
  ]);
  assert.equal(report.discoveredBookmakers.some((bookmaker) => bookmaker.providerBookmakerId === '99'), false);
  assert.deepEqual(report.mappingCoverage, [
    {
      league: { id: '39', season: '2026' },
      fixture: { id: '1576052' },
      update: '2026-07-05T12:00:00+00:00',
    },
  ]);
});

await testAsync('bookmaker/mapping discovery reports generic invalid bookmaker row diagnostics', async () => {
  const { runBookmakerMappingDiscovery } = require(path.join(buildDir, 'lib/providers/odds-reference-discovery.js'));

  const report = await runBookmakerMappingDiscovery({
    fetchProviderReference: async (request) => {
      if (request.endpoint === 'bookmakers') {
        return oddsBookmakersPayload({
          results: 5,
          response: [
            { id: 6, name: 'Bwin' },
            { bookmaker: { id: 8 } },
            { bookmaker: { name: 'NoId' } },
            'bad-row',
            { bookmaker: null },
          ],
        });
      }
      throw new Error(`unexpected endpoint ${request.endpoint}`);
    },
  });

  const bookmakerEndpoint = report.endpoints.find((endpoint) => endpoint.endpoint === 'bookmakers');
  assert.equal(bookmakerEndpoint.bookmakerRowsTotal, 5);
  assert.equal(bookmakerEndpoint.validBookmakerRows, 1);
  assert.equal(bookmakerEndpoint.invalidBookmakerRows, 3);
  assert.equal(bookmakerEndpoint.partialBookmakerRows, 1);
  assert.ok(bookmakerEndpoint.partialBookmakerRowReasons.includes('missing name'));
  assert.ok(bookmakerEndpoint.nonFatalWarnings.includes('bookmaker row missing name'));
  assert.equal(bookmakerEndpoint.invalidBookmakerRowReasons.includes('missing name'), false);
  assert.ok(bookmakerEndpoint.invalidBookmakerRowReasons.includes('missing id'));
  assert.ok(bookmakerEndpoint.invalidBookmakerRowReasons.includes('non-object row'));
  assert.ok(bookmakerEndpoint.invalidBookmakerRowReasons.includes('unsupported wrapper shape'));
  assert.equal(bookmakerEndpoint.responseShapeValid, false);
  assert.ok(report.stopReasons.includes('provider response shape differs from expected evidence for /odds/bookmakers'));
  assert.equal(report.endpoints.find((endpoint) => endpoint.endpoint === 'mapping').requestAttempted, false);

  const serialized = JSON.stringify(bookmakerEndpoint);
  for (const forbidden of ['bad-row', 'NoId', 'rawProviderPayload', 'token', '"odd"', 'price', 'probability', 'edge', 'EV']) {
    assert.equal(serialized.includes(forbidden), false, `forbidden diagnostic artifact leaked: ${forbidden}`);
  }
});

await testAsync('bookmaker/mapping discovery keeps missing-id bookmaker rows fatal', async () => {
  const { runBookmakerMappingDiscovery } = require(path.join(buildDir, 'lib/providers/odds-reference-discovery.js'));
  const requests = [];

  const report = await runBookmakerMappingDiscovery({
    fetchProviderReference: async (request) => {
      requests.push(request);
      return actualOddsBookmakersPayload({
        response: [
          { id: 6, name: 'Bwin' },
          { bookmaker: { name: 'NoId' } },
        ],
      });
    },
  });

  assert.deepEqual(requests, [{ endpoint: 'bookmakers' }]);
  assert.equal(report.actualProviderRequests, 1);
  assert.equal(report.endpoints.find((endpoint) => endpoint.endpoint === 'bookmakers').responseShapeValid, false);
  assert.ok(report.endpoints.find((endpoint) => endpoint.endpoint === 'bookmakers').invalidBookmakerRowReasons.includes('missing id'));
  assert.ok(report.stopReasons.includes('provider response shape differs from expected evidence for /odds/bookmakers'));
  assert.equal(report.endpoints.find((endpoint) => endpoint.endpoint === 'mapping').requestAttempted, false);
});

await testAsync('bookmaker/mapping discovery stops after page 1 on pagination overflow', async () => {
  const { runBookmakerMappingDiscovery } = require(path.join(buildDir, 'lib/providers/odds-reference-discovery.js'));
  const requests = [];

  const report = await runBookmakerMappingDiscovery({
    fetchProviderReference: async (request) => {
      requests.push(request);
      return oddsBookmakersPayload({ paging: { current: 1, total: 2 } });
    },
  });

  assert.deepEqual(requests, [{ endpoint: 'bookmakers' }]);
  assert.equal(report.actualProviderRequests, 1);
  assert.equal(report.paginationOverflow, true);
  assert.ok(report.stopReasons.includes('provider pagination total exceeds approved page-1 budget for /odds/bookmakers'));
  assert.equal(report.endpoints.find((endpoint) => endpoint.endpoint === 'bookmakers').requestAttempted, true);
  assert.equal(report.endpoints.find((endpoint) => endpoint.endpoint === 'mapping').requestAttempted, false);
});

await testAsync('bookmaker/mapping discovery report contains no raw payload, token, odds prices, or betting-signal fields', async () => {
  const { runBookmakerMappingDiscovery } = require(path.join(buildDir, 'lib/providers/odds-reference-discovery.js'));

  const report = await runBookmakerMappingDiscovery({
    fetchProviderReference: async (request) => {
      if (request.endpoint === 'bookmakers') {
        return oddsBookmakersPayload({
          secret: 'SECRET_PROVIDER_TOKEN',
          rawProviderPayload: { token: 'SECRET_RAW_TOKEN' },
          response: [{ id: 6, name: 'Bwin', odd: '2.00', edge_percent: -17.4 }],
        });
      }
      return oddsMappingPayload({
        response: [
          {
            league: { id: 39, season: 2026 },
            fixture: { id: 1576052 },
            update: '2026-07-05T12:00:00+00:00',
            odds: '2.00',
            model_probability: 28,
          },
        ],
      });
    },
  });

  const serialized = JSON.stringify(report);
  for (const forbidden of [
    'SECRET_PROVIDER_TOKEN',
    'SECRET_RAW_TOKEN',
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
});

await testAsync('bookmaker/mapping discovery route requires operator authorization before provider calls', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  let fetchCalls = 0;

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error('provider fetch should not be called');
  };

  try {
    await withOddsReferenceDiscoveryRoute(async ({ POST }) => {
      const response = await POST(
        new Request('https://example.test/api/admin/sports/odds/reference-discovery', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dryRun: true }),
        })
      );
      const result = await readJsonResponse(response);

      assert.equal(result.status, 401);
      assert.equal(result.body.success, false);
      assert.equal(result.body.error, 'Unauthorized');
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

await testAsync('bookmaker/mapping discovery route rejects empty body before provider calls', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  let fetchCalls = 0;

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error('provider fetch should not be called');
  };

  try {
    await withOddsReferenceDiscoveryRoute(async ({ POST }) => {
      const response = await POST(authorizedOddsReferenceDiscoveryRequest({}));
      const result = await readJsonResponse(response);

      assert.equal(result.status, 400);
      assert.equal(result.body.success, false);
      assert.equal(result.body.error, 'Invalid input');
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

await testAsync('bookmaker/mapping discovery route rejects missing or wrong confirmation before provider calls', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  let fetchCalls = 0;

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error('provider fetch should not be called');
  };

  try {
    await withOddsReferenceDiscoveryRoute(async ({ POST }) => {
      for (const body of [
        {
          dryRun: true,
          endpoints: ['bookmakers', 'mapping'],
          maxProviderRequests: 2,
        },
        {
          dryRun: true,
          endpoints: ['bookmakers', 'mapping'],
          maxProviderRequests: 2,
          operatorConfirm: 'WRONG_CONFIRMATION',
        },
      ]) {
        const response = await POST(authorizedOddsReferenceDiscoveryRequest(body));
        const result = await readJsonResponse(response);

        assert.equal(result.status, 400);
        assert.equal(result.body.success, false);
        assert.equal(
          result.body.error,
          'bookmaker/mapping discovery requires explicit operator confirmation'
        );
      }

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

await testAsync('bookmaker/mapping discovery route accepts exact approved body under mocks', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  const originalFootballKey = process.env.API_FOOTBALL_KEY;
  const observedUrls = [];

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  process.env.API_FOOTBALL_KEY = 'dummy-football';
  globalThis.fetch = async (url, init = {}) => {
    observedUrls.push(String(url));
    assert.equal(init.headers['x-apisports-key'], 'dummy-football');
    const parsedUrl = new URL(String(url));
    assert.equal(parsedUrl.searchParams.get('page'), null);
    if (parsedUrl.pathname === '/odds/bookmakers') return jsonResponse(oddsBookmakersPayload());
    if (parsedUrl.pathname === '/odds/mapping') return jsonResponse(oddsMappingPayload());
    throw new Error(`unexpected provider path: ${parsedUrl.pathname}`);
  };

  try {
    await withOddsReferenceDiscoveryRoute(async ({ POST }) => {
      const response = await POST(
        authorizedOddsReferenceDiscoveryRequest({
          dryRun: true,
          endpoints: ['bookmakers', 'mapping'],
          maxProviderRequests: 2,
          operatorConfirm: 'RUN_BOOKMAKER_MAPPING_DISCOVERY_M1_3',
        })
      );
      const result = await readJsonResponse(response);

      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);
      assert.equal(result.body.report.actualProviderRequests, 2);
      assert.equal(result.body.report.estimatedProviderRequests, 2);
      assert.equal(observedUrls.length, 2);
      assert.deepEqual(result.body.report.discoveredBookmakers, [
        { providerBookmakerId: '6', name: 'Bwin' },
        { providerBookmakerId: '8', name: 'Bet365' },
      ]);
      assert.deepEqual(result.body.report.mappingCoverage, [
        {
          league: { id: '39', season: '2026' },
          fixture: { id: '1576052' },
          update: '2026-07-05T12:00:00+00:00',
        },
      ]);
    });
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

await testAsync('bookmaker/mapping discovery route returns success true for non-fatal missing-name warnings', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  const originalFootballKey = process.env.API_FOOTBALL_KEY;
  const observedUrls = [];

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  process.env.API_FOOTBALL_KEY = 'dummy-football';
  globalThis.fetch = async (url, init = {}) => {
    observedUrls.push(String(url));
    assert.equal(init.headers['x-apisports-key'], 'dummy-football');
    const parsedUrl = new URL(String(url));
    assert.equal(parsedUrl.searchParams.get('page'), null);
    if (parsedUrl.pathname === '/odds/bookmakers') {
      return jsonResponse(oddsBookmakersPayload({
        results: 3,
        response: [
          { id: 6, name: 'Bwin' },
          { id: 99 },
          { bookmaker: { id: 8, name: 'Bet365' } },
        ],
      }));
    }
    if (parsedUrl.pathname === '/odds/mapping') return jsonResponse(oddsMappingPayload());
    throw new Error(`unexpected provider path: ${parsedUrl.pathname}`);
  };

  try {
    await withOddsReferenceDiscoveryRoute(async ({ POST }) => {
      const response = await POST(
        authorizedOddsReferenceDiscoveryRequest({
          dryRun: true,
          endpoints: ['bookmakers', 'mapping'],
          maxProviderRequests: 2,
          operatorConfirm: 'RUN_BOOKMAKER_MAPPING_DISCOVERY_M1_3',
        })
      );
      const result = await readJsonResponse(response);
      const bookmakerEndpoint = result.body.report.endpoints.find((endpoint) => endpoint.endpoint === 'bookmakers');

      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);
      assert.equal(result.body.report.actualProviderRequests, 2);
      assert.equal(observedUrls.length, 2);
      assert.deepEqual(result.body.report.stopReasons, []);
      assert.ok(result.body.report.nonFatalWarnings.includes('bookmaker row missing name'));
      assert.equal(bookmakerEndpoint.responseShapeValid, true);
      assert.equal(bookmakerEndpoint.partialBookmakerRows, 1);
      assert.deepEqual(result.body.report.discoveredBookmakers, [
        { providerBookmakerId: '6', name: 'Bwin' },
        { providerBookmakerId: '8', name: 'Bet365' },
      ]);
    });
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

await testAsync('bookmaker/mapping discovery route returns success false on pagination overflow', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  const originalFootballKey = process.env.API_FOOTBALL_KEY;
  const observedUrls = [];

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  process.env.API_FOOTBALL_KEY = 'dummy-football';
  globalThis.fetch = async (url, init = {}) => {
    observedUrls.push(String(url));
    assert.equal(init.headers['x-apisports-key'], 'dummy-football');
    return jsonResponse(oddsBookmakersPayload({ paging: { current: 1, total: 2 } }));
  };

  try {
    await withOddsReferenceDiscoveryRoute(async ({ POST }) => {
      const response = await POST(
        authorizedOddsReferenceDiscoveryRequest({
          dryRun: true,
          endpoints: ['bookmakers', 'mapping'],
          maxProviderRequests: 2,
          operatorConfirm: 'RUN_BOOKMAKER_MAPPING_DISCOVERY_M1_3',
        })
      );
      const result = await readJsonResponse(response);

      assert.equal(result.status, 200);
      assert.equal(result.body.success, false);
      assert.equal(result.body.report.paginationOverflow, true);
      assert.equal(result.body.report.actualProviderRequests, 1);
      assert.equal(observedUrls.length, 1);
      assert.ok(
        result.body.report.stopReasons.includes(
          'provider pagination total exceeds approved page-1 budget for /odds/bookmakers'
        )
      );
    });
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

await testAsync('bookmaker/mapping discovery route returns success false on invalid response shape', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  const originalFootballKey = process.env.API_FOOTBALL_KEY;
  const observedUrls = [];

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  process.env.API_FOOTBALL_KEY = 'dummy-football';
  globalThis.fetch = async (url, init = {}) => {
    observedUrls.push(String(url));
    assert.equal(init.headers['x-apisports-key'], 'dummy-football');
    const parsedUrl = new URL(String(url));
    if (parsedUrl.pathname === '/odds/bookmakers') return jsonResponse(oddsBookmakersPayload());
    if (parsedUrl.pathname === '/odds/mapping') {
      return jsonResponse(oddsMappingPayload({
        response: [{ league: { id: 39, season: 2026 }, fixture: {}, update: null }],
      }));
    }
    throw new Error(`unexpected provider path: ${parsedUrl.pathname}`);
  };

  try {
    await withOddsReferenceDiscoveryRoute(async ({ POST }) => {
      const response = await POST(
        authorizedOddsReferenceDiscoveryRequest({
          dryRun: true,
          endpoints: ['bookmakers', 'mapping'],
          maxProviderRequests: 2,
          operatorConfirm: 'RUN_BOOKMAKER_MAPPING_DISCOVERY_M1_3',
        })
      );
      const result = await readJsonResponse(response);

      assert.equal(result.status, 200);
      assert.equal(result.body.success, false);
      assert.equal(result.body.report.actualProviderRequests, 2);
      assert.equal(observedUrls.length, 2);
      assert.ok(
        result.body.report.stopReasons.includes(
          'provider response shape differs from expected evidence for /odds/mapping'
        )
      );
    });
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
    return jsonResponse({ errors: [], paging: { current: 1, total: 1 }, response: [] });
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
      assert.equal(url.searchParams.get('season'), null);
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
      season: '2026',
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
    assert.ok(observedUrl.includes('season=2026'));
    assert.equal(observedHeaders['x-apisports-key'], 'dummy-football');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await testAsync('ApiFootballAdapter.fetchFixtures rejects league filter without season before any network call', async () => {
  const originalFetch = globalThis.fetch;
  const { ApiFootballAdapter } = require(path.join(buildDir, 'lib/providers/adapters/api-football.js'));
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls++;
    return jsonResponse({ errors: [], response: [] });
  };

  try {
    await assert.rejects(
      () =>
        new ApiFootballAdapter().fetchFixtures({
          competitionIds: ['39'],
          dateFrom: '2026-08-15',
          dateTo: '2026-08-15',
        }),
      (err) => err.name === 'ProviderError' && /season/.test(err.message)
    );
    assert.equal(fetchCalls, 0, 'must fail before any network call');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await testAsync('ApiFootballAdapter.fetchFixtures stops on multi-page responses instead of silently truncating', async () => {
  const originalFetch = globalThis.fetch;
  const { ApiFootballAdapter } = require(path.join(buildDir, 'lib/providers/adapters/api-football.js'));

  globalThis.fetch = async () =>
    jsonResponse({ errors: [], response: [{}], paging: { current: 1, total: 3 } });

  try {
    await assert.rejects(
      () =>
        new ApiFootballAdapter().fetchFixtures({
          competitionIds: ['39'],
          season: '2026',
          dateFrom: '2026-08-15',
          dateTo: '2026-08-15',
        }),
      (err) =>
        err.name === 'ProviderError' &&
        /pagination overflow/.test(err.message) &&
        /spans 3 pages/.test(err.message)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await testAsync('ApiFootballAdapter.fetchFixtures blocks malformed paging.total instead of coercing it past the guard', async () => {
  const originalFetch = globalThis.fetch;
  const { ApiFootballAdapter } = require(path.join(buildDir, 'lib/providers/adapters/api-football.js'));

  const malformedPagings = [
    { current: 1, total: 'abc' }, // Number('abc') = NaN — used to slip past Number.isFinite guard
    { current: 1, total: '' },    // Number('') = 0 — used to coerce to a passing value
    { current: 1, total: null },  // Number(null) = 0 — same silent coercion
    { current: 1, total: 2.5 },   // non-integer page count is shape drift
    { current: 1, total: -1 },    // negative page count is shape drift
    { current: 1 },               // total absent
    undefined,                    // paging object absent entirely
  ];

  try {
    for (const paging of malformedPagings) {
      globalThis.fetch = async () => jsonResponse({ errors: [], paging, response: [{}] });

      await assert.rejects(
        () =>
          new ApiFootballAdapter().fetchFixtures({
            competitionIds: ['39'],
            season: '2026',
            dateFrom: '2026-08-21',
            dateTo: '2026-08-21',
          }),
        (err) =>
          err.name === 'ProviderError' &&
          err.kind === 'invalid_response' &&
          /missing or malformed paging\.total/.test(err.message),
        `paging=${JSON.stringify(paging)} must block, not silently ingest page 1`
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await testAsync('ApiFootballAdapter.fetchFixtures accepts explicit single-page envelopes (paging.total 1 and 0)', async () => {
  const originalFetch = globalThis.fetch;
  const { ApiFootballAdapter } = require(path.join(buildDir, 'lib/providers/adapters/api-football.js'));

  try {
    // total: 1 with fixtures — the standard single-page envelope still passes.
    globalThis.fetch = async () => jsonResponse(footballPayload());
    const rows = await new ApiFootballAdapter().fetchFixtures({
      competitionIds: ['39'],
      season: '2026',
      dateFrom: '2026-08-21',
      dateTo: '2026-08-21',
    });
    assert.equal(rows.length, 1);

    // total: 0 with an empty response — an empty match day cannot be truncated.
    globalThis.fetch = async () =>
      jsonResponse({ errors: [], paging: { current: 1, total: 0 }, response: [] });
    const emptyRows = await new ApiFootballAdapter().fetchFixtures({
      competitionIds: ['39'],
      season: '2026',
      dateFrom: '2026-08-21',
      dateTo: '2026-08-21',
    });
    assert.equal(emptyRows.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await testAsync('ApiFootballAdapter.fetchFixtures blocks paging.total=0 with a non-empty response as inconsistent', async () => {
  const originalFetch = globalThis.fetch;
  const { ApiFootballAdapter } = require(path.join(buildDir, 'lib/providers/adapters/api-football.js'));

  globalThis.fetch = async () =>
    jsonResponse({
      errors: [],
      paging: { current: 1, total: 0 },
      response: footballPayload().response,
    });

  try {
    await assert.rejects(
      () =>
        new ApiFootballAdapter().fetchFixtures({
          competitionIds: ['39'],
          season: '2026',
          dateFrom: '2026-08-21',
          dateTo: '2026-08-21',
        }),
      (err) =>
        err.name === 'ProviderError' &&
        err.kind === 'invalid_response' &&
        /paging\.total=0 but contains rows/.test(err.message),
      'total=0 alongside rows is an inconsistent envelope and must block'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await testAsync('providerFetch sends redirect:"error" so provider auth headers never follow a redirect', async () => {
  const originalFetch = globalThis.fetch;
  const { providerFetch } = require(path.join(buildDir, 'lib/providers/http.js'));
  let observedInit = null;

  globalThis.fetch = async (url, init = {}) => {
    observedInit = init;
    return jsonResponse({ ok: true });
  };

  try {
    await providerFetch('api_football', 'https://v3.football.api-sports.io/fixtures?date=2026-08-21', {
      headers: { 'x-apisports-key': 'SECRET_KEY' },
    });
    assert.equal(observedInit.redirect, 'error', 'fetch must be called with redirect:"error"');
    assert.ok(observedInit.signal, 'fetch must receive the timeout abort signal');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await testAsync('providerFetch maps a redirect rejection to a sanitized network error', async () => {
  const originalFetch = globalThis.fetch;
  const { providerFetch } = require(path.join(buildDir, 'lib/providers/http.js'));

  // With redirect:'error', undici rejects the fetch promise on any 3xx.
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed: unexpected redirect');
  };

  try {
    await assert.rejects(
      () =>
        providerFetch(
          'sportmonks',
          'https://api.sportmonks.com/v3/football/fixtures/date/2026-08-21?api_token=SECRET_TOKEN'
        ),
      (err) =>
        err.name === 'ProviderError' &&
        err.kind === 'network' &&
        !err.message.includes('SECRET_TOKEN')
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await testAsync('providerFetch timeout stays armed through the response body read', async () => {
  const originalFetch = globalThis.fetch;
  const { providerFetch } = require(path.join(buildDir, 'lib/providers/http.js'));

  // Simulate headers arriving instantly while the body read hangs until the
  // abort signal fires — as undici behaves when a provider stalls mid-body.
  globalThis.fetch = async (url, init = {}) => ({
    ok: true,
    status: 200,
    json: () =>
      new Promise((_, reject) => {
        const signal = init.signal;
        if (signal?.aborted) {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          return;
        }
        signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        );
      }),
  });

  try {
    await assert.rejects(
      () =>
        providerFetch('api_football', 'https://v3.football.api-sports.io/fixtures?date=2026-08-21', {
          timeoutMs: 40,
        }),
      (err) => err.name === 'ProviderError' && err.kind === 'timeout',
      'a body read that outlives timeoutMs must reject as a provider timeout'
    );
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

// --- M1.2.e.2.b.2 SportMonks mapping discovery (Decision #043) ---

function clearCompiledSportmonksDiscoveryModules() {
  for (const relPath of [
    'app/api/admin/sports/mapping/sportmonks-discovery/route.js',
    'lib/providers/sportmonks-mapping-discovery.js',
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

function stubAdminClientModule({ fixtures, links }) {
  const adminPath = path.join(buildDir, 'lib/supabase/admin.js');
  require.cache[require.resolve(adminPath)] = {
    id: adminPath,
    filename: adminPath,
    loaded: true,
    exports: {
      createAdminClient() {
        return {
          from(table) {
            const rows = table === 'canonical_fixtures' ? fixtures : links;
            const builder = {
              select() {
                return builder;
              },
              eq() {
                return builder;
              },
              async in() {
                return { data: rows, error: null };
              },
            };
            return builder;
          },
        };
      },
    },
  };
}

function sportmonksFixture(id, home, away, startingAt) {
  return {
    id,
    name: `${home} vs ${away}`,
    league_id: 8,
    season_id: 25583,
    state_id: 1,
    starting_at: startingAt,
    participants: [
      { id: id * 10 + 1, name: home, meta: { location: 'home' } },
      { id: id * 10 + 2, name: away, meta: { location: 'away' } },
    ],
  };
}

function sportmonksEnvelope(fixtures, { hasMore = false } = {}) {
  return {
    data: fixtures,
    pagination: { count: fixtures.length, per_page: 50, current_page: 1, has_more: hasMore },
    rate_limit: { resets_in_seconds: 3599, remaining: 1999, requested_entity: 'Fixture' },
    timezone: 'UTC',
  };
}

const DISCOVERY_TARGET_A = '11111111-1111-4111-8111-111111111111';
const DISCOVERY_TARGET_B = '22222222-2222-4222-8222-222222222222';

function discoveryDbRows() {
  return {
    fixtures: [
      {
        id: DISCOVERY_TARGET_A,
        sport: 'football',
        status: 'scheduled',
        kickoff_at: '2026-08-15T14:00:00+00:00',
        competition_name: 'Premier League',
        competition_country: 'England',
        season: '2026',
      },
      {
        id: DISCOVERY_TARGET_B,
        sport: 'football',
        status: 'scheduled',
        kickoff_at: '2026-08-15T16:30:00+00:00',
        competition_name: 'Premier League',
        competition_country: 'England',
        season: '2026',
      },
    ],
    links: [
      {
        canonical_fixture_id: DISCOVERY_TARGET_A,
        raw_provider_payload: { teams: { home: { name: 'Arsenal' }, away: { name: 'Chelsea' } } },
      },
      {
        canonical_fixture_id: DISCOVERY_TARGET_B,
        raw_provider_payload: { teams: { home: { name: 'Cardiff MET' }, away: { name: 'Barry Town' } } },
      },
    ],
  };
}

async function withSportmonksDiscoveryRoute(fn) {
  return withCompiledAlias(async () => {
    clearCompiledSportmonksDiscoveryModules();
    stubAdminClientModule(discoveryDbRows());
    const route = require(path.join(buildDir, 'app/api/admin/sports/mapping/sportmonks-discovery/route.js'));
    try {
      return await fn(route);
    } finally {
      clearCompiledSportmonksDiscoveryModules();
    }
  });
}

function authorizedSportmonksDiscoveryRequest(body) {
  return new Request('https://example.test/api/admin/sports/mapping/sportmonks-discovery', {
    method: 'POST',
    headers: {
      authorization: 'Bearer operator-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('sportmonks discovery: normalizeTeamName strips punctuation, case, and club suffixes', () => {
  clearCompiledSportmonksDiscoveryModules();
  const lib = require(path.join(buildDir, 'lib/providers/sportmonks-mapping-discovery.js'));

  assert.equal(lib.normalizeTeamName('Cardiff MET FC'), 'cardiff met');
  assert.equal(lib.normalizeTeamName('  Barry Town '), 'barry town');
  assert.equal(lib.normalizeTeamName('AFC Bournemouth'), 'bournemouth');
  assert.equal(lib.normalizeTeamName(null), '');
});

test('sportmonks discovery: classifyCandidate grades exact, fuzzy, and swapped orientations', () => {
  const lib = require(path.join(buildDir, 'lib/providers/sportmonks-mapping-discovery.js'));

  const exact = lib.classifyCandidate(
    { homeTeamName: 'Arsenal', awayTeamName: 'Chelsea' },
    sportmonksFixture(1, 'Arsenal', 'Chelsea', '2026-08-15 14:00:00')
  );
  assert.equal(exact.confidence, 'exact');

  const fuzzy = lib.classifyCandidate(
    { homeTeamName: 'Cardiff MET', awayTeamName: 'Barry Town' },
    sportmonksFixture(2, 'Cardiff Metropolitan University', 'Barry Town United', '2026-08-15 14:00:00')
  );
  assert.equal(fuzzy.confidence, 'high');

  const swapped = lib.classifyCandidate(
    { homeTeamName: 'Arsenal', awayTeamName: 'Chelsea' },
    sportmonksFixture(3, 'Chelsea', 'Arsenal', '2026-08-15 14:00:00')
  );
  assert.equal(swapped.confidence, 'needs_review');
});

test('sportmonks discovery: matchTargetAgainstFixtures returns not_found and blocks ambiguity', () => {
  const lib = require(path.join(buildDir, 'lib/providers/sportmonks-mapping-discovery.js'));
  const target = {
    canonicalFixtureId: DISCOVERY_TARGET_A,
    sport: 'football',
    status: 'scheduled',
    kickoffAt: '2026-08-15T14:00:00+00:00',
    competitionName: 'Premier League',
    competitionCountry: 'England',
    season: '2026',
    homeTeamName: 'Arsenal',
    awayTeamName: 'Chelsea',
  };

  const notFound = lib.matchTargetAgainstFixtures(target, [
    sportmonksFixture(1, 'Arsenal', 'Chelsea', '2026-08-15 19:00:00'),
  ]);
  assert.equal(notFound.status, 'not_found');
  assert.equal(notFound.eligibleForProviderLink, false);

  const ambiguous = lib.matchTargetAgainstFixtures(target, [
    sportmonksFixture(1, 'Arsenal', 'Chelsea', '2026-08-15 14:00:00'),
    sportmonksFixture(2, 'Arsenal', 'Chelsea', '2026-08-15 14:00:00'),
  ]);
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.eligibleForProviderLink, false);

  const matched = lib.matchTargetAgainstFixtures(target, [
    sportmonksFixture(1, 'Arsenal', 'Chelsea', '2026-08-15 14:00:00'),
    sportmonksFixture(2, 'Everton', 'Fulham', '2026-08-15 16:30:00'),
  ]);
  assert.equal(matched.status, 'matched');
  assert.equal(matched.confidence, 'exact');
  assert.equal(matched.eligibleForProviderLink, true);
  assert.equal(matched.candidate.sportmonksFixtureId, '1');
});

await testAsync('sportmonks discovery: one header-auth request per date, token never in URL, sanitized report', async () => {
  const originalFetch = globalThis.fetch;
  const observed = [];

  clearCompiledSportmonksDiscoveryModules();
  stubAdminClientModule(discoveryDbRows());
  const lib = require(path.join(buildDir, 'lib/providers/sportmonks-mapping-discovery.js'));

  globalThis.fetch = async (url, init = {}) => {
    observed.push({ url: String(url), headers: init.headers ?? {} });
    return jsonResponse(
      sportmonksEnvelope([
        sportmonksFixture(101, 'Arsenal', 'Chelsea', '2026-08-15 14:00:00'),
        sportmonksFixture(102, 'Cardiff Metropolitan University', 'Barry Town United', '2026-08-15 16:30:00'),
      ])
    );
  };

  try {
    const report = await lib.runSportMonksMappingDiscovery({
      canonicalFixtureIds: [DISCOVERY_TARGET_A, DISCOVERY_TARGET_B],
      sportmonksLeagueId: '8',
    });

    assert.equal(observed.length, 1, 'both same-day targets must share one provider request');
    const url = new URL(observed[0].url);
    assert.ok(url.pathname.endsWith('/fixtures/date/2026-08-15'));
    assert.equal(url.searchParams.get('filters'), 'fixtureLeagues:8');
    assert.equal(url.searchParams.get('include'), 'participants;league;state');
    assert.equal(url.searchParams.get('per_page'), '50');
    assert.equal(url.searchParams.get('timezone'), null, 'timezone must stay UTC (omitted)');
    assert.equal(url.searchParams.get('api_token'), null, 'token must never be in the URL');
    assert.equal(observed[0].headers.Authorization, 'dummy-sportmonks');

    assert.equal(report.providerRequestsUsed, 1);
    assert.equal(report.writes, 'none');
    assert.equal(report.stopReasons.length, 0);

    const targetA = report.targets.find((t) => t.canonicalFixtureId === DISCOVERY_TARGET_A);
    const targetB = report.targets.find((t) => t.canonicalFixtureId === DISCOVERY_TARGET_B);
    assert.equal(targetA.status, 'matched');
    assert.equal(targetA.confidence, 'exact');
    assert.equal(targetA.eligibleForProviderLink, true);
    assert.equal(targetA.candidate.sportmonksFixtureId, '101');
    assert.equal(targetB.status, 'matched');
    assert.equal(targetB.confidence, 'high');
    assert.equal(targetB.candidate.sportmonksFixtureId, '102');

    const serialized = JSON.stringify(report);
    for (const forbidden of ['dummy-sportmonks', 'api_token', 'rawProviderPayload', 'raw_provider_payload', 'model_probability', 'edge_percent', 'odds']) {
      assert.equal(serialized.includes(forbidden), false, `forbidden artifact leaked: ${forbidden}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    clearCompiledSportmonksDiscoveryModules();
  }
});

await testAsync('sportmonks discovery: has_more=true stops on page 1 and blocks mapping', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  clearCompiledSportmonksDiscoveryModules();
  stubAdminClientModule(discoveryDbRows());
  const lib = require(path.join(buildDir, 'lib/providers/sportmonks-mapping-discovery.js'));

  globalThis.fetch = async () => {
    fetchCalls++;
    return jsonResponse(
      sportmonksEnvelope([sportmonksFixture(101, 'Arsenal', 'Chelsea', '2026-08-15 14:00:00')], { hasMore: true })
    );
  };

  try {
    const report = await lib.runSportMonksMappingDiscovery({
      canonicalFixtureIds: [DISCOVERY_TARGET_A],
      sportmonksLeagueId: '8',
    });

    assert.equal(fetchCalls, 1, 'no page 2 request is ever made');
    assert.equal(report.stopReasons.length, 1);
    assert.ok(report.stopReasons[0].includes('has_more=true'));
    assert.equal(report.targets[0].status, 'ambiguous');
    assert.equal(report.targets[0].eligibleForProviderLink, false);
  } finally {
    globalThis.fetch = originalFetch;
    clearCompiledSportmonksDiscoveryModules();
  }
});

await testAsync('sportmonks discovery route requires operator authorization before provider calls', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  let fetchCalls = 0;

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error('provider fetch should not be called');
  };

  try {
    await withSportmonksDiscoveryRoute(async ({ POST }) => {
      const response = await POST(
        new Request('https://example.test/api/admin/sports/mapping/sportmonks-discovery', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dryRun: true }),
        })
      );
      const result = await readJsonResponse(response);

      assert.equal(result.status, 401);
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

await testAsync('sportmonks discovery route pins the approved scope literals and confirmation', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  let fetchCalls = 0;

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error('provider fetch should not be called');
  };

  try {
    await withSportmonksDiscoveryRoute(async ({ POST }) => {
      const wrongLeague = await POST(
        authorizedSportmonksDiscoveryRequest({
          dryRun: true,
          provider: 'sportmonks',
          sportmonksLeagueId: '501',
          canonicalFixtureIds: [DISCOVERY_TARGET_A],
          maxProviderRequests: 2,
          operatorConfirm: 'RUN_SPORTMONKS_MAPPING_DISCOVERY_M1_2_E_2_B_2',
        })
      );
      assert.equal((await readJsonResponse(wrongLeague)).status, 400);

      const wrongConfirm = await POST(
        authorizedSportmonksDiscoveryRequest({
          dryRun: true,
          provider: 'sportmonks',
          sportmonksLeagueId: '8',
          canonicalFixtureIds: [DISCOVERY_TARGET_A],
          maxProviderRequests: 2,
          operatorConfirm: 'WRONG',
        })
      );
      const wrongConfirmResult = await readJsonResponse(wrongConfirm);
      assert.equal(wrongConfirmResult.status, 400);
      assert.ok(wrongConfirmResult.body.error.includes('operator confirmation'));

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

await testAsync('sportmonks discovery route accepts the exact approved body under mocks', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  globalThis.fetch = async () =>
    jsonResponse(sportmonksEnvelope([sportmonksFixture(101, 'Arsenal', 'Chelsea', '2026-08-15 14:00:00')]));

  try {
    await withSportmonksDiscoveryRoute(async ({ POST }) => {
      const response = await POST(
        authorizedSportmonksDiscoveryRequest({
          dryRun: true,
          provider: 'sportmonks',
          sportmonksLeagueId: '8',
          canonicalFixtureIds: [DISCOVERY_TARGET_A],
          maxProviderRequests: 2,
          operatorConfirm: 'RUN_SPORTMONKS_MAPPING_DISCOVERY_M1_2_E_2_B_2',
        })
      );
      const result = await readJsonResponse(response);

      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);
      assert.equal(result.body.report.writes, 'none');
      assert.equal(result.body.report.targets[0].status, 'matched');
      assert.equal(result.body.report.targets[0].confidence, 'exact');
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

// --- M1.2.e.2.b.3 SportMonks provider-link write (Decision #045) ---

const LINK_WRITE_FIXTURE_ID = '92afd570-399a-48b9-915a-e1ffaf52a71c';
const LINK_WRITE_SPORTMONKS_ID = '19722203';
const LINK_WRITE_CONFIRM = 'WRITE_SPORTMONKS_PROVIDER_LINK_M1_2_E_2_B_3';

function clearCompiledProviderLinkModules() {
  for (const relPath of [
    'app/api/admin/sports/mapping/provider-link/route.js',
    'lib/providers/sportmonks-provider-link-write.js',
    'lib/providers/sportmonks-mapping-discovery.js',
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

function healthyLinkWriteDb(overrides = {}) {
  return {
    fixtureRow: {
      id: LINK_WRITE_FIXTURE_ID,
      sport: 'football',
      status: 'scheduled',
      kickoff_at: '2026-08-21T19:00:00+00:00',
    },
    apiFootballLinkRow: { canonical_fixture_id: LINK_WRITE_FIXTURE_ID },
    sportmonksLinkByFixture: null,
    sportmonksClaimRow: null,
    insertError: null,
    inserts: [],
    ...overrides,
  };
}

function stubProviderLinkAdminModule(db) {
  const adminPath = path.join(buildDir, 'lib/supabase/admin.js');
  require.cache[require.resolve(adminPath)] = {
    id: adminPath,
    filename: adminPath,
    loaded: true,
    exports: {
      createAdminClient() {
        return {
          from(table) {
            const filters = {};
            const builder = {
              select() {
                return builder;
              },
              eq(column, value) {
                filters[column] = value;
                return builder;
              },
              async maybeSingle() {
                if (table === 'canonical_fixtures') return { data: db.fixtureRow, error: null };
                if (filters.provider === 'api_football') return { data: db.apiFootballLinkRow, error: null };
                if (filters.provider === 'sportmonks' && 'canonical_fixture_id' in filters) {
                  return { data: db.sportmonksLinkByFixture, error: null };
                }
                if (filters.provider === 'sportmonks' && 'provider_fixture_id' in filters) {
                  return { data: db.sportmonksClaimRow, error: null };
                }
                return { data: null, error: null };
              },
              async insert(row) {
                db.inserts.push({ table, row });
                return { error: db.insertError };
              },
            };
            return builder;
          },
        };
      },
    },
  };
}

async function withProviderLinkRoute(db, fn) {
  return withCompiledAlias(async () => {
    clearCompiledProviderLinkModules();
    stubProviderLinkAdminModule(db);
    const route = require(path.join(buildDir, 'app/api/admin/sports/mapping/provider-link/route.js'));
    try {
      return await fn(route);
    } finally {
      clearCompiledProviderLinkModules();
    }
  });
}

function providerLinkRequest(body, token = 'operator-token') {
  return new Request('https://example.test/api/admin/sports/mapping/provider-link', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function approvedProviderLinkBody(overrides = {}) {
  return {
    dryRun: true,
    provider: 'sportmonks',
    canonicalFixtureId: LINK_WRITE_FIXTURE_ID,
    sportmonksFixtureId: LINK_WRITE_SPORTMONKS_ID,
    operatorConfirm: LINK_WRITE_CONFIRM,
    ...overrides,
  };
}

async function withProviderLinkEnv({ writeFlag }, fn) {
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  const originalFlag = process.env.SPORTS_PROVIDER_LINK_WRITE_ENABLED;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
  if (writeFlag === undefined) {
    delete process.env.SPORTS_PROVIDER_LINK_WRITE_ENABLED;
  } else {
    process.env.SPORTS_PROVIDER_LINK_WRITE_ENABLED = writeFlag;
  }
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error('provider-link write must never call the network');
  };

  try {
    await fn();
    assert.equal(fetchCalls, 0, 'provider-link write made a network call');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
    else process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = originalToken;
    if (originalFlag === undefined) delete process.env.SPORTS_PROVIDER_LINK_WRITE_ENABLED;
    else process.env.SPORTS_PROVIDER_LINK_WRITE_ENABLED = originalFlag;
  }
}

await testAsync('provider-link route: dry-run approved body passes preflight, zero provider calls, zero writes', async () => {
  await withProviderLinkEnv({ writeFlag: undefined }, async () => {
    const db = healthyLinkWriteDb();
    await withProviderLinkRoute(db, async ({ POST }) => {
      const response = await POST(providerLinkRequest(approvedProviderLinkBody()));
      const result = await readJsonResponse(response);

      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);
      assert.equal(result.body.report.writes, 'none');
      assert.equal(result.body.report.preflight.passed, true);
      assert.equal(result.body.report.providerRequestsUsed, 0);
      assert.equal(result.body.report.wrote, null);
      assert.equal(db.inserts.length, 0);
    });
  });
});

await testAsync('provider-link route: rejects any body outside the pinned Decision #045 scope', async () => {
  await withProviderLinkEnv({ writeFlag: undefined }, async () => {
    const badBodies = [
      approvedProviderLinkBody({ canonicalFixtureId: '11111111-1111-4111-8111-111111111111' }),
      approvedProviderLinkBody({ sportmonksFixtureId: '99999999' }),
      approvedProviderLinkBody({ provider: 'api_football' }),
      approvedProviderLinkBody({ extraField: true }),
    ];

    const db = healthyLinkWriteDb();
    await withProviderLinkRoute(db, async ({ POST }) => {
      for (const body of badBodies) {
        const response = await POST(providerLinkRequest(body));
        assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(body)}`);
      }
      assert.equal(db.inserts.length, 0);
    });
  });
});

await testAsync('provider-link route: rejects a wrong confirmation phrase', async () => {
  await withProviderLinkEnv({ writeFlag: 'true' }, async () => {
    const db = healthyLinkWriteDb();
    await withProviderLinkRoute(db, async ({ POST }) => {
      const response = await POST(
        providerLinkRequest(approvedProviderLinkBody({ dryRun: false, operatorConfirm: 'WRITE_SOMETHING_ELSE' }))
      );
      const result = await readJsonResponse(response);

      assert.equal(result.status, 400);
      assert.match(result.body.error, /operator confirmation/);
      assert.equal(db.inserts.length, 0);
    });
  });
});

await testAsync('provider-link route: 503 without configured operator token, 401 with a wrong bearer', async () => {
  const originalToken = process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
  delete process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;

  try {
    const db = healthyLinkWriteDb();
    await withProviderLinkRoute(db, async ({ POST }) => {
      const missing = await POST(providerLinkRequest(approvedProviderLinkBody()));
      assert.equal(missing.status, 503);

      process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = 'operator-token';
      const wrong = await POST(providerLinkRequest(approvedProviderLinkBody(), 'not-the-token'));
      assert.equal(wrong.status, 401);
      assert.equal(db.inserts.length, 0);
    });
  } finally {
    if (originalToken === undefined) delete process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN;
    else process.env.SPORTS_FIXTURE_SYNC_OPERATOR_TOKEN = originalToken;
  }
});

await testAsync('provider-link write: env flag off blocks the write even with dryRun=false + confirmation', async () => {
  await withProviderLinkEnv({ writeFlag: undefined }, async () => {
    const db = healthyLinkWriteDb();
    await withProviderLinkRoute(db, async ({ POST }) => {
      const response = await POST(providerLinkRequest(approvedProviderLinkBody({ dryRun: false })));
      const result = await readJsonResponse(response);

      assert.equal(result.status, 200);
      assert.equal(result.body.report.writeEnabled, false);
      assert.equal(result.body.report.writes, 'none');
      assert.equal(result.body.report.wrote, null);
      assert.equal(db.inserts.length, 0);
    });
  });
});

await testAsync('provider-link write: full gate writes exactly one pinned row', async () => {
  await withProviderLinkEnv({ writeFlag: 'true' }, async () => {
    const db = healthyLinkWriteDb();
    await withProviderLinkRoute(db, async ({ POST }) => {
      const response = await POST(providerLinkRequest(approvedProviderLinkBody({ dryRun: false })));
      const result = await readJsonResponse(response);

      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);
      assert.equal(result.body.report.writes, 'single_provider_link');
      assert.equal(result.body.report.wrote.insertedProviderLinks, 1);
      assert.equal(result.body.report.wrote.failedWrites, 0);

      assert.equal(db.inserts.length, 1);
      const { table, row } = db.inserts[0];
      assert.equal(table, 'fixture_provider_links');
      assert.equal(row.canonical_fixture_id, LINK_WRITE_FIXTURE_ID);
      assert.equal(row.provider, 'sportmonks');
      assert.equal(row.provider_fixture_id, LINK_WRITE_SPORTMONKS_ID);
      assert.equal(row.mapping_confidence, 'high');
      assert.equal(row.mapping_method, 'name_time_match');
      assert.equal(row.raw_provider_payload.source, 'sportmonks-mapping-discovery');
      assert.match(row.raw_provider_payload.discoveryRunId, /^sportmonks-mapping-discovery-/);
      assert.equal(row.raw_provider_payload.candidate.sportmonksFixtureId, LINK_WRITE_SPORTMONKS_ID);
      assert.match(row.sync_run_id, /^sportmonks-provider-link-write-/);
      assert.equal(row.provider_updated_at, null);
    });
  });
});

await testAsync('provider-link write: identical existing link is idempotent — alreadyLinked, no insert', async () => {
  await withProviderLinkEnv({ writeFlag: 'true' }, async () => {
    const db = healthyLinkWriteDb({
      sportmonksLinkByFixture: { provider_fixture_id: LINK_WRITE_SPORTMONKS_ID },
      sportmonksClaimRow: { canonical_fixture_id: LINK_WRITE_FIXTURE_ID },
    });
    await withProviderLinkRoute(db, async ({ POST }) => {
      const response = await POST(providerLinkRequest(approvedProviderLinkBody({ dryRun: false })));
      const result = await readJsonResponse(response);

      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);
      assert.equal(result.body.report.alreadyLinked, true);
      assert.equal(result.body.report.writes, 'none');
      assert.equal(db.inserts.length, 0);
    });
  });
});

await testAsync('provider-link write: conflicting sportmonks link on the fixture blocks the write', async () => {
  await withProviderLinkEnv({ writeFlag: 'true' }, async () => {
    const db = healthyLinkWriteDb({
      sportmonksLinkByFixture: { provider_fixture_id: '55555555' },
    });
    await withProviderLinkRoute(db, async ({ POST }) => {
      const response = await POST(providerLinkRequest(approvedProviderLinkBody({ dryRun: false })));
      const result = await readJsonResponse(response);

      assert.equal(result.status, 200);
      assert.equal(result.body.success, false);
      assert.equal(result.body.report.preflight.passed, false);
      assert.equal(result.body.report.writes, 'none');
      assert.equal(db.inserts.length, 0);
    });
  });
});

await testAsync('provider-link write: provider_fixture_id claimed by another fixture blocks the write', async () => {
  await withProviderLinkEnv({ writeFlag: 'true' }, async () => {
    const db = healthyLinkWriteDb({
      sportmonksClaimRow: { canonical_fixture_id: '33333333-3333-4333-8333-333333333333' },
    });
    await withProviderLinkRoute(db, async ({ POST }) => {
      const response = await POST(providerLinkRequest(approvedProviderLinkBody({ dryRun: false })));
      const result = await readJsonResponse(response);

      assert.equal(result.status, 200);
      assert.equal(result.body.success, false);
      assert.equal(result.body.report.preflight.passed, false);
      assert.equal(db.inserts.length, 0);
    });
  });
});

await testAsync('provider-link write: kickoff drift from the discovery evidence blocks the write', async () => {
  await withProviderLinkEnv({ writeFlag: 'true' }, async () => {
    const db = healthyLinkWriteDb({
      fixtureRow: {
        id: LINK_WRITE_FIXTURE_ID,
        sport: 'football',
        status: 'scheduled',
        kickoff_at: '2026-08-22T14:00:00+00:00',
      },
    });
    await withProviderLinkRoute(db, async ({ POST }) => {
      const response = await POST(providerLinkRequest(approvedProviderLinkBody({ dryRun: false })));
      const result = await readJsonResponse(response);

      assert.equal(result.status, 200);
      assert.equal(result.body.success, false);
      assert.equal(result.body.report.preflight.passed, false);
      const kickoffCheck = result.body.report.preflight.checks.find(
        (check) => check.name === 'kickoff_minute_matches_discovery'
      );
      assert.equal(kickoffCheck.pass, false);
      assert.equal(db.inserts.length, 0);
    });
  });
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
