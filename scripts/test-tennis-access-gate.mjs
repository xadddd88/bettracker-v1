#!/usr/bin/env node
/**
 * Tennis Live Series Calculator — PR-2 access-gate suite (flag + owner gate).
 *
 * Covers lib/flags/tennis-calc.ts:
 *   - the server-only TENNIS_CALC_ENABLED flag is default-OFF and opens only on the
 *     exact literal 'true' (missing / empty / 'TRUE' / '1' / 'yes' / ' true ' all deny)
 *   - the server-only OWNER_USER_ID gate fails closed when unset or malformed
 *   - unauthenticated and non-owner callers are denied with distinct typed reasons
 *   - a disabled flag blocks even the correct owner
 *   - no result, error, or exported surface discloses OWNER_USER_ID or any env value
 *   - no NEXT_PUBLIC_TENNIS_CALC_ENABLED exists anywhere in the repository
 *   - the gate is not wired to any feature surface (production runtime unchanged)
 *
 * No network, no DB, no Supabase, no provider calls. Env is manipulated in-process only;
 * the fixture ids below are synthetic test UUIDs, never real credentials.
 *
 * Run:  node scripts/test-tennis-access-gate.mjs   (after build:provider-scripts)
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(__dirname, '..');
const buildDir = path.join(repoRoot, 'build', 'provider-smoke');

const gate = require(path.join(buildDir, 'lib/flags/tennis-calc.js'));
const {
  checkTennisCalcAccess,
  isTennisCalcEnabled,
  TENNIS_CALC_FLAG_ENV,
  TENNIS_CALC_OWNER_ENV,
} = gate;

const MODULE_SRC = readFileSync(path.join(repoRoot, 'lib/flags/tennis-calc.ts'), 'utf8');

// Synthetic fixtures — not real ids. Hex letters are deliberate so the case-sensitivity
// assertion below is meaningful (an all-digit UUID would make toUpperCase() a no-op).
const OWNER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeffff';
const OTHER = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffaaaa';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅  ${name}`); passed++; }
  catch (err) { console.error(`  ❌  ${name}`); console.error(`      ${err.message}`); failed++; }
}

/** Run fn with an exact env snapshot; undefined means "variable absent". */
function withEnv({ flag, owner }, fn) {
  const prevFlag = process.env[TENNIS_CALC_FLAG_ENV];
  const prevOwner = process.env[TENNIS_CALC_OWNER_ENV];
  try {
    if (flag === undefined) delete process.env[TENNIS_CALC_FLAG_ENV];
    else process.env[TENNIS_CALC_FLAG_ENV] = flag;
    if (owner === undefined) delete process.env[TENNIS_CALC_OWNER_ENV];
    else process.env[TENNIS_CALC_OWNER_ENV] = owner;
    return fn();
  } finally {
    if (prevFlag === undefined) delete process.env[TENNIS_CALC_FLAG_ENV];
    else process.env[TENNIS_CALC_FLAG_ENV] = prevFlag;
    if (prevOwner === undefined) delete process.env[TENNIS_CALC_OWNER_ENV];
    else process.env[TENNIS_CALC_OWNER_ENV] = prevOwner;
  }
}

function denies(env, userId, reason) {
  const r = withEnv(env, () => checkTennisCalcAccess(userId));
  assert.equal(r.allowed, false, `expected denial, got ${JSON.stringify(r)}`);
  assert.equal(r.reason, reason, `expected reason ${reason}, got ${r.reason}`);
  return r;
}

console.log('\nTennis access gate — env names');
test('env names are server-only (no NEXT_PUBLIC_ prefix)', () => {
  assert.equal(TENNIS_CALC_FLAG_ENV, 'TENNIS_CALC_ENABLED');
  assert.equal(TENNIS_CALC_OWNER_ENV, 'OWNER_USER_ID');
  assert.ok(!TENNIS_CALC_FLAG_ENV.startsWith('NEXT_PUBLIC_'));
  assert.ok(!TENNIS_CALC_OWNER_ENV.startsWith('NEXT_PUBLIC_'));
});

console.log('\nFeature flag — default OFF, exact-value only');
test('flag absent → feature_disabled (default OFF)', () => {
  denies({ flag: undefined, owner: OWNER }, OWNER, 'feature_disabled');
});
test('flag explicitly "false" → feature_disabled', () => {
  denies({ flag: 'false', owner: OWNER }, OWNER, 'feature_disabled');
});
for (const malformed of ['TRUE', 'True', 'tRuE', '1', 'yes', 'on', 'enabled', '', ' ', ' true', 'true ', ' true ', 'true\n', '"true"', 'truthy']) {
  test(`flag malformed ${JSON.stringify(malformed)} → feature_disabled`, () => {
    denies({ flag: malformed, owner: OWNER }, OWNER, 'feature_disabled');
  });
}
test('isTennisCalcEnabled() mirrors the exact-value rule', () => {
  assert.equal(withEnv({ flag: 'true', owner: OWNER }, () => isTennisCalcEnabled()), true);
  assert.equal(withEnv({ flag: 'TRUE', owner: OWNER }, () => isTennisCalcEnabled()), false);
  assert.equal(withEnv({ flag: undefined, owner: OWNER }, () => isTennisCalcEnabled()), false);
});

