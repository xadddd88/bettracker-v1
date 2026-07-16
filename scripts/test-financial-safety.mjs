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
// The settings-route write contract moved to the Decision #048 suite
// (scripts/test-domain-write-boundaries.mjs): a single save_user_settings
// RPC call, zero direct table access. This suite keeps only the shared
// financial invariants below.

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

// ── Decision #058: canonical settlement metrics & status presentation ──
// One shared pure contract for Win Rate / ROI / Net Profit / settled count /
// pending stake (G4), and explicit Partial/Unknown presentation with no Void
// fallback (G12). Pure functions only — no Supabase, providers, or network.

console.log('\nDecision #058 — settlement metrics & status presentation:');

await withCompiledAlias(async () => {
  const metricsMod = require(path.join(buildDir, 'lib/bets/settlement-metrics.js'));
  const statusMod = require(path.join(buildDir, 'lib/bets/bet-status.js'));
  const perfMod = require(path.join(buildDir, 'lib/analytics/performance.js'));
  const { calcSettlementMetrics, isSupportedSettlementStatus } = metricsMod;
  const { resolveBetStatus, BET_STATUS_LABELS, KNOWN_BET_STATUSES } = statusMod;
  const { calcPerformance } = perfMod;

  const bet = (status, stake, pnl = null, total_odds = null) => ({ status, stake, pnl, total_odds });
  const approx = (a, b) => Math.abs(a - b) < 1e-9;

  test('#058: win rate = won / (won + lost) x 100', () => {
    const m = calcSettlementMetrics([bet('won', 10, 10), bet('won', 10, 12), bet('lost', 10, -10)]);
    assert.ok(approx(m.winRate, (2 / 3) * 100), `expected 66.67, got ${m.winRate}`);
    assert.equal(m.settledCount, 3);
  });

  test('#058: void excluded from the win-rate denominator', () => {
    const m = calcSettlementMetrics([bet('won', 10, 10), bet('lost', 10, -10), bet('void', 10, 0)]);
    assert.ok(approx(m.winRate, 50), `void leaked into denominator: ${m.winRate}`);
    assert.equal(m.settledCount, 3, 'void must still count as settled');
  });

  test('#058: void excluded from ROI eligibility (stake denominator)', () => {
    const m = calcSettlementMetrics([bet('won', 10, 10), bet('void', 100, 0)]);
    assert.equal(m.roiEligibleStake, 10, 'void stake leaked into ROI denominator');
    assert.ok(approx(m.roi, 100), `expected ROI 100, got ${m.roi}`);
  });

  test('#058: net profit sums pnl over won + lost + void only', () => {
    const m = calcSettlementMetrics([
      bet('won', 10, 25),
      bet('lost', 10, -10),
      bet('void', 10, 0),
      bet('pending', 10, null),
      bet('push', 10, 999), // unsupported: pnl must NOT be counted
    ]);
    assert.ok(approx(m.netProfit, 15), `expected 15, got ${m.netProfit}`);
  });

  test('#058: zero eligible stake / empty input returns null metrics safely', () => {
    const empty = calcSettlementMetrics([]);
    assert.equal(empty.winRate, null);
    assert.equal(empty.roi, null);
    assert.equal(empty.avgOdds, null);
    assert.equal(empty.netProfit, 0);
    assert.equal(empty.pendingStake, 0);
    const voidOnly = calcSettlementMetrics([bet('void', 10, 0), bet('pending', 5)]);
    assert.equal(voidOnly.winRate, null, 'void-only must not produce a win rate');
    assert.equal(voidOnly.roi, null, 'void-only must not produce an ROI');
    assert.equal(voidOnly.settledCount, 1);
  });

  test('#058: pending stake includes pending bets only', () => {
    const m = calcSettlementMetrics([
      bet('pending', 30),
      bet('won', 10, 10),
      bet('push', 50),
      bet('mystery_status', 70),
    ]);
    assert.equal(m.pendingStake, 30);
    assert.equal(m.pendingCount, 1);
  });

  test('#058: push / cashed_out / partial / unknown enter no financial metric', () => {
    const base = [bet('won', 10, 10), bet('lost', 10, -10), bet('pending', 5)];
    const noisy = [
      ...base,
      bet('push', 100, 77),
      bet('cashed_out', 100, 55),
      bet('partial', 100, 33),
      bet('half_won', 100, 11), // unknown value
    ];
    const a = calcSettlementMetrics(base);
    const b = calcSettlementMetrics(noisy);
    assert.equal(b.winRate, a.winRate);
    assert.equal(b.roi, a.roi);
    assert.equal(b.netProfit, a.netProfit);
    assert.equal(b.settledCount, a.settledCount);
    assert.equal(b.pendingStake, a.pendingStake);
    assert.equal(b.unsupportedCount, 3);
    assert.equal(b.unknownCount, 1);
  });

  test('#058: settlement P&L predicate allows only won/lost/void', () => {
    for (const s of ['won', 'lost', 'void']) {
      assert.equal(isSupportedSettlementStatus(s), true, `${s} must be P&L-eligible`);
    }
    for (const s of ['pending', 'push', 'cashed_out', 'partial', 'half_won', '', 'WON']) {
      assert.equal(isSupportedSettlementStatus(s), false, `${s} must NOT be P&L-eligible`);
    }
  });

  test('#058: missing pnl counts as 0; zero-stake won/lost gives ROI null; unsupported odds/stake excluded', () => {
    // Missing pnl on a supported settled bet contributes 0 (not coerced).
    const missingPnl = calcSettlementMetrics([bet('won', 10, null, 2.0)]);
    assert.equal(missingPnl.netProfit, 0);
    assert.ok(approx(missingPnl.winRate, 100));
    assert.ok(approx(missingPnl.roi, 0), 'roi must be 0 (0 profit over 10 stake), not null');
    // Zero eligible stake on won/lost still fails safe to null ROI.
    const zeroStake = calcSettlementMetrics([bet('won', 0, 5)]);
    assert.equal(zeroStake.roiEligibleStake, 0);
    assert.equal(zeroStake.roi, null, 'zero-stake won/lost must return ROI null');
    // Unsupported statuses contribute neither odds nor stake to eligibility.
    const withNoise = calcSettlementMetrics([
      bet('won', 10, 10, 2.0),
      bet('push', 100, null, 9.9),
      bet('cashed_out', 100, null, 8.8),
      bet('half_won', 100, null, 7.7),
    ]);
    assert.ok(approx(withNoise.avgOdds, 2.0), 'unsupported odds leaked into avgOdds');
    assert.equal(withNoise.roiEligibleStake, 10, 'unsupported stake leaked into ROI eligibility');
  });

  test('#058: partial resolves to an explicit Partial label, never Void', () => {
    const r = resolveBetStatus('partial');
    assert.equal(r.key, 'partial');
    assert.equal(r.label, 'Partial');
    assert.notEqual(r.label, 'Void');
  });

  test('#058: unknown statuses resolve to Unknown, never Void or raw text', () => {
    for (const value of ['half_won', 'settled', '', 'VOID ', 'garbage']) {
      const r = resolveBetStatus(value);
      assert.equal(r.key, 'unknown', `'${value}' must resolve to unknown`);
      assert.equal(r.label, 'Unknown');
    }
    // Every known status + unknown has an explicit label — no gaps to fall through.
    for (const key of [...KNOWN_BET_STATUSES, 'unknown']) {
      assert.ok(BET_STATUS_LABELS[key], `missing label for ${key}`);
    }
    assert.equal(resolveBetStatus('cashed_out').label, 'Cashed out');
  });

  test('#058: calcPerformance (analytics surface) delegates to the canonical helper', () => {
    const bets = [
      bet('won', 10, 25, 2.0),
      bet('lost', 20, -20, 1.8),
      bet('void', 30, 0),
      bet('pending', 40),
      bet('push', 50, 77),
      bet('partial', 60, 33),
      bet('half_won', 70, 11),
    ];
    const m = calcSettlementMetrics(bets);
    const p = calcPerformance(bets, []);
    assert.equal(p.winRate, m.winRate);
    assert.equal(p.roi, m.roi);
    assert.equal(p.netProfit, m.netProfit);
    assert.equal(p.settledCount, m.settledCount);
    assert.equal(p.pendingStake, m.pendingStake);
    assert.equal(p.wonCount, m.wonCount);
    assert.equal(p.lostCount, m.lostCount);
    assert.equal(p.voidCount, m.voidCount);
    assert.equal(p.pendingCount, m.pendingCount);
    assert.equal(p.avgOdds, m.avgOdds);
  });
});

