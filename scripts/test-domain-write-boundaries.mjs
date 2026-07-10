#!/usr/bin/env node
/**
 * Domain write boundaries suite (Decision #048).
 *
 * Guards the two-phase boundary enforcement:
 *  - migration 017 (additive): server-only Analyst persistence RPC,
 *    save_user_settings, complete_onboarding — with correct EXECUTE
 *    surfaces (persist_analysis_decision is service_role ONLY)
 *  - migration 018 (enforcement): the seven core tables become
 *    SELECT-only for authenticated (REVOKE DML/TRUNCATE/REFERENCES/
 *    TRIGGER; anon/PUBLIC lose everything; FOR ALL policies replaced
 *    by FOR SELECT own-rows); create_decision_with_analysis loses
 *    user EXECUTE (FP-001 bypass closure); NO FORCE RLS
 *  - routes: /api/settings and /api/onboarding/complete write only
 *    via RPC; /api/ai/analyst persists via the admin client with the
 *    session-derived user id, never a body-supplied one
 *  - the emergency rollback script exists outside supabase/migrations
 *
 * Run:  npm run test:domain-write-boundaries
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import Module from 'node:module';
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

function stripSqlComments(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

const CORE_TABLES = [
  'profiles',
  'bankrolls',
  'bankroll_transactions',
  'bets',
  'bet_legs',
  'decisions',
  'ai_analysis_runs',
];

// ── Migration 017 (Phase A — additive) ───────────────────────────────

test('migration 017: server-only Analyst persistence RPC with correct EXECUTE surface', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/017_prepare_domain_write_boundaries.sql'), 'utf8');

  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION persist_analysis_decision('), 'persist_analysis_decision missing');
  assert.ok(sql.includes('p_user_id         uuid'), 'explicit p_user_id parameter missing');
  assert.ok(
    /REVOKE EXECUTE ON FUNCTION persist_analysis_decision[\s\S]*?FROM PUBLIC, anon, authenticated;/.test(sql),
    'persist_analysis_decision must be revoked from PUBLIC/anon/authenticated'
  );
  assert.ok(
    /GRANT {2}EXECUTE ON FUNCTION persist_analysis_decision[\s\S]*?TO service_role;/.test(sql),
    'persist_analysis_decision must be granted to service_role only'
  );
  assert.ok(
    !/GRANT\s+EXECUTE ON FUNCTION persist_analysis_decision\([^)]*\)\s*TO[^;]*authenticated/.test(sql),
    'persist_analysis_decision must NOT be granted to authenticated'
  );
  assert.ok((sql.match(/SECURITY DEFINER/g) ?? []).length >= 3, 'all three functions must be SECURITY DEFINER');
  assert.ok((sql.match(/SET search_path = public/g) ?? []).length >= 3, 'search_path pinning missing');
});

test('migration 017: save_user_settings and complete_onboarding for authenticated', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/017_prepare_domain_write_boundaries.sql'), 'utf8');

  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION save_user_settings('), 'save_user_settings missing');
  assert.ok(sql.includes('GET DIAGNOSTICS'), 'save_user_settings must keep the exactly-one-bankroll currency invariant');
  assert.ok(sql.includes("RAISE EXCEPTION 'No default bankroll found'"), 'no-default-bankroll exception missing');
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION complete_onboarding()'), 'complete_onboarding missing');
  assert.ok(
    /GRANT {2}EXECUTE ON FUNCTION save_user_settings[\s\S]*?TO authenticated, service_role;/.test(sql),
    'save_user_settings grant to authenticated missing'
  );
  assert.ok(
    /GRANT {2}EXECUTE ON FUNCTION complete_onboarding[\s\S]*?TO authenticated, service_role;/.test(sql),
    'complete_onboarding grant to authenticated missing'
  );
});

// ── Migration 018 (Phase B — enforcement) ────────────────────────────

test('migration 018: every core table becomes SELECT-only for authenticated', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/018_enforce_domain_write_boundaries.sql'), 'utf8');

  for (const table of CORE_TABLES) {
    assert.ok(sql.includes(`REVOKE ALL ON public.${table} FROM PUBLIC;`), `${table}: PUBLIC revoke missing`);
    assert.ok(sql.includes(`REVOKE ALL ON public.${table} FROM anon;`), `${table}: anon revoke missing`);
    assert.ok(
      sql.includes(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.${table} FROM authenticated;`),
      `${table}: authenticated DML revoke missing`
    );
    assert.ok(sql.includes(`GRANT SELECT ON public.${table} TO authenticated;`), `${table}: SELECT grant missing`);
    assert.ok(
      new RegExp(`CREATE POLICY "${table} select own" ON public\\.${table}\\s+FOR SELECT TO authenticated`).test(sql),
      `${table}: FOR SELECT policy missing`
    );
  }

  const active = stripSqlComments(sql);
  assert.ok(!active.includes('FORCE ROW LEVEL SECURITY'), 'FORCE RLS must NOT be enabled (breaks SECURITY DEFINER RPCs)');
  assert.ok(!/CREATE POLICY[^;]*FOR ALL/.test(active), 'no FOR ALL policy may remain in 018');
});

test('migration 018: FP-001 bypass closed — old Analyst RPC loses user EXECUTE but is not dropped', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/018_enforce_domain_write_boundaries.sql'), 'utf8');
  const active = stripSqlComments(sql);

  assert.ok(
    /REVOKE EXECUTE ON FUNCTION create_decision_with_analysis\([\s\S]*?\) FROM PUBLIC, anon, authenticated;/.test(active),
    'create_decision_with_analysis EXECUTE revoke missing'
  );
  assert.ok(!active.includes('DROP FUNCTION'), 'old function must be kept until stable verification (dropped later)');
});

test('rollback script exists outside supabase/migrations and restores prior state', () => {
  const rollbackPath = path.join(repoRoot, 'docs/decision-048-rollback.sql');
  assert.ok(existsSync(rollbackPath), 'docs/decision-048-rollback.sql missing');
  assert.ok(!existsSync(path.join(repoRoot, 'supabase/migrations/decision-048-rollback.sql')), 'rollback must NOT live in migrations dir');

  const sql = readFileSync(rollbackPath, 'utf8');
  for (const table of CORE_TABLES) {
    assert.ok(sql.includes(`GRANT ALL ON public.${table} TO anon, authenticated;`), `rollback: ${table} grant restore missing`);
  }
  assert.ok(/FOR ALL TO authenticated/.test(sql), 'rollback: FOR ALL policies restore missing');
  assert.ok(/GRANT EXECUTE ON FUNCTION create_decision_with_analysis/.test(sql), 'rollback: legacy RPC grant restore missing');
});

// ── Analyst route: server-only persistence ───────────────────────────

test('analyst route: persists via admin client with the session-derived user id', () => {
  const src = readFileSync(path.join(repoRoot, 'app/api/ai/analyst/route.ts'), 'utf8');

  assert.ok(!/rpc\(\s*'create_decision_with_analysis'/.test(src), 'analyst route must not call the user-callable legacy RPC');
  assert.ok(src.includes('createAdminClient'), 'analyst route must use the admin client for persistence');
  assert.ok(/adminClient\.rpc\('persist_analysis_decision'/.test(src), 'analyst route must call persist_analysis_decision');
  assert.ok(/p_user_id:\s+user\.id/.test(src), 'p_user_id must come from the authenticated session user');
  assert.ok(!/p_user_id:\s*(body|input|parsed)/.test(src), 'p_user_id must never come from the request body');
});

// ── Route behavior under stubs ───────────────────────────────────────

let currentStub = null;

function makeStubClient(cfg = {}) {
  const calls = { rpc: [], from: [] };
  return {
    calls,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      const result = (cfg.rpcResults ?? {})[name];
      return result ?? { data: null, error: null };
    },
    from(table) {
      const entry = { table, ops: [] };
      calls.from.push(entry);
      const builder = {
        update(values) { entry.ops.push({ op: 'update', values }); return builder; },
        insert(values) { entry.ops.push({ op: 'insert', values }); return builder; },
        select() { return builder; },
        eq() { return builder; },
        async single() { return { data: null, error: null }; },
        then(resolve, reject) { return Promise.resolve({ data: null, error: null }).then(resolve, reject); },
      };
      return builder;
    },
  };
}

function clearCompiledModules() {
  for (const relPath of [
    'app/api/settings/route.js',
    'app/api/onboarding/complete/route.js',
    'lib/supabase/server.js',
    'lib/analytics/server.js',
  ]) {
    const compiledPath = path.join(buildDir, relPath);
    try {
      delete require.cache[require.resolve(compiledPath)];
    } catch {
      // Module may not have been loaded yet.
    }
  }
}

function stubServerModules() {
  const serverPath = path.join(buildDir, 'lib/supabase/server.js');
  require.cache[require.resolve(serverPath)] = {
    id: serverPath, filename: serverPath, loaded: true,
    exports: { createClient: async () => currentStub },
  };
  const analyticsPath = path.join(buildDir, 'lib/analytics/server.js');
  require.cache[require.resolve(analyticsPath)] = {
    id: analyticsPath, filename: analyticsPath, loaded: true,
    exports: { trackServerEvent: async () => {} },
  };
}

async function withRoute(routeRel, stub, fn) {
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      return originalResolveFilename.call(this, path.join(buildDir, request.slice(2)), parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
  try {
    clearCompiledModules();
    currentStub = stub;
    stubServerModules();
    const route = require(path.join(buildDir, routeRel));
    return await fn(route);
  } finally {
    clearCompiledModules();
    currentStub = null;
    Module._resolveFilename = originalResolveFilename;
  }
}

function patchRequest(url, body) {
  return new Request(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

await testAsync('settings route: exactly one save_user_settings RPC call, zero direct table writes', async () => {
  const stub = makeStubClient({
    rpcResults: { save_user_settings: { data: { id: 'user-1', currency: 'EUR', display_name: 'Dima' }, error: null } },
  });

  await withRoute('app/api/settings/route.js', stub, async (route) => {
    const response = await route.PATCH(patchRequest('https://example.test/api/settings', {
      currency: 'EUR', display_name: 'Dima',
    }));
    const result = { status: response.status, body: await response.json() };

    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.currency, 'EUR');

    assert.equal(stub.calls.rpc.length, 1);
    assert.equal(stub.calls.rpc[0].name, 'save_user_settings');
    assert.deepEqual(stub.calls.rpc[0].args, {
      p_display_name: 'Dima',
      p_currency: 'EUR',
      p_default_stake: null,
      p_kelly_fraction: null,
      p_web_search_enabled: null,
      p_timezone: null,
    });

    assert.equal(stub.calls.from.length, 0, 'settings route must not touch tables directly at all');
  });
});

await testAsync('settings route: RPC failure is a hard error (404 for missing bankroll, 500 otherwise)', async () => {
  const noBankroll = makeStubClient({
    rpcResults: { save_user_settings: { data: null, error: { message: 'No default bankroll found' } } },
  });
  await withRoute('app/api/settings/route.js', noBankroll, async (route) => {
    const response = await route.PATCH(patchRequest('https://example.test/api/settings', { currency: 'EUR' }));
    assert.equal(response.status, 404);
  });

  const boom = makeStubClient({
    rpcResults: { save_user_settings: { data: null, error: { message: 'deadlock detected on relation xyz' } } },
  });
  await withRoute('app/api/settings/route.js', boom, async (route) => {
    const response = await route.PATCH(patchRequest('https://example.test/api/settings', { display_name: 'X' }));
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.error, 'Failed to save settings');
    assert.ok(!JSON.stringify(body).includes('deadlock'), 'raw DB error leaked');
  });
});

await testAsync('onboarding route: writes only via complete_onboarding RPC', async () => {
  const stub = makeStubClient({
    rpcResults: { complete_onboarding: { data: { onboarding_completed: true }, error: null } },
  });

  await withRoute('app/api/onboarding/complete/route.js', stub, async (route) => {
    const response = await route.PATCH();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(stub.calls.rpc.length, 1);
    assert.equal(stub.calls.rpc[0].name, 'complete_onboarding');
    assert.equal(stub.calls.from.length, 0, 'onboarding route must not touch profiles directly');
  });
});

// ── Core routes contain no direct core-table writes ──────────────────

test('core route sources contain no direct writes to core tables', () => {
  const routes = [
    'app/api/settings/route.ts',
    'app/api/onboarding/complete/route.ts',
    'app/api/bankroll/deposit/route.ts',
  ];
  const writePattern = new RegExp(
    `from\\('(${CORE_TABLES.join('|')})'\\)\\s*\\.\\s*(update|insert|upsert|delete)`,
    's'
  );
  for (const rel of routes) {
    const src = readFileSync(path.join(repoRoot, rel), 'utf8');
    assert.ok(!writePattern.test(src), `${rel} still writes a core table directly`);
  }
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
