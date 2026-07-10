#!/usr/bin/env node
/**
 * Auth invite-flow suite (Decision #050).
 *
 * Closes the registration pre-hijack: /api/auth/register no longer creates
 * a user with a caller-supplied password. It sends an allowlist-gated
 * Supabase invite email; the account becomes usable only after the real
 * mailbox owner clicks the link and sets a password on /auth/set-password,
 * consumed via /api/auth/complete-invite.
 *
 * Covers (stubbed clients, no network):
 *   - register accepts email only, never a password; never calls createUser
 *   - allowlist gating with a single NEUTRAL response (no enumeration)
 *   - approved / invited → invite sent + row marked 'invited'
 *   - not-allowlisted / used / revoked → neutral OK, NO invite sent
 *   - inviteUserByEmail "already registered" → neutral OK
 *   - complete-invite: auth required; consumes only after ownership proven;
 *     idempotent; blocks foreign/revoked rows
 *   - callback open-redirect guard; migration 021 status enum
 *
 * Run:  npm run test:auth-invite
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

function test(name, fn) {
  try { fn(); console.log(`  ✅  ${name}`); passed++; }
  catch (err) { console.error(`  ❌  ${name}`); console.error(`      ${err.message}`); failed++; }
}

// ── Stubs ────────────────────────────────────────────────────────────

let adminStub = null;   // for createAdminClient
let serverStub = null;  // for createClient (server)

function betaTable(cfg) {
  const calls = { updates: [] };
  return {
    calls,
    from(table) {
      assert.equal(table, 'beta_access', `unexpected table ${table}`);
      const b = {
        _filter: {},
        select() { return b; },
        eq(col, val) { b._filter[col] = val; return b; },
        async maybeSingle() { return { data: cfg.row ?? null, error: cfg.lookupError ?? null }; },
        update(values) { calls.updates.push(values); return { eq: async () => ({ error: cfg.updateError ?? null }) }; },
      };
      return b;
    },
    auth: {
      admin: {
        inviteUserByEmail: async (email, opts) => {
          calls.invited = { email, opts };
          return cfg.inviteError ? { error: cfg.inviteError } : { data: { user: { id: 'u-new' } }, error: null };
        },
        createUser: async () => { calls.createUserCalled = true; return { data: { user: { id: 'x' } }, error: null }; },
        deleteUser: async () => ({ error: null }),
      },
    },
  };
}

function clearCompiled() {
  for (const rel of [
    'app/api/auth/register/route.js',
    'app/api/auth/complete-invite/route.js',
    'lib/supabase/admin.js',
    'lib/supabase/server.js',
    'lib/analytics/server.js',
  ]) {
    try { delete require.cache[require.resolve(path.join(buildDir, rel))]; } catch { /* not loaded */ }
  }
}

function installStubs() {
  const adminPath = path.join(buildDir, 'lib/supabase/admin.js');
  require.cache[require.resolve(adminPath)] = {
    id: adminPath, filename: adminPath, loaded: true,
    exports: { createAdminClient: () => { if (!adminStub) throw new Error('no service role'); return adminStub; } },
  };
  const serverPath = path.join(buildDir, 'lib/supabase/server.js');
  require.cache[require.resolve(serverPath)] = {
    id: serverPath, filename: serverPath, loaded: true,
    exports: { createClient: async () => serverStub },
  };
  const analyticsPath = path.join(buildDir, 'lib/analytics/server.js');
  require.cache[require.resolve(analyticsPath)] = {
    id: analyticsPath, filename: analyticsPath, loaded: true,
    exports: { trackServerEvent: async () => {} },
  };
}

async function withRoutes(fn) {
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.startsWith('@/')) return orig.call(this, path.join(buildDir, request.slice(2)), parent, isMain, options);
    return orig.call(this, request, parent, isMain, options);
  };
  try {
    clearCompiled();
    installStubs();
    const register = require(path.join(buildDir, 'app/api/auth/register/route.js'));
    const complete = require(path.join(buildDir, 'app/api/auth/complete-invite/route.js'));
    return await fn({ register, complete });
  } finally {
    clearCompiled();
    Module._resolveFilename = orig;
    adminStub = null; serverStub = null;
  }
}