test('#058: bets/dashboard/coach surfaces use the canonical helper (no competing formulas)', () => {
  const betsPage = readFileSync(path.join(repoRoot, 'app/(app)/bets/page.tsx'), 'utf8');
  const dashboard = readFileSync(path.join(repoRoot, 'app/(app)/dashboard/page.tsx'), 'utf8');
  const detail = readFileSync(path.join(repoRoot, 'app/(app)/bets/[id]/page.tsx'), 'utf8');
  const coach = readFileSync(path.join(repoRoot, 'app/api/coach/route.ts'), 'utf8');
  const perf = readFileSync(path.join(repoRoot, 'lib/analytics/performance.ts'), 'utf8');

  for (const [name, src] of [['bets page', betsPage], ['dashboard', dashboard], ['coach', coach], ['performance', perf]]) {
    assert.ok(src.includes('calcSettlementMetrics'), `${name} must use the canonical metrics helper`);
  }

  // G4: the divergent formulas must not survive anywhere.
  assert.ok(!betsPage.includes("status !== 'pending'"), 'bets page still treats any non-pending status as settled');
  assert.ok(!betsPage.includes('/ settled.length'), 'bets page still divides by all settled (void-in-denominator win rate)');
  assert.ok(!coach.includes('roiStake'), 'coach still recomputes ROI inline');
  assert.ok(!perf.includes('sw.length / (sw.length + sl.length)'), 'performance.ts still recomputes group win rate inline');
});

