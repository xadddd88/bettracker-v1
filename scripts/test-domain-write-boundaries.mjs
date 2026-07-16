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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

test('migration 018: every core table becomes SELECT-only for authenticated (REVOKE ALL covers PG17 MAINTAIN)', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/018_enforce_domain_write_boundaries.sql'), 'utf8');

  for (const table of CORE_TABLES) {
    assert.ok(sql.includes(`REVOKE ALL ON public.${table} FROM PUBLIC;`), `${table}: PUBLIC revoke missing`);
    assert.ok(sql.includes(`REVOKE ALL ON public.${table} FROM anon;`), `${table}: anon revoke missing`);
    // REVOKE ALL (not an enumerated privilege list) — PostgreSQL 17 adds
    // MAINTAIN, which an enumerated revoke would silently leave behind.
    assert.ok(
      sql.includes(`REVOKE ALL ON public.${table} FROM authenticated;`),
      `${table}: authenticated must get REVOKE ALL (enumerated lists miss PG17 MAINTAIN)`
    );
    assert.ok(sql.includes(`GRANT SELECT ON public.${table} TO authenticated;`), `${table}: SELECT grant missing`);
    assert.ok(
      new RegExp(`CREATE POLICY "${table} select own" ON public\\.${table}\\s+FOR SELECT TO authenticated`).test(sql),
      `${table}: FOR SELECT policy missing`
    );
  }

  const active = stripSqlComments(sql);
  assert.ok(!/REVOKE INSERT, UPDATE, DELETE/.test(active), 'no enumerated authenticated revoke may remain');
  assert.ok(!active.includes('FORCE ROW LEVEL SECURITY'), 'FORCE RLS must NOT be enabled (breaks SECURITY DEFINER RPCs)');
  assert.ok(!/CREATE POLICY[^;]*FOR ALL/.test(active), 'no FOR ALL policy may remain in 018');
});