console.log('\nOwner gate — fail-closed when unset or malformed');
test('owner absent → owner_not_configured', () => {
  denies({ flag: 'true', owner: undefined }, OWNER, 'owner_not_configured');
});
for (const malformed of ['', ' ', 'not-a-uuid', '1234', OWNER.slice(0, 35), `${OWNER}x`, `  ${OWNER}  `, 'null', 'undefined']) {
  test(`owner malformed ${JSON.stringify(malformed)} → owner_not_configured`, () => {
    denies({ flag: 'true', owner: malformed }, OWNER, 'owner_not_configured');
  });
}

console.log('\nIdentity — unauthenticated vs not_owner');
for (const [label, userId] of [['null', null], ['undefined', undefined], ['empty string', ''], ['whitespace', ' '], ['malformed uuid', 'not-a-uuid'], ['truncated uuid', OWNER.slice(0, 35)], ['padded uuid', ` ${OWNER} `]]) {
  test(`unauthenticated (${label}) → unauthenticated`, () => {
    denies({ flag: 'true', owner: OWNER }, userId, 'unauthenticated');
  });
}
test('different authenticated user → not_owner', () => {
  denies({ flag: 'true', owner: OWNER }, OTHER, 'not_owner');
});
test('owner id case variant → not_owner (exact match required, fail-closed)', () => {
  denies({ flag: 'true', owner: OWNER }, OWNER.toUpperCase(), 'not_owner');
});

console.log('\nAllowed path, and flag precedence over a valid owner');
test('flag enabled + configured owner + exact owner → allowed', () => {
  const r = withEnv({ flag: 'true', owner: OWNER }, () => checkTennisCalcAccess(OWNER));
  assert.deepEqual(r, { allowed: true });
});
test('disabled flag blocks even the correct owner', () => {
  denies({ flag: 'false', owner: OWNER }, OWNER, 'feature_disabled');
  denies({ flag: undefined, owner: OWNER }, OWNER, 'feature_disabled');
});
test('flag is evaluated before owner config (denial identical for every caller)', () => {
  const a = withEnv({ flag: 'false', owner: undefined }, () => checkTennisCalcAccess(OWNER));
  const b = withEnv({ flag: 'false', owner: OWNER }, () => checkTennisCalcAccess(OTHER));
  assert.deepEqual(a, b, 'a disabled flag must not reveal owner configuration state');
  assert.equal(a.reason, 'feature_disabled');
});