test('#058: all five status surfaces use the resolver; no Void or raw-text fallback survives', () => {
  const betsPage = readFileSync(path.join(repoRoot, 'app/(app)/bets/page.tsx'), 'utf8');
  const dashboard = readFileSync(path.join(repoRoot, 'app/(app)/dashboard/page.tsx'), 'utf8');
  const detail = readFileSync(path.join(repoRoot, 'app/(app)/bets/[id]/page.tsx'), 'utf8');
  const settleActions = readFileSync(path.join(repoRoot, 'app/(app)/bets/[id]/SettleActions.tsx'), 'utf8');
  const decisionDetail = readFileSync(path.join(repoRoot, 'app/(app)/decisions/[id]/page.tsx'), 'utf8');

  const surfaces = [
    ['bets page', betsPage],
    ['dashboard', dashboard],
    ['bet detail', detail],
    ['SettleActions', settleActions],
    ['decision detail', decisionDetail],
  ];
  for (const [name, src] of surfaces) {
    assert.ok(src.includes('resolveBetStatus'), `${name} must resolve statuses through the canonical resolver`);
  }

  // No fallback path may remain on any surface.
  assert.ok(!betsPage.includes('?? STATUS_STYLE.void'), 'bets page still falls back to the Void style');
  assert.ok(!dashboard.includes('styles[status] ||'), 'dashboard badge still has a silent style fallback');
  assert.ok(!detail.includes("?? 'text-gray-400"), 'detail badge still has a silent style fallback');
  assert.ok(!settleActions.includes('{status}</span>'), 'SettleActions still renders the raw status value');
  assert.ok(!decisionDetail.includes('{linkedBet.status}'), 'decision detail still renders the raw linked-bet status');
  assert.ok(!decisionDetail.includes(": 'text-yellow-400'}"), 'decision detail still has the catch-all yellow fallback');
  for (const [name, src] of surfaces) {
    assert.ok(!/capitalize[^\n]*\$\{styles\[status\]/.test(src), `${name} still styles the raw status value`);
  }
});

test('#058: settlement P&L display is gated on won/lost/void on every P&L surface', () => {
  const betsPage = readFileSync(path.join(repoRoot, 'app/(app)/bets/page.tsx'), 'utf8');
  const dashboard = readFileSync(path.join(repoRoot, 'app/(app)/dashboard/page.tsx'), 'utf8');
  const detail = readFileSync(path.join(repoRoot, 'app/(app)/bets/[id]/page.tsx'), 'utf8');
  const settleActions = readFileSync(path.join(repoRoot, 'app/(app)/bets/[id]/SettleActions.tsx'), 'utf8');

  for (const [name, src] of [['bets page', betsPage], ['dashboard', dashboard], ['bet detail', detail], ['SettleActions', settleActions]]) {
    assert.ok(src.includes('isSupportedSettlementStatus'), `${name} must gate P&L on the supported-settlement predicate`);
  }
  // Every remaining pnl render must sit behind the predicate, not bare `pnl != null`.
  assert.ok(!dashboard.includes('{bet.pnl != null && ('), 'dashboard still shows P&L for any status');
  assert.ok(!detail.includes('{bet.pnl != null && ('), 'bet detail still shows P&L for any status');
  assert.ok(!settleActions.includes('{pnl != null && ('), 'SettleActions still shows P&L for any status');
  assert.ok(betsPage.includes('bet.pnl == null || !isSupportedSettlementStatus(bet.status)'), 'bets page P&L cell must fall back to — for unsupported statuses');
});

// ── Decision #060 Phase A: create_tracked_bet() migration guards ──
// Static contract checks on migration 024 — the atomic tracker-entry
// foundation. Same style as the migration-016 guard test above.

console.log('\nDecision #060 Phase A — create_tracked_bet migration guards:');

test('migration 024: identity, idempotency, and money invariants', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/024_create_tracked_bet.sql'), 'utf8');
  assert.ok(sql.includes('auth.uid()'), 'identity must come from auth.uid()');
  assert.ok(sql.includes("RAISE EXCEPTION 'Not authenticated'"), 'unauthenticated calls must fail');
  assert.ok(sql.includes('is_default = true'), 'must use the default bankroll only');
  assert.ok(!/p_bankroll_id/.test(sql), 'must NOT accept a caller-supplied bankroll id');
  assert.ok(/FROM public\.bankrolls[\s\S]*?FOR UPDATE/.test(sql), 'bankroll row must be locked FOR UPDATE');
  assert.ok(sql.includes("RAISE EXCEPTION 'Insufficient balance'"), 'no-overdraft guard missing');
  assert.ok(sql.includes("RAISE EXCEPTION 'Invalid idempotency key'"), 'UUID idempotency key must be required');
  assert.ok(/v_idempotency_key\s*:=\s*lower\(p_idempotency_key\)/.test(sql), 'UUID key must have one canonical text form');
  assert.ok(/lower\(idempotency_key\) = v_idempotency_key/.test(sql),
    'replay lookup must detect existing UUID keys regardless of letter case');
  assert.ok(sql.includes("RAISE EXCEPTION 'Idempotency conflict'"), 'payload-bound conflict path missing');
  assert.ok(sql.includes("'replayed', true"), 'exact replay must return replayed=true');
  assert.ok(sql.includes('v_request_hash'), 'normalized request hash missing');
  // v2: SHA-256 over the CANONICAL normalized payload, never md5/raw legs.
  assert.ok(/encode\(sha256\(convert_to\(/.test(sql), 'request hash must use built-in sha256');
  assert.ok(!/md5\(/.test(sql), 'md5 must not be used for the request hash');
  assert.ok(/'legs',\s+v_normalized_legs/.test(sql), 'hash must be computed over normalized legs, not raw input');
  assert.ok(/v_stake\s*:=\s*trim_scale\(p_stake\)/.test(sql), 'stake must be normalized before hashing and insertion');
  assert.ok(/'stake',\s+v_stake/.test(sql), 'request hash must use normalized stake');
  assert.ok(!/'stake',\s+p_stake/.test(sql), 'request hash must not use raw stake');
  // v2: STRICT replay — stored tx must be a stake with a bet_id and matching hash.
  assert.ok(/v_existing\.type IS DISTINCT FROM 'stake'\s*\n\s*OR v_existing\.bet_id IS NULL\s*\n\s*OR v_existing\.request_hash IS DISTINCT FROM v_request_hash/.test(sql),
    'replay must verify type=stake, non-null bet_id, and hash equality');
  assert.ok(sql.includes('SECURITY DEFINER'), 'function must be SECURITY DEFINER');
  assert.ok(sql.includes("SET search_path = ''"), 'SECURITY DEFINER search_path must be empty');
  for (const table of ['bankrolls', 'bankroll_transactions', 'bets', 'bet_legs']) {
    assert.ok(sql.includes(`public.${table}`), `${table} references must be schema-qualified`);
  }
});

test('migration 024: leg validation is fail-closed (1-20, canonical sports, bounded odds)', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/024_create_tracked_bet.sql'), 'utf8');
  assert.ok(sql.includes('v_leg_count < 1 OR v_leg_count > 20'), '1..20 legs bound missing');
  assert.ok(sql.includes("'soccer', 'tennis', 'basketball', 'ice_hockey', 'cs2', 'mma', 'other'"), 'canonical sport allowlist missing');
  assert.ok(sql.includes('has unknown field'), 'unknown leg keys must fail closed');
  assert.ok(/jsonb_typeof\(v_leg -> 'odds'\) IS DISTINCT FROM 'number'/.test(sql), 'odds type must be validated');
  assert.ok(sql.includes('v_odds <= 1'), 'leg odds must be > 1');
  assert.ok(sql.includes("RAISE EXCEPTION 'Stake must be positive'"), 'stake > 0 guard missing');
  assert.ok(sql.includes('Stake exceeds sanity limit'), 'stake sanity bound missing');
  // v2: selection is nullable — absent and explicit JSON null are accepted.
  assert.ok(/jsonb_typeof\(v_leg -> 'selection'\) NOT IN \('string', 'null'\)/.test(sql),
    'selection must accept string or explicit JSON null');
  // v2: legs are canonically normalized (trim + NULL-collapsed selection) before use.
  assert.ok(/v_normalized_legs := v_normalized_legs \|\| jsonb_build_object\(/.test(sql), 'canonical normalized legs missing');
  assert.ok(/'selection',\s+NULLIF\(trim\(v_leg ->> 'selection'\), ''\)/.test(sql), 'selection must collapse to NULL in the canonical form');
  assert.ok(/v_odds\s*:=\s*trim_scale\(\(v_leg ->> 'odds'\)::numeric\)/.test(sql), 'odds must use trim_scale');
  assert.ok(/length\(trim\(v_leg ->> 'event_name'\)\) > 200/.test(sql), 'event_name bound must apply after trim');
  assert.ok(/length\(trim\(v_leg ->> 'market_type'\)\) > 100/.test(sql), 'market_type bound must apply after trim');
  assert.ok(/length\(trim\(v_leg ->> 'selection'\)\) > 200/.test(sql), 'selection bound must apply after trim');
});

test('migration 024: single/parlay derivation and preserved leg order', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/024_create_tracked_bet.sql'), 'utf8');
  assert.ok(/v_total_odds\s*:=\s*trim_scale\(\(v_normalized_legs -> 0 ->> 'odds'\)::numeric\)/.test(sql),
    'single must derive normalized total_odds from the normalized leg');
  assert.ok(/v_total_odds\s*:=\s*trim_scale\(p_total_odds\)/.test(sql), 'parlay total_odds must use trim_scale');
  assert.ok(sql.includes("v_bet_type := 'parlay'"), 'multi-leg must become parlay');
  assert.ok(sql.includes("RAISE EXCEPTION 'total_odds is required for a parlay'"), 'parlay must require total_odds');
  assert.ok(sql.includes('leg_index'), 'leg order column missing');
  assert.ok(sql.includes('v_i + 1'), 'legs must be numbered 1..n in input order');
  // v2: order integrity is enforced in the schema, not just in code.
  assert.ok(/CHECK \(leg_index IS NULL OR leg_index BETWEEN 1 AND 20\)/.test(sql), 'leg_index 1..20 CHECK missing');
  assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS uq_bet_legs_bet_leg_index\s*\n\s*ON public\.bet_legs \(bet_id, leg_index\)\s*\n\s*WHERE leg_index IS NOT NULL;/.test(sql),
    'partial UNIQUE (bet_id, leg_index) index missing');
  // Inserted rows must come from the canonical normalized form.
  assert.ok(/v_leg := v_normalized_legs -> v_i;/.test(sql), 'leg inserts must use the normalized legs');
  assert.ok(/VALUES \(\s*v_user_id, v_bankroll_id, v_bet_id, 'stake', -v_stake/.test(sql),
    'stake transaction must use normalized stake');
});

test('migration 024: rollback script and catalog verification are in place', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/024_create_tracked_bet.sql'), 'utf8');
  assert.ok(sql.includes('docs/decision-060-rollback.sql'), 'migration must reference the emergency rollback script');
  assert.ok(sql.includes('prosecdef'), 'catalog verification must check SECURITY DEFINER');
  assert.ok(sql.includes('aclexplode'), 'catalog verification must check the EXECUTE surface');
  assert.ok(sql.includes("'public.create_tracked_bet(jsonb,numeric,numeric,text,text,text,text)'::regprocedure"),
    'catalog verification must bind the exact function signature');
  assert.ok(!/-- 5\. Smoke/.test(sql), 'migration must not embed a bare authenticated smoke call');
  assert.ok(sql.includes('scripts/verify-migration-024.sh'), 'migration must point to the disposable verifier');
  assert.ok(sql.includes('uq_bet_legs_bet_leg_index'), 'catalog verification must check the unique index');
  const rollbackPath = path.join(repoRoot, 'docs/decision-060-rollback.sql');
  const rollback = readFileSync(rollbackPath, 'utf8');
  assert.ok(rollback.includes('DROP FUNCTION public.create_tracked_bet(jsonb, numeric, numeric, text, text, text, text);'),
    'rollback must drop the exact function signature');
  assert.ok(rollback.includes('DROP INDEX public.uq_bet_legs_bet_leg_index;'), 'rollback must drop the unique index');
  assert.ok(rollback.includes('DROP COLUMN leg_index'), 'rollback must drop the leg_index column');
  assert.equal((rollback.match(/^BEGIN;$/gm) ?? []).length, 1, 'rollback must have exactly one BEGIN');
  assert.equal((rollback.match(/^COMMIT;$/gm) ?? []).length, 1, 'rollback must have exactly one COMMIT');
  const preflight = rollback.indexOf('Rollback preflight failed');
  const firstDrop = rollback.indexOf('DROP FUNCTION');
  assert.ok(preflight !== -1 && preflight < firstDrop, 'rollback preflight must execute before destructive statements');
  assert.ok(rollback.includes('Rollback blocked: live leg_index data exists'), 'rollback must reject live ordinal data');
  assert.ok(rollback.includes('Rollback postcondition failed'), 'rollback must enforce executable postconditions');
  assert.ok(/to_regprocedure\(\s*'public\.create_tracked_bet\(jsonb,numeric,numeric,text,text,text,text\)'\s*\)/.test(rollback),
    'rollback must bind the exact function signature');
  assert.ok(!/DROP (FUNCTION|INDEX).*IF EXISTS/.test(rollback), 'rollback destructive statements must fail on drift');
  assert.ok(!rollbackPath.includes(`supabase${path.sep}migrations`), 'rollback must live OUTSIDE supabase/migrations');
});

test('migration 024: no Decision rows, sanitized metadata, grant hygiene', () => {
  const sql = readFileSync(path.join(repoRoot, 'supabase/migrations/024_create_tracked_bet.sql'), 'utf8');
  const sqlNoComments = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  assert.ok(!/INSERT INTO decisions/.test(sqlNoComments), 'tracked bets must NOT create Decision rows');
  // Transaction metadata may carry ONLY request_hash / source / leg_count.
  const metadataMatch = sqlNoComments.match(/INSERT INTO public\.bankroll_transactions[\s\S]*?jsonb_build_object\(([\s\S]*?)\)/);
  assert.ok(metadataMatch, 'stake transaction must carry structured metadata');
  const metadataKeys = [...metadataMatch[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(metadataKeys.sort(), ['leg_count', 'request_hash', 'source'], 'metadata must contain ONLY request_hash/source/leg_count');
  for (const banned of ['rawText', 'statusText', 'scoreText', 'event_name', 'screenshot']) {
    assert.ok(!metadataMatch[1].includes(banned), `raw coupon field ${banned} leaked into metadata`);
  }
  assert.ok(/REVOKE EXECUTE ON FUNCTION public\.create_tracked_bet[\s\S]*?FROM PUBLIC, anon;/.test(sql), 'REVOKE hygiene missing');
  assert.ok(/GRANT {2}EXECUTE ON FUNCTION public\.create_tracked_bet[\s\S]*?TO authenticated, service_role;/.test(sql), 'GRANT surface must be authenticated/service_role only');
  assert.ok(!/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON/.test(sqlNoComments), 'migration must not add direct DML grants');
});

test('migration 024: disposable PostgreSQL 17 verifier covers runtime and rollback contracts', () => {
  const verifierPath = path.join(repoRoot, 'scripts/verify-migration-024.sh');
  assert.ok(existsSync(verifierPath), 'disposable verifier missing');
  const sh = readFileSync(verifierPath, 'utf8');
  assert.ok(sh.startsWith('#!/usr/bin/env bash'), 'verifier must be a bash script');
  assert.ok(sh.includes("server_version_num')::int"), 'verifier must pin PostgreSQL 17');
  assert.ok(sh.includes('ALL 11 STEPS PASSED'), 'verifier must expose its 11-step completion marker');
  for (const marker of [
    'apply migration 024',
    'exact catalog contract',
    'unauthenticated call',
    '2/2.0/2.00 replay equivalence',
    'payload drift and cross-function',
    'insufficient balance',
    'parlay order plus CHECK/UNIQUE',
    'rollback preflight blocks',
    'execute rollback',
    'clean re-apply',
  ]) {
    assert.ok(sh.includes(marker), `verifier missing coverage marker: ${marker}`);
  }
  assert.ok(sh.includes('refusing a production-looking database URL'), 'verifier must reject production-looking URLs');
  assert.ok(/FROM pg_proc proc[\s\S]*?proc\.proacl[\s\S]*?proc\.proowner[\s\S]*?proc\.oid/.test(sh),
    'verifier catalog query must not shadow its PL/pgSQL record variable');
  assert.ok(sh.includes("'B0000000-0000-4000-8000-000000000002'"),
    'verifier must seed an uppercase cross-function idempotency key');
  assert.ok(sh.includes("'b0000000-0000-4000-8000-000000000002'"),
    'verifier must prove the lowercase equivalent conflicts');
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