test('migration 018: Phase-A preflight is fail-closed and runs before any REVOKE', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/018_enforce_domain_write_boundaries.sql'), 'utf8');
  const active = stripSqlComments(sql);

  const preflightIdx = active.indexOf('DO $$');
  const firstRevokeIdx = active.indexOf('REVOKE ALL ON public.');
  assert.ok(preflightIdx !== -1, 'Phase-A preflight DO block missing');
  assert.ok(firstRevokeIdx !== -1, 'no revokes found');
  assert.ok(preflightIdx < firstRevokeIdx, 'preflight must run BEFORE the first REVOKE');

  for (const fn of ['persist_analysis_decision', 'save_user_settings', 'complete_onboarding']) {
    assert.ok(active.includes(`to_regprocedure`) && active.includes(fn), `preflight must check ${fn} exists`);
  }
  assert.ok(
    /IF has_function_privilege\('authenticated', v_persist, 'EXECUTE'\) THEN/.test(active),
    'preflight must fail if authenticated can execute persist_analysis_decision'
  );
  assert.ok(
    /IF NOT has_function_privilege\('service_role', v_persist, 'EXECUTE'\) THEN/.test(active),
    'preflight must fail if service_role cannot execute persist_analysis_decision'
  );
  assert.ok((active.match(/RAISE EXCEPTION 'Phase A/g) ?? []).length >= 5, 'preflight must raise on every mismatch');
});

test('migration 017: place_bet_from_decision enforces pending-only + AI trust gate', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/017_prepare_domain_write_boundaries.sql'), 'utf8');

  assert.ok(sql.includes("IF v_decision.final_action <> 'pending' THEN"), 'pending-only check missing');
  assert.ok((sql.match(/RAISE EXCEPTION 'decision_not_placeable'/g) ?? []).length >= 2, 'decision_not_placeable exceptions missing');
  assert.ok(sql.includes("IF v_decision.source = 'ai_analyst' THEN"), 'AI-source trust gate branch missing');
  assert.ok(sql.includes("'quality_gate' -> 'pricingAllowed'"), 'quality_gate.pricingAllowed check missing');
  assert.ok(sql.includes("'trust_view' -> 'showPlaceBet'"), 'trust_view.showPlaceBet check missing');
  assert.ok(/IS DISTINCT FROM 'true'::jsonb/.test(sql), 'trust gate must be NULL-safe fail-closed');
  assert.ok(sql.includes('AND balance >= v_stake'), 'funds guard from #047 must be preserved');
});

test('migration 017: update_decision_action locks the row before the transition', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/017_prepare_domain_write_boundaries.sql'), 'utf8');

  const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION update_decision_action');
  assert.ok(fnStart !== -1, 'update_decision_action replacement missing');
  const fnBody = sql.slice(fnStart, sql.indexOf('$$;', fnStart));
  assert.ok(/SELECT final_action INTO v_current_action FROM decisions[\s\S]*?FOR UPDATE;/.test(fnBody),
    'update_decision_action must read the current action FOR UPDATE');
  assert.ok(fnBody.includes("IF v_current_action = 'placed' THEN"), 'placed guard must run after the lock');
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

test('rollback script exists outside supabase/migrations, is transactional, and restores prior state', () => {
  const rollbackPath = path.join(repoRoot, 'docs/decision-048-rollback.sql');
  assert.ok(existsSync(rollbackPath), 'docs/decision-048-rollback.sql missing');
  assert.ok(!existsSync(path.join(repoRoot, 'supabase/migrations/decision-048-rollback.sql')), 'rollback must NOT live in migrations dir');

  const sql = readFileSync(rollbackPath, 'utf8');
  const active = stripSqlComments(sql);
  const beginIdx = active.indexOf('BEGIN;');
  const commitIdx = active.indexOf('COMMIT;');
  const firstGrantIdx = active.indexOf('GRANT ALL ON public.');
  assert.ok(beginIdx !== -1 && commitIdx !== -1, 'rollback must be wrapped in BEGIN/COMMIT');
  assert.ok(beginIdx < firstGrantIdx && firstGrantIdx < commitIdx, 'all restoration must sit inside the transaction');

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

// ── Recursive sweep: NO direct core-table writes anywhere in app/ ────

test('recursive sweep: no app source writes a core table directly', () => {
  const offenders = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        // Normalize whitespace so chained builders split across lines
        // still match; .select() and .rpc() stay allowed.
        const compact = readFileSync(full, 'utf8').replace(/\s+/g, '');
        for (const table of CORE_TABLES) {
          if (new RegExp(`\\.from\\(['"\`]${table}['"\`]\\)\\.(insert|update|upsert|delete)\\(`).test(compact)) {
            offenders.push(`${path.relative(repoRoot, full)} → ${table}`);
          }
        }
      }
    }
  }

  walk(path.join(repoRoot, 'app'));
  assert.deepEqual(offenders, [], `direct core-table writes found:\n      ${offenders.join('\n      ')}`);
});

// ── Decision #060 Phase A: migration 024 keeps the write boundary ───
test('migration 024: additive only — no direct DML grants, no policy widening', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/024_create_tracked_bet.sql'), 'utf8');
  const sqlNoComments = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  assert.ok(!/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON\s+(public\.)?(bets|bet_legs|bankrolls|bankroll_transactions)/i.test(sqlNoComments),
    'migration 024 must not grant direct DML on protected tables');
  assert.ok(!/CREATE POLICY/i.test(sqlNoComments), 'migration 024 must not add RLS policies');
  assert.ok(!/DROP POLICY/i.test(sqlNoComments), 'migration 024 must not drop RLS policies');
  assert.ok(!/DISABLE ROW LEVEL SECURITY/i.test(sqlNoComments), 'migration 024 must not disable RLS');
  assert.ok(/REVOKE EXECUTE ON FUNCTION public\.create_tracked_bet[\s\S]*?FROM PUBLIC, anon;/.test(sql),
    'create_tracked_bet must be revoked from PUBLIC/anon');
  assert.ok(/GRANT {2}EXECUTE ON FUNCTION public\.create_tracked_bet[\s\S]*?TO authenticated, service_role;/.test(sql),
    'create_tracked_bet EXECUTE surface must be authenticated/service_role only');
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
