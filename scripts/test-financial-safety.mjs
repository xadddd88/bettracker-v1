#!/usr/bin/env node
/**
 * Financial safety suite (Decision #047 — atomic financial writes &
 * no-overdraft policy). Runs against the compiled output in
 * build/provider-smoke/ so it exercises the real TypeScript logic.
 *
 * Covers:
 *  - /api/bankroll/deposit delegates to the adjust_bankroll() RPC and
 *    NEVER touches bankrolls / bankroll_transactions directly — success
 *    can only mean the whole DB transaction committed
 *  - insufficient-balance and missing-bankroll errors map to 422/404
 *    with sanitized messages (no raw DB text reaches the client)
 *  - the idempotency key passes through to the RPC
 *  - /api/settings syncs currency ONLY via set_user_currency() and
 *    fails loudly when the sync fails (no silent partial success)
 *  - lib/money: negative P&L keeps its minus sign; currency symbols
 *  - migration 016 static guards: FOR UPDATE lock, conditional
 *    balance >= stake subtraction, SECURITY DEFINER, idempotency index
 *
 * Run:  npm run test:financial-safety   (builds then runs this)
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

async function readJsonResponse(response) {
  return { status: response.status, body: await response.json() };
}

function withCompiledAlias(fn) {
  const originalResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      return originalResolveFilename.call(this, path.join(buildDir, request.slice(2)), parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  const restore = () => {
    Module._resolveFilename = originalResolveFilename;
  };

  return Promise.resolve()
    .then(fn)
    .finally(restore);
}

// ── Stubbed Supabase server client ───────────────────────────────────
// `currentStub` is swapped per test; the stub module below closes over it.

let currentStub = null;

function makeStubClient(cfg = {}) {
  const calls = { rpc: [], from: [] };
  const client = {
    calls,
    auth: {
      getUser: async () => ({ data: { user: cfg.user === null ? null : { id: 'user-1' } } }),
    },
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
        select(sel) { entry.ops.push({ op: 'select', sel }); return builder; },
        eq(col, val) { entry.ops.push({ op: 'eq', col, val }); return builder; },
        async single() {
          entry.ops.push({ op: 'single' });
          return cfg.profileRow !== undefined
            ? { data: cfg.profileRow, error: null }
            : { data: null, error: { message: 'row not found' } };
        },
        async maybeSingle() { return { data: null, error: null }; },
        then(resolve, reject) {
          return Promise.resolve({ data: null, error: cfg.updateError ?? null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return client;
}

function clearCompiledFinancialModules() {
  for (const relPath of [
    'app/api/bankroll/deposit/route.js',
    'app/api/settings/route.js',
    'lib/supabase/server.js',
    'lib/analytics/server.js',
    'lib/money.js',
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
    id: serverPath,
    filename: serverPath,
    loaded: true,
    exports: { createClient: async () => currentStub },
  };

  const analyticsPath = path.join(buildDir, 'lib/analytics/server.js');
  require.cache[require.resolve(analyticsPath)] = {
    id: analyticsPath,
    filename: analyticsPath,
    loaded: true,
    exports: { trackServerEvent: async () => {} },
  };
}

async function withFinancialRoute(routeRel, stub, fn) {
  return withCompiledAlias(async () => {
    clearCompiledFinancialModules();
    currentStub = stub;
    stubServerModules();
    const route = require(path.join(buildDir, routeRel));
    try {
      return await fn(route);
    } finally {
      clearCompiledFinancialModules();
      currentStub = null;
    }
  });
}

function jsonRequest(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const DEPOSIT_ROUTE = 'app/api/bankroll/deposit/route.js';
const SETTINGS_ROUTE = 'app/api/settings/route.js';
const FINANCIAL_TABLES = ['bankrolls', 'bankroll_transactions', 'bets', 'bet_legs'];
const IDEM_KEY = '11111111-aaaa-4bbb-8ccc-222222222222';

function assertNoFinancialTableAccess(stub) {
  const touched = stub.calls.from.filter((entry) => FINANCIAL_TABLES.includes(entry.table));
  assert.equal(touched.length, 0, `route touched financial tables directly: ${touched.map((t) => t.table).join(', ')}`);
}

// ── /api/bankroll/deposit ────────────────────────────────────────────

await testAsync('deposit: delegates to adjust_bankroll RPC, no direct financial table access', async () => {
  const stub = makeStubClient({
    rpcResults: {
      adjust_bankroll: { data: { transaction_id: 'tx-1', balance: 150, replayed: false }, error: null },
    },
  });

  await withFinancialRoute(DEPOSIT_ROUTE, stub, async ({ POST }) => {
    const response = await POST(jsonRequest('https://example.test/api/bankroll/deposit', {
      amount: 50, type: 'deposit', note: 'top up', idempotency_key: IDEM_KEY,
    }));
    const result = await readJsonResponse(response);

    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.balance, 150);
    assert.equal(result.body.transaction_id, 'tx-1');
    assert.equal(result.body.replayed, false);

    assert.equal(stub.calls.rpc.length, 1);
    const call = stub.calls.rpc[0];
    assert.equal(call.name, 'adjust_bankroll');
    assert.deepEqual(call.args, {
      p_type: 'deposit',
      p_amount: 50,
      p_note: 'top up',
      p_idempotency_key: IDEM_KEY,
    });

    assertNoFinancialTableAccess(stub);
  });
});

await testAsync('deposit: insufficient balance maps to 422 with a sanitized message', async () => {
  const stub = makeStubClient({
    rpcResults: {
      adjust_bankroll: { data: null, error: { message: 'Insufficient balance' } },
    },
  });

  await withFinancialRoute(DEPOSIT_ROUTE, stub, async ({ POST }) => {
    const response = await POST(jsonRequest('https://example.test/api/bankroll/deposit', {
      amount: 500, type: 'withdrawal', idempotency_key: IDEM_KEY,
    }));
    const result = await readJsonResponse(response);

    assert.equal(result.status, 422);
    assert.equal(result.body.error, 'Insufficient balance');
    assert.equal(result.body.success, undefined);
    assertNoFinancialTableAccess(stub);
  });
});

await testAsync('deposit: missing default bankroll maps to 404', async () => {
  const stub = makeStubClient({
    rpcResults: {
      adjust_bankroll: { data: null, error: { message: 'No default bankroll found' } },
    },
  });

  await withFinancialRoute(DEPOSIT_ROUTE, stub, async ({ POST }) => {
    const response = await POST(jsonRequest('https://example.test/api/bankroll/deposit', {
      amount: 10, type: 'deposit', idempotency_key: IDEM_KEY,
    }));
    assert.equal(response.status, 404);
  });
});

await testAsync('deposit: same key with a different payload maps to 409 conflict, zero writes', async () => {
  const stub = makeStubClient({
    rpcResults: {
      adjust_bankroll: { data: null, error: { message: 'Idempotency conflict' } },
    },
  });

  await withFinancialRoute(DEPOSIT_ROUTE, stub, async ({ POST }) => {
    const response = await POST(jsonRequest('https://example.test/api/bankroll/deposit', {
      amount: 75, type: 'deposit', idempotency_key: IDEM_KEY,
    }));
    const result = await readJsonResponse(response);

    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'Request conflict');
    assert.equal(result.body.success, undefined);
    assertNoFinancialTableAccess(stub);
  });
});

await testAsync('deposit: unexpected RPC error returns 500 without leaking DB details', async () => {
  const stub = makeStubClient({
    rpcResults: {
      adjust_bankroll: {
        data: null,
        error: { message: 'duplicate key value violates unique constraint "uq_bankroll_tx_user_idempotency_key"' },
      },
    },
  });

  await withFinancialRoute(DEPOSIT_ROUTE, stub, async ({ POST }) => {
    const response = await POST(jsonRequest('https://example.test/api/bankroll/deposit', {
      amount: 10, type: 'deposit', idempotency_key: IDEM_KEY,
    }));
    const result = await readJsonResponse(response);

    assert.equal(result.status, 500);
    assert.equal(result.body.error, 'Transaction failed');
    assert.ok(!JSON.stringify(result.body).includes('constraint'), 'raw DB error leaked to client');
  });
});

await testAsync('deposit: invalid input is rejected before any RPC call', async () => {
  const stub = makeStubClient({});

  await withFinancialRoute(DEPOSIT_ROUTE, stub, async ({ POST }) => {
    for (const body of [
      { amount: -5, type: 'deposit', idempotency_key: IDEM_KEY },
      { amount: 100_000_001, type: 'deposit', idempotency_key: IDEM_KEY },
      { amount: 10, type: 'stake', idempotency_key: IDEM_KEY },
      { amount: 10, type: 'adjustment', idempotency_key: IDEM_KEY },
      { amount: 10, type: 'deposit' },
      { amount: 10, type: 'deposit', idempotency_key: 'not-a-uuid' },
    ]) {
      const response = await POST(jsonRequest('https://example.test/api/bankroll/deposit', body));
      assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    }
    assert.equal(stub.calls.rpc.length, 0);
  });
});

await testAsync('deposit: idempotent replay is surfaced to the client', async () => {
  const stub = makeStubClient({
    rpcResults: {
      adjust_bankroll: { data: { transaction_id: 'tx-original', balance: 100, replayed: true }, error: null },
    },
  });

  await withFinancialRoute(DEPOSIT_ROUTE, stub, async ({ POST }) => {
    const response = await POST(jsonRequest('https://example.test/api/bankroll/deposit', {
      amount: 50, type: 'deposit', idempotency_key: IDEM_KEY,
    }));
    const result = await readJsonResponse(response);

    assert.equal(result.status, 200);
    assert.equal(result.body.replayed, true);
    assert.equal(result.body.transaction_id, 'tx-original');
  });
});

// ── /api/settings ────────────────────────────────────────────────────

await testAsync('settings: currency change goes through set_user_currency, never a direct bankroll write', async () => {
  const stub = makeStubClient({
    profileRow: { id: 'user-1', currency: 'EUR' },
    rpcResults: { set_user_currency: { data: { currency: 'EUR' }, error: null } },
  });

  await withFinancialRoute(SETTINGS_ROUTE, stub, async (route) => {
    const response = await route.PATCH(jsonRequest('https://example.test/api/settings', { currency: 'EUR' }));
    const result = await readJsonResponse(response);

    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);

    assert.equal(stub.calls.rpc.length, 1);
    assert.equal(stub.calls.rpc[0].name, 'set_user_currency');
    assert.deepEqual(stub.calls.rpc[0].args, { p_currency: 'EUR' });

    const bankrollWrites = stub.calls.from.filter(
      (entry) => entry.table === 'bankrolls' && entry.ops.some((op) => op.op === 'update' || op.op === 'insert')
    );
    assert.equal(bankrollWrites.length, 0, 'settings route wrote to bankrolls directly');

    const profileUpdates = stub.calls.from.filter(
      (entry) => entry.table === 'profiles' && entry.ops.some((op) => op.op === 'update')
    );
    assert.equal(profileUpdates.length, 0, 'currency-only change should not update profiles directly');
  });
});

await testAsync('settings: mixed update strips currency from the direct profile write', async () => {
  const stub = makeStubClient({
    profileRow: { id: 'user-1', currency: 'UAH', display_name: 'Dima' },
    rpcResults: { set_user_currency: { data: { currency: 'UAH' }, error: null } },
  });

  await withFinancialRoute(SETTINGS_ROUTE, stub, async (route) => {
    const response = await route.PATCH(jsonRequest('https://example.test/api/settings', {
      currency: 'UAH', display_name: 'Dima',
    }));
    assert.equal(response.status, 200);

    const profileUpdate = stub.calls.from.find(
      (entry) => entry.table === 'profiles' && entry.ops.some((op) => op.op === 'update')
    );
    assert.ok(profileUpdate, 'expected a profiles update for non-currency fields');
    const updateOp = profileUpdate.ops.find((op) => op.op === 'update');
    assert.deepEqual(updateOp.values, { display_name: 'Dima' });
    assert.ok(!('currency' in updateOp.values), 'currency must not be written directly to profiles');

    assert.equal(stub.calls.rpc.filter((c) => c.name === 'set_user_currency').length, 1);
  });
});

await testAsync('settings: currency sync failure is a hard error, not a silent partial success', async () => {
  const stub = makeStubClient({
    profileRow: { id: 'user-1' },
    rpcResults: { set_user_currency: { data: null, error: { message: 'boom' } } },
  });

  await withFinancialRoute(SETTINGS_ROUTE, stub, async (route) => {
    const response = await route.PATCH(jsonRequest('https://example.test/api/settings', { currency: 'GBP' }));
    const result = await readJsonResponse(response);

    assert.equal(result.status, 500);
    assert.equal(result.body.error, 'Failed to update currency');
    assert.equal(result.body.success, undefined);
  });
});

await testAsync('settings: missing default bankroll surfaces as 404, currency change does not half-apply', async () => {
  const stub = makeStubClient({
    profileRow: { id: 'user-1' },
    rpcResults: { set_user_currency: { data: null, error: { message: 'No default bankroll found' } } },
  });

  await withFinancialRoute(SETTINGS_ROUTE, stub, async (route) => {
    const response = await route.PATCH(jsonRequest('https://example.test/api/settings', { currency: 'EUR' }));
    const result = await readJsonResponse(response);

    assert.equal(result.status, 404);
    assert.equal(result.body.error, 'Bankroll not found');
    assert.equal(result.body.success, undefined);
  });
});

await testAsync('settings: non-currency update makes no RPC call', async () => {
  const stub = makeStubClient({ profileRow: { id: 'user-1', default_stake: 25 } });

  await withFinancialRoute(SETTINGS_ROUTE, stub, async (route) => {
    const response = await route.PATCH(jsonRequest('https://example.test/api/settings', { default_stake: 25 }));
    assert.equal(response.status, 200);
    assert.equal(stub.calls.rpc.length, 0);
  });
});

// ── lib/money ────────────────────────────────────────────────────────

await testAsync('money: negative P&L keeps its minus sign; symbols resolve per currency', async () => {
  await withCompiledAlias(async () => {
    clearCompiledFinancialModules();
    const money = require(path.join(buildDir, 'lib/money.js'));

    assert.equal(money.fmtPnl(-100, '$'), '-$100.00');
    assert.equal(money.fmtPnl(50.5, '$'), '+$50.50');
    assert.equal(money.fmtPnl(0, '€'), '€0.00');
    assert.equal(money.fmtPct(-3.25), '-3.3%');
    assert.equal(money.fmtPct(4), '+4.0%');
    assert.equal(money.currencySymbol('UAH'), '₴');
    assert.equal(money.currencySymbol('GBP'), '£');
    assert.equal(money.currencySymbol('XYZ'), 'XYZ');
    assert.equal(money.currencySymbol(null), '$');
  });
});

// ── Migration 016 static guards ──────────────────────────────────────
// Cheap regression tripwires: a later edit that drops the row lock, the
// no-overdraft guard, or the idempotency index fails here.

test('migration 016: row lock, funds guards, idempotency index and definer hygiene present', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/016_atomic_financial_writes.sql'), 'utf8');

  assert.ok(sql.includes('FOR UPDATE'), 'bankroll row lock missing');
  assert.ok(sql.includes('AND balance >= p_stake'), 'create_quick_bet funds guard missing');
  assert.ok(sql.includes('AND balance >= v_stake'), 'place_bet_from_decision funds guard missing');
  assert.ok(sql.includes("RAISE EXCEPTION 'Insufficient balance'"), 'insufficient-balance exception missing');
  assert.ok(sql.includes('uq_bankroll_tx_user_idempotency_key'), 'idempotency unique index missing');
  assert.ok(sql.includes('WHERE idempotency_key IS NOT NULL'), 'partial index predicate missing');
  assert.ok(sql.includes("IF p_type NOT IN ('deposit', 'withdrawal')"), 'user-callable types must be deposit/withdrawal only');
  assert.ok(sql.includes("RAISE EXCEPTION 'Idempotency conflict'"), 'payload-bound idempotency conflict missing');
  assert.ok(sql.includes("RAISE EXCEPTION 'Invalid idempotency key'"), 'required-UUID idempotency validation missing');
  assert.ok(sql.includes('GET DIAGNOSTICS'), 'set_user_currency exactly-one-row invariant missing');
  assert.ok(sql.includes("RAISE EXCEPTION 'No default bankroll found'"), 'no-default-bankroll exception missing');
  assert.ok((sql.match(/SECURITY DEFINER/g) ?? []).length >= 4, 'expected all four functions to be SECURITY DEFINER');
  assert.ok((sql.match(/SET search_path = public/g) ?? []).length >= 4, 'expected search_path pinning on all functions');
  assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION adjust_bankroll'), 'adjust_bankroll grant hygiene missing');
  assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION set_user_currency'), 'set_user_currency grant hygiene missing');
  const sqlWithoutComments = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  assert.ok(
    !sqlWithoutComments.includes('CHECK (balance >= 0)'),
    'hard balance constraint must NOT ship before reconciliation'
  );
});

test('deposit route source: no direct financial table access remains', () => {
  const src = readFileSync(path.join(repoRoot, 'app/api/bankroll/deposit/route.ts'), 'utf8');
  assert.ok(!src.includes("from('bankrolls')"), 'deposit route still reads/writes bankrolls directly');
  assert.ok(!src.includes("from('bankroll_transactions')"), 'deposit route still writes transactions directly');
  assert.ok(src.includes("rpc('adjust_bankroll'"), 'deposit route must call adjust_bankroll');
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