function registerReq(body, ip = '1.2.3.4') {
  return new Request('https://example.test/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

async function readJson(res) { return { status: res.status, body: await res.json() }; }

// ── register: email-only, allowlist gating ───────────────────────────

await testAsync('register: approved email → invite sent, row marked invited, neutral OK', async () => {
  const t = betaTable({ row: { id: 'b1', status: 'approved' } });
  adminStub = t;
  await withRoutes(async ({ register }) => {
    const res = await register.POST(registerReq({ email: 'Invitee@Example.com' }, 'a1'));
    const r = await readJson(res);
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(/invite link is on its way/i.test(r.body.message), 'neutral message expected');
    assert.equal(t.calls.invited.email, 'invitee@example.com', 'invite must target the normalized email');
    assert.ok(/\/auth\/callback\?next=\/auth\/set-password/.test(t.calls.invited.opts.redirectTo), 'redirectTo must land on set-password');
    assert.equal(t.calls.updates[0].status, 'invited', 'row must be marked invited (not used)');
    assert.ok(!t.calls.createUserCalled, 'must NOT call createUser');
  });
});

await testAsync('register: prior invited email → invite re-sent (resend allowed)', async () => {
  const t = betaTable({ row: { id: 'b1', status: 'invited' } });
  adminStub = t;
  await withRoutes(async ({ register }) => {
    const res = await register.POST(registerReq({ email: 'invitee@example.com' }, 'a2'));
    assert.equal(res.status, 200);
    assert.ok(t.calls.invited, 'invite must be re-sent for an invited row');
  });
});

await testAsync('register: NOT allowlisted → neutral OK, NO invite sent', async () => {
  const t = betaTable({ row: null });
  adminStub = t;
  await withRoutes(async ({ register }) => {
    const res = await register.POST(registerReq({ email: 'stranger@example.com' }, 'a3'));
    const r = await readJson(res);
    assert.equal(r.status, 200);
    assert.ok(/invite link is on its way/i.test(r.body.message), 'must return the SAME neutral message');
    assert.ok(!t.calls.invited, 'no invite for a non-allowlisted email');
  });
});

await testAsync('register: used / revoked → neutral OK, NO invite sent', async () => {
  for (const status of ['used', 'revoked']) {
    const t = betaTable({ row: { id: 'b1', status } });
    adminStub = t;
    await withRoutes(async ({ register }) => {
      const res = await register.POST(registerReq({ email: 'x@example.com' }, `a-${status}`));
      const r = await readJson(res);
      assert.equal(r.status, 200);
      assert.ok(/invite link is on its way/i.test(r.body.message), `${status}: neutral message`);
      assert.ok(!t.calls.invited, `${status}: no invite sent`);
    });
  }
});

await testAsync('register: a password in the body is ignored (schema is email-only)', async () => {
  const t = betaTable({ row: { id: 'b1', status: 'approved' } });
  adminStub = t;
  await withRoutes(async ({ register }) => {
    const res = await register.POST(registerReq({ email: 'invitee@example.com', password: 'attacker-set-pw' }, 'a4'));
    assert.equal(res.status, 200);
    assert.ok(!t.calls.createUserCalled, 'password path must be gone — no createUser');
    assert.ok(t.calls.invited, 'invite flow used instead');
  });
});

await testAsync('register: inviteUserByEmail "already registered" → neutral OK', async () => {
  const t = betaTable({ row: { id: 'b1', status: 'approved' }, inviteError: { message: 'A user with this email address has already been registered' } });
  adminStub = t;
  await withRoutes(async ({ register }) => {
    const res = await register.POST(registerReq({ email: 'invitee@example.com' }, 'a5'));
    const r = await readJson(res);
    assert.equal(r.status, 200);
    assert.ok(/invite link is on its way/i.test(r.body.message), 'neutral even on already-registered');
  });
});

await testAsync('register: invalid email → 400', async () => {
  adminStub = betaTable({ row: null });
  await withRoutes(async ({ register }) => {
    const res = await register.POST(registerReq({ email: 'not-an-email' }, 'a6'));
    assert.equal(res.status, 400);
  });
});

await testAsync('register: rate limit returns 429 after the per-minute cap', async () => {
  adminStub = betaTable({ row: null });
  await withRoutes(async ({ register }) => {
    let got429 = false;
    for (let i = 0; i < 7; i++) {
      const res = await register.POST(registerReq({ email: 'x@example.com' }, 'ratelimit-ip'));
      if (res.status === 429) { got429 = true; break; }
    }
    assert.ok(got429, 'expected a 429 within the per-minute cap');
  });
});

// ── complete-invite ──────────────────────────────────────────────────

function completeStubs({ user, row, updateError }) {
  serverStub = { auth: { getUser: async () => ({ data: { user } }) } };
  adminStub = betaTable({ row, updateError });
  return adminStub;
}

await testAsync('complete-invite: unauthenticated → 401', async () => {
  completeStubs({ user: null, row: null });
  await withRoutes(async ({ complete }) => {
    const res = await complete.POST();
    assert.equal(res.status, 401);
  });
});

await testAsync('complete-invite: invited row → marked used', async () => {
  const t = completeStubs({ user: { id: 'u1', email: 'Invitee@Example.com' }, row: { id: 'b1', status: 'invited', used_by_user_id: null } });
  await withRoutes(async ({ complete }) => {
    const res = await complete.POST();
    assert.equal(res.status, 200);
    assert.equal(t.calls.updates[0].status, 'used', 'invite must be consumed');
    assert.equal(t.calls.updates[0].used_by_user_id, 'u1', 'used_by_user_id must be the caller');
  });
});

await testAsync('complete-invite: revoked / missing → 403, not consumed', async () => {
  for (const row of [null, { id: 'b1', status: 'revoked' }]) {
    const t = completeStubs({ user: { id: 'u1', email: 'x@example.com' }, row });
    await withRoutes(async ({ complete }) => {
      const res = await complete.POST();
      assert.equal(res.status, 403);
      assert.equal(t.calls.updates.length, 0, 'must not update');
    });
  }
});

await testAsync('complete-invite: already used by another user → 403', async () => {
  const t = completeStubs({ user: { id: 'u1', email: 'x@example.com' }, row: { id: 'b1', status: 'used', used_by_user_id: 'someone-else' } });
  await withRoutes(async ({ complete }) => {
    const res = await complete.POST();
    assert.equal(res.status, 403);
    assert.equal(t.calls.updates.length, 0);
  });
});

await testAsync('complete-invite: already used by same user → idempotent 200', async () => {
  const t = completeStubs({ user: { id: 'u1', email: 'x@example.com' }, row: { id: 'b1', status: 'used', used_by_user_id: 'u1' } });
  await withRoutes(async ({ complete }) => {
    const res = await complete.POST();
    assert.equal(res.status, 200);
    assert.equal(t.calls.updates.length, 0, 'no re-write on idempotent replay');
  });
});

// ── Source + migration guards ────────────────────────────────────────

test('register route source: no password schema, no createUser, uses inviteUserByEmail', () => {
  const src = readFileSync(path.join(repoRoot, 'app/api/auth/register/route.ts'), 'utf8');
  assert.ok(!/password:\s*z\./.test(src), 'register schema must not accept a password');
  assert.ok(!/createUser\(/.test(src), 'register must not call createUser');
  assert.ok(!/email_confirm:\s*true/.test(src), 'email_confirm:true password path must be gone');
  assert.ok(/inviteUserByEmail\(/.test(src), 'register must use inviteUserByEmail');
});

test('callback route: next redirect is same-origin-guarded (no open redirect)', () => {
  const src = readFileSync(path.join(repoRoot, 'app/auth/callback/route.ts'), 'utf8');
  assert.ok(/startsWith\('\/'\)/.test(src), 'next must be required to start with /');
  assert.ok(/!nextParam\.startsWith\('\/\/'\)/.test(src), 'protocol-relative // must be rejected');
});

test('set-password page: gates on session and calls complete-invite', () => {
  const src = readFileSync(path.join(repoRoot, 'app/auth/set-password/page.tsx'), 'utf8');
  assert.ok(/updateUser\(\{ password/.test(src), 'must set the password via updateUser');
  assert.ok(/\/api\/auth\/complete-invite/.test(src), 'must consume the invite');
  assert.ok(/hasSession/.test(src), 'must gate the form on an authenticated session');
});

test('migration 021: status enum includes invited + invited_at column', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/021_beta_access_invite_flow.sql'), 'utf8');
  assert.ok(/ADD COLUMN IF NOT EXISTS invited_at/.test(sql), 'invited_at column missing');
  assert.ok(/CHECK \(status IN \('approved', 'invited', 'used', 'revoked'\)\)/.test(sql), 'status enum must include invited');
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
