#!/usr/bin/env node
/**
 * Global rate-limit suite (Decision #052).
 *
 * The scanner / analyst / scout / coach / register routes moved off the
 * per-instance in-memory Map onto a durable Postgres counter
 * (rate_limit_check RPC, service_role only). This suite covers:
 *   - lib/rate-limit: calls the RPC with the right key+windows, maps the
 *     result, and FAILS OPEN (allowed) when the store errors
 *   - the five routes no longer keep an in-memory Map and call the helper
 *   - migration 023 static guards (service-role-only table + RPC, atomic
 *     increment, multi-window deny, retry_after)
 *
 * Run:  node scripts/test-rate-limit.mjs   (after build:provider-scripts)
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  try { fn(); console.log(`  ✅  ${name}`); passed++; }
  catch (err) { console.error(`  ❌  ${name}`); console.error(`      ${err.message}`); failed++; }
}
async function testAsync(name, fn) {
  try { await fn(); console.log(`  ✅  ${name}`); passed++; }
  catch (err) { console.error(`  ❌  ${name}`); console.error(`      ${err.message}`); failed++; }
}

// ── lib/rate-limit behavioral (stubbed admin client) ─────────────────

let adminStub = null;
function clearHelper() {
  for (const rel of ['lib/rate-limit.js', 'lib/supabase/admin.js']) {
    try { delete require.cache[require.resolve(path.join(buildDir, rel))]; } catch { /* not loaded */ }
  }
}
function installAdmin() {
  const p = path.join(buildDir, 'lib/supabase/admin.js');
  require.cache[require.resolve(p)] = {
    id: p, filename: p, loaded: true,
    exports: { createAdminClient: () => { if (!adminStub) throw new Error('no service role'); return adminStub; } },
  };
}
async function withHelper(fn) {
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.startsWith('@/')) return orig.call(this, path.join(buildDir, request.slice(2)), parent, isMain, options);
    return orig.call(this, request, parent, isMain, options);
  };
  try {
    clearHelper();
    installAdmin();
    const mod = require(path.join(buildDir, 'lib/rate-limit.js'));
    return await fn(mod);
  } finally {
    clearHelper();
    Module._resolveFilename = orig;
    adminStub = null;
  }
}

await testAsync('rate-limit: calls rate_limit_check with the key and windows, maps allowed/retry', async () => {
  const calls = [];
  adminStub = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { allowed: true, retry_after: 0 }, error: null }; } };
  await withHelper(async ({ enforceRateLimit }) => {
    const res = await enforceRateLimit('analyst:u1', [{ limit: 10, seconds: 60 }, { limit: 200, seconds: 86400 }]);
    assert.equal(res.allowed, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'rate_limit_check');
    assert.equal(calls[0].args.p_key, 'analyst:u1');
    assert.deepEqual(calls[0].args.p_windows, [{ limit: 10, seconds: 60 }, { limit: 200, seconds: 86400 }]);
  });
});

await testAsync('rate-limit: denied result surfaces allowed:false + retryAfter', async () => {
  adminStub = { rpc: async () => ({ data: { allowed: false, retry_after: 42 }, error: null }) };
  await withHelper(async ({ enforceRateLimit }) => {
    const res = await enforceRateLimit('scout:u1', [{ limit: 3, seconds: 60 }]);
    assert.equal(res.allowed, false);
    assert.equal(res.retryAfter, 42);
  });
});

await testAsync('rate-limit: FAILS OPEN when the RPC errors', async () => {
  adminStub = { rpc: async () => ({ data: null, error: { message: 'db down' } }) };
  await withHelper(async ({ enforceRateLimit }) => {
    const res = await enforceRateLimit('scanner:u1', [{ limit: 5, seconds: 60 }]);
    assert.equal(res.allowed, true, 'a limiter outage must not block the route');
  });
});