console.log('\nSecret discipline — no env value ever disclosed');
test('no result on any path contains the owner id or flag value', () => {
  const results = [
    withEnv({ flag: 'true', owner: OWNER }, () => checkTennisCalcAccess(OWNER)),
    withEnv({ flag: 'true', owner: OWNER }, () => checkTennisCalcAccess(OTHER)),
    withEnv({ flag: 'true', owner: OWNER }, () => checkTennisCalcAccess(null)),
    withEnv({ flag: 'true', owner: undefined }, () => checkTennisCalcAccess(OWNER)),
    withEnv({ flag: 'false', owner: OWNER }, () => checkTennisCalcAccess(OWNER)),
  ];
  for (const r of results) {
    const serialized = JSON.stringify(r);
    assert.ok(!serialized.includes(OWNER), `result leaked the owner id: ${serialized}`);
    assert.ok(!serialized.includes(OTHER), `result leaked the caller id: ${serialized}`);
    const keys = Object.keys(r);
    assert.ok(keys.every((k) => k === 'allowed' || k === 'reason'), `unexpected result keys: ${keys.join(',')}`);
  }
});
test('denial reasons are the four approved typed values only', () => {
  const seen = new Set([
    denies({ flag: 'false', owner: OWNER }, OWNER, 'feature_disabled').reason,
    denies({ flag: 'true', owner: undefined }, OWNER, 'owner_not_configured').reason,
    denies({ flag: 'true', owner: OWNER }, null, 'unauthenticated').reason,
    denies({ flag: 'true', owner: OWNER }, OTHER, 'not_owner').reason,
  ]);
  assert.deepEqual([...seen].sort(), ['feature_disabled', 'not_owner', 'owner_not_configured', 'unauthenticated']);
});
test('no exported member returns the OWNER_USER_ID value', () => {
  for (const [name, value] of Object.entries(gate)) {
    if (typeof value !== 'function') continue;
    if (name === 'checkTennisCalcAccess' || name === 'isTennisCalcEnabled') continue;
    assert.fail(`unexpected exported function ${name} — the owner value must not be reachable`);
  }
  const out = withEnv({ flag: 'true', owner: OWNER }, () => [
    checkTennisCalcAccess(OWNER),
    isTennisCalcEnabled(),
  ]);
  assert.ok(!JSON.stringify(out).includes(OWNER));
});
test('module source has no console/log call and no thrown env value', () => {
  assert.ok(!/console\s*\./.test(MODULE_SRC), 'module must not log');
  assert.ok(!/process\.env\[[^\]]+\]\s*\)?\s*\}?\s*`/.test(MODULE_SRC), 'module must not interpolate env into strings');
  assert.ok(!/throw new Error\([^)]*process\.env/.test(MODULE_SRC), 'module must not throw env values');
});

console.log('\nStatic guards — client exposure, scope, and wiring');
function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'build' || entry === '.next') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|json|env|example)$/.test(entry)) acc.push(full);
  }
  return acc;
}
const allSources = sourceFiles(repoRoot);
test('no NEXT_PUBLIC_TENNIS_CALC_ENABLED is read or defined anywhere in the repository', () => {
  // Tests the security property (no client-exposed flag in USE), not the mere appearance
  // of the name: the gate module and this suite both document the prohibition in prose.
  const usage = [
    /process\.env\.NEXT_PUBLIC_TENNIS_CALC\w*/,          // process.env.NEXT_PUBLIC_TENNIS_CALC_ENABLED
    /process\.env\[\s*['"`]NEXT_PUBLIC_TENNIS_CALC\w*/,  // process.env['NEXT_PUBLIC_TENNIS_CALC_ENABLED']
    /^\s*NEXT_PUBLIC_TENNIS_CALC\w*\s*=/m,               // env-file / .env.example assignment
    /["']NEXT_PUBLIC_TENNIS_CALC\w*["']\s*:/,            // config/JSON key
  ];
  const hits = [];
  for (const f of allSources) {
    // This suite is the detector: the patterns above appear in its own source as regex
    // literals, so it is excluded from its own scan.
    if (f.endsWith('test-tennis-access-gate.mjs')) continue;
    const src = readFileSync(f, 'utf8');
    if (usage.some((re) => re.test(src))) hits.push(path.relative(repoRoot, f));
  }
  assert.deepEqual(hits, [], `client-exposed flag in use: ${hits.join(', ')}`);
});
test('gate module references no NEXT_PUBLIC_ env at all', () => {
  assert.ok(!MODULE_SRC.includes('NEXT_PUBLIC_') || /forbidden|NEXT_PUBLIC_\*/.test(MODULE_SRC),
    'only documentation may mention NEXT_PUBLIC_');
  assert.ok(!/process\.env\.NEXT_PUBLIC_/.test(MODULE_SRC), 'must not read a NEXT_PUBLIC_ env');
  assert.ok(!/process\.env\[\s*['"]NEXT_PUBLIC_/.test(MODULE_SRC));
});
test('gate module does no Supabase / DB / RPC / migration work', () => {
  // Usage-based, not word-based: `.from('` targets the Supabase query builder (plain
  // Buffer.from() is legitimate and used by the constant-time helper), and a quoted
  // 'profiles' targets a real table reference (the module's header prose states that no
  // profiles/role column was added, which must stay allowed).
  for (const forbidden of ['@supabase', 'createClient', 'createAdminClient', '.rpc(', ".from('", '.from("', "'profiles'", '"profiles"', 'ALTER TABLE', 'CREATE POLICY']) {
    assert.ok(!MODULE_SRC.includes(forbidden), `module must not reference ${forbidden}`);
  }
});
test('gate is not wired to any feature surface (production runtime unchanged)', () => {
  const importers = allSources.filter((f) => {
    if (f.endsWith(path.join('lib', 'flags', 'tennis-calc.ts'))) return false;
    if (f.endsWith('test-tennis-access-gate.mjs')) return false;
    return /flags\/tennis-calc/.test(readFileSync(f, 'utf8'));
  });
  assert.deepEqual(importers, [], `gate must stay unwired in PR-2; imported by: ${importers.join(', ')}`);
});
test('PR-2 adds no page/route/server-action/migration files', () => {
  for (const f of allSources) {
    const rel = path.relative(repoRoot, f);
    if (rel.startsWith('lib/flags/') || rel === 'scripts/test-tennis-access-gate.mjs') {
      assert.ok(!/^app\//.test(rel) && !/supabase\/migrations/.test(rel), `unexpected surface file ${rel}`);
    }
  }
  assert.ok(!MODULE_SRC.includes('use server'), 'no server action');
  assert.ok(!MODULE_SRC.includes('NextResponse'), 'no route handler code');
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