await testAsync('rate-limit: FAILS OPEN when the admin client is unavailable', async () => {
  adminStub = null; // createAdminClient throws
  await withHelper(async ({ enforceRateLimit }) => {
    const res = await enforceRateLimit('coach:u1', [{ limit: 20, seconds: 86400 }]);
    assert.equal(res.allowed, true);
  });
});

test('rate-limit: RATE_LIMITS config exposes all five routes with sane windows', () => {
  const src = readFileSync(path.join(repoRoot, 'lib/rate-limit.ts'), 'utf8');
  for (const route of ['scanner', 'analyst', 'scout', 'coach', 'register']) {
    assert.ok(new RegExp(`${route}: \\(\\): RateWindow\\[\\]`).test(src), `RATE_LIMITS.${route} missing`);
  }
  assert.ok(/seconds: 86_400/.test(src), 'day window present');
  assert.ok(/seconds: 3_600/.test(src), 'hour window present (register)');
});

// ── Route source: no in-memory Map, uses the helper ──────────────────

test('routes: no in-memory rate-limit Map remains; all call enforceRateLimit', () => {
  const routes = {
    'app/api/ai/scanner/route.ts':   'scanner:',
    'app/api/ai/analyst/route.ts':   'analyst:',
    'app/api/scout/route.ts':        'scout:',
    'app/api/coach/route.ts':        'coach:',
    'app/api/auth/register/route.ts':'register:',
  };
  for (const [rel, keyPrefix] of Object.entries(routes)) {
    const src = readFileSync(path.join(repoRoot, rel), 'utf8');
    assert.ok(!/const rateLimitStore = new Map/.test(src), `${rel}: in-memory Map must be gone`);
    assert.ok(!/function checkRateLimit\(/.test(src), `${rel}: local checkRateLimit must be gone`);
    assert.ok(/enforceRateLimit\(/.test(src), `${rel}: must call enforceRateLimit`);
    assert.ok(src.includes(`\`${keyPrefix}`), `${rel}: must key by ${keyPrefix}`);
  }
});

// ── Migration 023 static guards ──────────────────────────────────────

test('migration 023: service-role-only table + RPC, atomic multi-window deny', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/023_global_rate_limits.sql'), 'utf8');
  assert.ok(/CREATE TABLE IF NOT EXISTS api_rate_limits/.test(sql), 'rate-limit table missing');
  assert.ok(/ENABLE ROW LEVEL SECURITY/.test(sql), 'RLS must be enabled');
  assert.ok(/REVOKE ALL ON api_rate_limits FROM PUBLIC, anon, authenticated/.test(sql), 'table must be service-role-only');
  assert.ok(/CREATE OR REPLACE FUNCTION rate_limit_check/.test(sql), 'rate_limit_check missing');
  // Two-phase check-then-consume: a locked no-op read, deny at the limit,
  // and consume from every window ONLY if all passed (denied requests must
  // not drain a longer window's budget).
  assert.ok(/ON CONFLICT \(bucket\) DO UPDATE SET count = api_rate_limits\.count\b(?! \+)/.test(sql), 'phase-1 must be a locked no-op read (no increment)');
  assert.ok(/IF v_count >= v_limit THEN/.test(sql), 'per-window limit check missing');
  assert.ok(/IF NOT v_denied THEN\s+UPDATE api_rate_limits SET count = count \+ 1 WHERE bucket = ANY\(v_buckets\)/.test(sql), 'phase-2 must consume only when all windows pass');
  assert.ok(/'retry_after'/.test(sql), 'retry_after not returned');
  assert.ok(/REVOKE EXECUTE ON FUNCTION rate_limit_check\(text, jsonb\) FROM PUBLIC, anon, authenticated/.test(sql), 'RPC grant hygiene missing');
  assert.ok(/GRANT {2}EXECUTE ON FUNCTION rate_limit_check\(text, jsonb\) TO service_role/.test(sql), 'RPC must be granted to service_role');
  assert.ok(/DELETE FROM api_rate_limits WHERE expires_at < now\(\)/.test(sql), 'expired-bucket cleanup missing');
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
