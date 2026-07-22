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
      getUser: async () => ({ data: { user: cfg.user === null ? null : (cfg.user ?? { id: 'user-1' }) } }),
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
        async maybeSingle() {
          entry.ops.push({ op: 'maybeSingle' });
          return cfg.maybeSingleRow !== undefined
            ? { data: cfg.maybeSingleRow, error: null }
            : { data: null, error: null };
        },
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
    'app/api/bets/[id]/cancel/route.js',
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

// ── Result grading foundation (candidate-only; no financial write) ───────

console.log('\nAutomatic tracker result grading foundation:');

await withCompiledAlias(async () => {
  const { gradeFootballLeg, gradeExpress } = require(
    path.join(buildDir, 'lib/bets/football-result-grading.js')
  );
  const finished = (fulltime, halftime) => ({ status: 'finished', fulltime, halftime });

  test('auto-grader: first-half 1x2 resolves the selected away team from the halftime score', () => {
    const grade = gradeFootballLeg(
      {
        eventName: 'ФК Елгава - Рижская футбольная школа',
        marketType: '1-я половина - 1x2',
        selection: 'Рижская футбольная школа',
      },
      finished({ home: 1, away: 2 }, { home: 0, away: 1 })
    );
    assert.equal(grade, 'won');
  });

  test('auto-grader: half-goal totals resolve over/under without inventing push semantics', () => {
    const over = gradeFootballLeg(
      { eventName: 'SK Super Nova - Grobinas SC', marketType: 'Тотал', selection: 'больше 1.5' },
      finished({ home: 1, away: 1 }, { home: 0, away: 0 })
    );
    const under = gradeFootballLeg(
      { eventName: 'A - B', marketType: 'Total', selection: 'Under 2.5' },
      finished({ home: 1, away: 0 }, { home: 0, away: 0 })
    );
    assert.equal(over, 'won');
    assert.equal(under, 'won');
  });

  test('auto-grader: ambiguous markets and non-final exceptional states fail closed', () => {
    const score = finished({ home: 2, away: 0 }, { home: 1, away: 0 });
    assert.equal(
      gradeFootballLeg({ eventName: 'A - B', marketType: 'Asian handicap', selection: '-0.25' }, score),
      'needs_review'
    );
    assert.equal(
      gradeFootballLeg(
        { eventName: 'A - B', marketType: 'Total', selection: 'Over 2' },
        score
      ),
      'needs_review',
      'whole lines require push semantics and must never auto-grade'
    );
    assert.equal(
      gradeFootballLeg(
        { eventName: 'A - B', marketType: '1x2', selection: 'A' },
        { status: 'abandoned', fulltime: { home: 1, away: 0 }, halftime: { home: 1, away: 0 } }
      ),
      'needs_review'
    );
    assert.equal(
      gradeFootballLeg(
        { eventName: 'A - B', marketType: '1x2', selection: 'A' },
        { status: 'cancelled', fulltime: { home: 0, away: 0 }, halftime: { home: 0, away: 0 } }
      ),
      'needs_review',
      'bookmaker-specific cancelled-fixture policy must never be invented'
    );
    assert.equal(
      gradeFootballLeg(
        { eventName: 'A - B', marketType: '1x2', selection: 'A' },
        { status: 'unknown', fulltime: { home: 2, away: 0 }, halftime: { home: 1, away: 0 } }
      ),
      'needs_review'
    );
  });

  test('auto-grader: only exact match-goal total markets with x.5 lines are supported', () => {
    const score = finished({ home: 2, away: 1 }, { home: 1, away: 0 });
    const blockedMarkets = [
      'Team Total',
      'Home Team Total',
      'Individual Total',
      'Corners Total',
      'Cards Total',
      'Тотал угловых',
      'Тотал карточек',
      'Индивидуальный тотал',
    ];

    for (const marketType of blockedMarkets) {
      assert.equal(
        gradeFootballLeg({ eventName: 'A - B', marketType, selection: 'Over 1.5' }, score),
        'needs_review',
        `${marketType} must not be graded from match goals`
      );
    }

    for (const line of ['Over 2.25', 'Over 2.75', 'Under 2.25', 'Under 2.75']) {
      assert.equal(
        gradeFootballLeg({ eventName: 'A - B', marketType: 'Total', selection: line }, score),
        'needs_review',
        `${line} requires quarter-line settlement semantics`
      );
    }

    for (const selection of [
      'Over 9.5 corners',
      'Больше 9.5 угловых',
      'Більше 9.5 кутових',
      'Under 4.5 cards',
      'Меньше 4.5 карточек',
      'Over 1.5 team goals',
      'Больше 1.5 индивидуальный тотал',
    ]) {
      assert.equal(
        gradeFootballLeg({ eventName: 'A - B', marketType: 'Total', selection }, score),
        'needs_review',
        `${selection} must not be graded from match goals through a bare Total market`
      );
    }
  });

  test('auto-grader: malformed scores and ambiguous duplicate participant names fail closed', () => {
    assert.equal(
      gradeFootballLeg(
        { eventName: 'A - B', marketType: '1x2', selection: 'A' },
        finished({ home: -1, away: 0 }, { home: 0, away: 0 })
      ),
      'needs_review',
      'negative full-time scores must never produce a winner'
    );
    assert.equal(
      gradeFootballLeg(
        { eventName: 'A - B', marketType: 'Total', selection: 'Under 2.5' },
        finished({ home: 1, away: -1 }, { home: 0, away: 0 })
      ),
      'needs_review',
      'negative score components must never be summed for totals'
    );
    assert.equal(
      gradeFootballLeg(
        { eventName: 'United - United', marketType: '1x2', selection: 'United' },
        finished({ home: 1, away: 0 }, { home: 0, away: 0 })
      ),
      'needs_review',
      'duplicate normalized participant names cannot identify a side'
    );
  });

  test('auto-grader: Express is won only when every leg wins and never auto-reprices void legs', () => {
    assert.equal(gradeExpress(['won', 'won']), 'won');
    assert.equal(gradeExpress(['won', 'lost']), 'lost');
    assert.equal(gradeExpress(['won', 'pending']), 'pending');
    assert.equal(gradeExpress(['won', 'void']), 'needs_review');
    assert.equal(gradeExpress(['won']), 'needs_review');
  });
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
    assert.equal(p.unsupportedCount, m.unsupportedCount);
    assert.equal(p.unknownCount, m.unknownCount);
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

// ── Decision #060 Phase B: submit-intent state machine (behavioral) ──
// These tests import the COMPILED pure helper and drive real
// transitions with an injected deterministic UUID generator — they
// test behavior, not source text. The wiring test further below only
// confirms the form actually uses this machine.

console.log('\nDecision #060 Phase B — submit-intent state machine (behavioral):');

function loadTrackedBetLib() {
  const compiledPath = path.join(buildDir, 'lib/bets/tracked-bet.js');
  try { delete require.cache[require.resolve(compiledPath)]; } catch { /* not loaded */ }
  return require(compiledPath);
}

function makeUuidSequence() {
  let n = 0;
  const gen = () => `uuid-${++n}`;
  gen.count = () => n;
  return gen;
}

test('intent: first submit mints exactly one UUID and goes in_flight', () => {
  const { createSubmitIntent, beginSubmit, fingerprintPayload } = loadTrackedBetLib();
  const gen = makeUuidSequence();
  const fp = fingerprintPayload({ stake: 50 });

  const begin = beginSubmit(createSubmitIntent(), fp, gen);
  assert.equal(begin.ok, true);
  assert.equal(begin.key, 'uuid-1');
  assert.equal(gen.count(), 1, 'exactly one UUID must be generated');
  assert.deepEqual(begin.intent, { status: 'in_flight', fingerprint: fp, key: 'uuid-1' });
});

test('intent: resubmit while in_flight is blocked with no new UUID (double click)', () => {
  const { createSubmitIntent, beginSubmit, fingerprintPayload } = loadTrackedBetLib();
  const gen = makeUuidSequence();
  const fp = fingerprintPayload({ stake: 50 });

  const first = beginSubmit(createSubmitIntent(), fp, gen);
  const second = beginSubmit(first.intent, fp, gen);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'in_flight');
  assert.equal(gen.count(), 1, 'the double click must not mint a UUID');
  assert.deepEqual(second.intent, first.intent, 'the in-flight intent must be untouched');
});

test('intent: network error / 429 / 503 / 5xx keep the UUID and snapshot', () => {
  const { createSubmitIntent, beginSubmit, resolveSubmit, fingerprintPayload } = loadTrackedBetLib();
  const gen = makeUuidSequence();
  const fp = fingerprintPayload({ stake: 50 });

  const begin = beginSubmit(createSubmitIntent(), fp, gen);
  // One 'retryable' resolution models EVERY non-409 failure the form
  // maps (network throw, 429, 503, 500) — the transition is identical.
  const after = resolveSubmit(begin.intent, 'retryable');
  assert.deepEqual(after, { status: 'ready', fingerprint: fp, key: 'uuid-1' },
    'a retryable failure must keep the UUID and the payload snapshot');
});

test('intent: exact retry after a retryable failure reuses the SAME UUID', () => {
  const { createSubmitIntent, beginSubmit, resolveSubmit, fingerprintPayload } = loadTrackedBetLib();
  const gen = makeUuidSequence();
  const fp = fingerprintPayload({ stake: 50 });

  const first = beginSubmit(createSubmitIntent(), fp, gen);
  const afterFailure = resolveSubmit(first.intent, 'retryable');
  const retry = beginSubmit(afterFailure, fp, gen);
  assert.equal(retry.ok, true);
  assert.equal(retry.key, 'uuid-1', 'the exact retry must reuse the same UUID');
  assert.equal(gen.count(), 1, 'no second UUID may be generated for an exact retry');
});

test('intent: a 409 moves the intent to conflict, keeping the UUID and snapshot', () => {
  const { createSubmitIntent, beginSubmit, resolveSubmit, fingerprintPayload } = loadTrackedBetLib();
  const gen = makeUuidSequence();
  const fp = fingerprintPayload({ stake: 50 });

  const begin = beginSubmit(createSubmitIntent(), fp, gen);
  const conflicted = resolveSubmit(begin.intent, 'conflict');
  assert.deepEqual(conflicted, { status: 'conflict', fingerprint: fp, key: 'uuid-1' },
    'a conflict must never clear or rotate the UUID');
});

test('intent: unchanged payload after a 409 is blocked — no fetch decision, no new UUID', () => {
  const { createSubmitIntent, beginSubmit, resolveSubmit, fingerprintPayload } = loadTrackedBetLib();
  const gen = makeUuidSequence();
  const fp = fingerprintPayload({ stake: 50 });

  const begin = beginSubmit(createSubmitIntent(), fp, gen);
  const conflicted = resolveSubmit(begin.intent, 'conflict');
  const blocked = beginSubmit(conflicted, fp, gen);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'conflict_unchanged');
  assert.equal(gen.count(), 1, 'the blocked resubmit must not mint a UUID');
  assert.deepEqual(blocked.intent, conflicted, 'the conflicted intent must stay locked');
});

test('intent: changing the payload after a 409 starts a NEW intent with a NEW UUID', () => {
  const { createSubmitIntent, beginSubmit, resolveSubmit, fingerprintPayload } = loadTrackedBetLib();
  const gen = makeUuidSequence();
  const fp1 = fingerprintPayload({ stake: 50 });
  const fp2 = fingerprintPayload({ stake: 60 });

  const begin = beginSubmit(createSubmitIntent(), fp1, gen);
  const conflicted = resolveSubmit(begin.intent, 'conflict');
  const fresh = beginSubmit(conflicted, fp2, gen);
  assert.equal(fresh.ok, true);
  assert.equal(fresh.key, 'uuid-2', 'the edited payload must get a fresh UUID');
  assert.deepEqual(fresh.intent, { status: 'in_flight', fingerprint: fp2, key: 'uuid-2' });
});

test('intent: success clears the intent completely', () => {
  const { createSubmitIntent, beginSubmit, resolveSubmit, fingerprintPayload } = loadTrackedBetLib();
  const gen = makeUuidSequence();

  const begin = beginSubmit(createSubmitIntent(), fingerprintPayload({ stake: 50 }), gen);
  const done = resolveSubmit(begin.intent, 'success');
  assert.deepEqual(done, { status: 'ready', fingerprint: null, key: null },
    'success must clear the fingerprint and the key');
});

test('intent: a new submit after success gets a NEW UUID even for the same payload', () => {
  const { createSubmitIntent, beginSubmit, resolveSubmit, fingerprintPayload } = loadTrackedBetLib();
  const gen = makeUuidSequence();
  const fp = fingerprintPayload({ stake: 50 });

  const first = beginSubmit(createSubmitIntent(), fp, gen);
  const done = resolveSubmit(first.intent, 'success');
  const next = beginSubmit(done, fp, gen);
  assert.equal(next.ok, true);
  assert.equal(next.key, 'uuid-2', 'a completed intent must never leak its UUID into the next one');
});

test('intent: the injected UUID generator makes the whole lifecycle deterministic', () => {
  const { createSubmitIntent, beginSubmit, resolveSubmit, fingerprintPayload } = loadTrackedBetLib();

  const runScenario = () => {
    const gen = makeUuidSequence();
    const keys = [];
    const fp1 = fingerprintPayload({ stake: 50 });
    const fp2 = fingerprintPayload({ stake: 60 });

    let step = beginSubmit(createSubmitIntent(), fp1, gen);          // uuid-1
    keys.push(step.key);
    let intent = resolveSubmit(step.intent, 'retryable');
    step = beginSubmit(intent, fp1, gen);                            // exact retry → uuid-1
    keys.push(step.key);
    intent = resolveSubmit(step.intent, 'conflict');
    step = beginSubmit(intent, fp2, gen);                            // new intent → uuid-2
    keys.push(step.key);
    intent = resolveSubmit(step.intent, 'success');
    step = beginSubmit(intent, fp2, gen);                            // after success → uuid-3
    keys.push(step.key);
    return keys;
  };

  assert.deepEqual(runScenario(), ['uuid-1', 'uuid-1', 'uuid-2', 'uuid-3']);
  assert.deepEqual(runScenario(), runScenario(), 'two identical runs must produce identical key sequences');
});

test('intent: fingerprintPayload is stable for equal payloads and distinct for different ones', () => {
  const { fingerprintPayload } = loadTrackedBetLib();
  const a1 = fingerprintPayload({ legs: [{ odds: 2 }], stake: 50 });
  const a2 = fingerprintPayload({ legs: [{ odds: 2 }], stake: 50 });
  const b  = fingerprintPayload({ legs: [{ odds: 2 }], stake: 51 });
  assert.equal(a1, a2, 'equal payloads must share one fingerprint');
  assert.notEqual(a1, b, 'different payloads must not collide');
});

// ── Decision #062 Phase 1A: native Bearer authentication bridge ─────
// Exercises the compiled request-scoped adapter directly. A request carrying
// Authorization is token-only and can never fall back to a browser cookie.

console.log('\nDecision #062 Phase 1A — authenticated Bearer bridge:');

const REQUEST_AUTH_MODULE = 'lib/supabase/request-auth.js';

function jwtWithRole(role) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ role })}.signature`;
}

function makeAuthOnlyClient({ user = { id: 'verified-user' }, error = null } = {}) {
  const calls = { getUser: [] };
  return {
    calls,
    auth: {
      async getUser(token) {
        calls.getUser.push(token);
        return { data: { user }, error };
      },
    },
  };
}

function clearRequestAuthModules() {
  for (const rel of [REQUEST_AUTH_MODULE, 'lib/supabase/server.js']) {
    try { delete require.cache[require.resolve(path.join(buildDir, rel))]; } catch { /* not loaded */ }
  }
}

async function withRequestAuthHarness({ cookieClient, bearerClient }, fn) {
  return withCompiledAlias(async () => {
    clearRequestAuthModules();

    const serverPath = path.join(buildDir, 'lib/supabase/server.js');
    let cookieCreates = 0;
    require.cache[require.resolve(serverPath)] = {
      id: serverPath,
      filename: serverPath,
      loaded: true,
      exports: {
        createClient: async () => {
          cookieCreates++;
          return cookieClient;
        },
      },
    };

    const packagePath = require.resolve('@supabase/supabase-js');
    const originalPackageModule = require.cache[packagePath];
    const bearerCreates = [];
    require.cache[packagePath] = {
      id: packagePath,
      filename: packagePath,
      loaded: true,
      exports: {
        createClient: (url, key, options) => {
          bearerCreates.push({ url, key, options });
          return bearerClient;
        },
      },
    };

    const previousEnv = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      service: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://local-auth.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';

    try {
      const adapter = require(path.join(buildDir, REQUEST_AUTH_MODULE));
      return await fn(adapter, {
        bearerCreates,
        cookieCreates: () => cookieCreates,
      });
    } finally {
      clearRequestAuthModules();
      if (originalPackageModule) require.cache[packagePath] = originalPackageModule;
      else delete require.cache[packagePath];
      if (previousEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousEnv.url;
      if (previousEnv.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousEnv.anon;
      if (previousEnv.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousEnv.service;
    }
  });
}

await testAsync('request-auth: missing Authorization preserves the verified cookie-session flow', async () => {
  const cookieClient = makeAuthOnlyClient({ user: { id: 'cookie-user' } });
  const bearerClient = makeAuthOnlyClient();
  await withRequestAuthHarness({ cookieClient, bearerClient }, async ({ authenticateRequest }, calls) => {
    const result = await authenticateRequest(new Request('https://example.test/api/bets/tracked'));
    assert.equal(result.authorized, true);
    assert.equal(result.user.id, 'cookie-user');
    assert.equal(result.supabase, cookieClient);
    assert.equal(calls.cookieCreates(), 1);
    assert.equal(calls.bearerCreates.length, 0);
    assert.deepEqual(cookieClient.calls.getUser, [undefined]);
  });
});

await testAsync('request-auth: valid Bearer uses a request-scoped anon client and verified JWT identity', async () => {
  const token = jwtWithRole('authenticated');
  const cookieClient = makeAuthOnlyClient({ user: { id: 'cookie-user' } });
  const bearerClient = makeAuthOnlyClient({ user: { id: 'mobile-user' } });
  await withRequestAuthHarness({ cookieClient, bearerClient }, async ({ authenticateRequest }, calls) => {
    const result = await authenticateRequest(new Request('https://example.test/api/bets/tracked', {
      headers: { Authorization: `Bearer ${token}` },
    }));
    assert.equal(result.authorized, true);
    assert.equal(result.user.id, 'mobile-user', 'identity must come only from getUser(token)');
    assert.equal(result.supabase, bearerClient);
    assert.equal(calls.cookieCreates(), 0);
    assert.equal(calls.bearerCreates.length, 1);
    assert.equal(calls.bearerCreates[0].url, 'https://local-auth.test');
    assert.equal(calls.bearerCreates[0].key, 'fake-anon-key');
    assert.equal(calls.bearerCreates[0].options.global.headers.Authorization, `Bearer ${token}`);
    assert.equal(calls.bearerCreates[0].options.auth.persistSession, false);
    assert.equal(calls.bearerCreates[0].options.auth.autoRefreshToken, false);
    assert.deepEqual(bearerClient.calls.getUser, [token]);
  });
});

await testAsync('request-auth: malformed or invalid Bearer fails closed without cookie fallback', async () => {
  for (const [authorization, bearerUser, expectedCreates] of [
    ['', { id: 'mobile-user' }, 0],
    ['Basic abc', { id: 'mobile-user' }, 0],
    ['Bearer', { id: 'mobile-user' }, 0],
    ['Bearer one two', { id: 'mobile-user' }, 0],
    ['Bearer invalid-token', null, 1],
  ]) {
    const cookieClient = makeAuthOnlyClient({ user: { id: 'cookie-user' } });
    const bearerClient = makeAuthOnlyClient({ user: bearerUser });
    await withRequestAuthHarness({ cookieClient, bearerClient }, async ({ authenticateRequest }, calls) => {
      const result = await authenticateRequest(new Request('https://example.test/api/ai/scanner', {
        headers: { Authorization: authorization },
      }));
      assert.equal(result.authorized, false);
      assert.equal(calls.cookieCreates(), 0, `${authorization}: cookie fallback is forbidden`);
      assert.equal(calls.bearerCreates.length, expectedCreates);
    });
  }
});

await testAsync('request-auth: service credentials are rejected before client creation or network validation', async () => {
  for (const token of ['fake-service-key', jwtWithRole('service_role')]) {
    const cookieClient = makeAuthOnlyClient({ user: { id: 'cookie-user' } });
    const bearerClient = makeAuthOnlyClient({ user: { id: 'service-user' } });
    await withRequestAuthHarness({ cookieClient, bearerClient }, async ({ authenticateRequest }, calls) => {
      const result = await authenticateRequest(new Request('https://example.test/api/bets/tracked', {
        headers: { Authorization: `Bearer ${token}` },
      }));
      assert.equal(result.authorized, false);
      assert.equal(calls.cookieCreates(), 0);
      assert.equal(calls.bearerCreates.length, 0, 'service credentials must be rejected pre-network');
      assert.equal(bearerClient.calls.getUser.length, 0);
    });
  }
});

// ── Decision #060 Phase B: /api/bets/tracked write path ──────────────
// The unified Single/Express form writes ONLY through POST
// /api/bets/tracked → create_tracked_bet() as the authenticated user.
// These tests run the compiled route with the same stubbed server
// client as the deposit tests, plus a controllable rate-limiter stub.

console.log('\nDecision #060 Phase B — /api/bets/tracked route:');

const TRACKED_ROUTE = 'app/api/bets/tracked/route.js';

let rateState = null;

function stubRateLimitModule() {
  const p = path.join(buildDir, 'lib/rate-limit.js');
  require.cache[require.resolve(p)] = {
    id: p, filename: p, loaded: true,
    exports: {
      enforceRateLimit: async (key, windows) => {
        rateState.calls.push({ key, windows });
        return rateState.result;
      },
      RATE_LIMITS: {
        trackedBet: () => [{ limit: 10, seconds: 60 }],
        scanner: () => [{ limit: 5, seconds: 60 }],
      },
    },
  };
}

let routeAuthState = null;

function stubRequestAuthModule() {
  const p = path.join(buildDir, REQUEST_AUTH_MODULE);
  require.cache[require.resolve(p)] = {
    id: p, filename: p, loaded: true,
    exports: {
      authenticateRequest: async (req) => {
        routeAuthState.calls.push(req.headers.get('authorization'));
        if (routeAuthState.override) return routeAuthState.override;
        const { data: { user } } = await currentStub.auth.getUser();
        return user
          ? { authorized: true, supabase: currentStub, user }
          : { authorized: false };
      },
    },
  };
}

function clearTrackedBetModules() {
  for (const rel of [TRACKED_ROUTE, REQUEST_AUTH_MODULE, 'lib/supabase/server.js', 'lib/analytics/server.js', 'lib/rate-limit.js', 'lib/bets/tracked-bet.js']) {
    try { delete require.cache[require.resolve(path.join(buildDir, rel))]; } catch { /* not loaded */ }
  }
}

async function withTrackedBetRoute(stub, rate, fn, authOverride = null) {
  return withCompiledAlias(async () => {
    clearTrackedBetModules();
    currentStub = stub;
    rateState = { result: rate ?? { allowed: true, retryAfter: 0, unavailable: false }, calls: [] };
    routeAuthState = { override: authOverride, calls: [] };
    stubServerModules();
    stubRequestAuthModule();
    stubRateLimitModule();
    const route = require(path.join(buildDir, TRACKED_ROUTE));
    try {
      return await fn(route, rateState);
    } finally {
      clearTrackedBetModules();
      currentStub = null;
      rateState = null;
      routeAuthState = null;
    }
  });
}

const TRACKED_URL = 'https://example.test/api/bets/tracked';
const TRACKED_KEY = '22222222-bbbb-4ccc-8ddd-333333333333';

function singleLegBody(overrides = {}) {
  return {
    legs: [{ sport: 'soccer', event_name: 'Arsenal vs Coventry', market_type: '1X2', selection: 'home', odds: 2.1 }],
    stake: 50,
    source: 'manual',
    idempotency_key: TRACKED_KEY,
    ...overrides,
  };
}

function trackedRpcOk(overrides = {}) {
  return {
    create_tracked_bet: {
      data: { bet_id: 'bet-060', balance: 950, replayed: false, ...overrides },
      error: null,
    },
  };
}

function trackedRpcError(message) {
  return { create_tracked_bet: { data: null, error: { message } } };
}

await testAsync('tracked-bet: unauthenticated → 401 before the limiter and the financial RPC', async () => {
  const stub = makeStubClient({ user: null });
  await withTrackedBetRoute(stub, null, async ({ POST }, rate) => {
    const response = await POST(jsonRequest(TRACKED_URL, singleLegBody()));
    assert.equal(response.status, 401);
    assert.equal(rate.calls.length, 0, 'limiter must not be consulted for anonymous requests');
    assert.equal(stub.calls.rpc.length, 0, 'financial RPC must not run for anonymous requests');
  });
});

await testAsync('tracked-bet: rate-limited → 429 + Retry-After, keyed per user, RPC not called', async () => {
  const stub = makeStubClient({ rpcResults: trackedRpcOk() });
  await withTrackedBetRoute(stub, { allowed: false, retryAfter: 30, unavailable: false }, async ({ POST }, rate) => {
    const response = await POST(jsonRequest(TRACKED_URL, singleLegBody()));
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '30');
    assert.equal(rate.calls.length, 1);
    assert.equal(rate.calls[0].key, 'tracked-bet:user-1', 'limiter must be keyed per user');
    assert.equal(stub.calls.rpc.length, 0);
  });
});

await testAsync('tracked-bet: verified native identity keys the limiter and authenticated RPC client', async () => {
  const stub = makeStubClient({ user: null, rpcResults: trackedRpcOk() });
  const mobileUser = { id: 'mobile-user' };
  await withTrackedBetRoute(stub, null, async ({ POST }, rate) => {
    const response = await POST(new Request(TRACKED_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${jwtWithRole('authenticated')}`,
      },
      body: JSON.stringify(singleLegBody()),
    }));
    assert.equal(response.status, 200);
    assert.equal(rate.calls[0].key, 'tracked-bet:mobile-user');
    assert.equal(stub.calls.rpc.length, 1, 'verified request client must execute the authenticated RPC');
  }, { authorized: true, supabase: stub, user: mobileUser });
});

await testAsync('tracked-bet: limiter unavailable → 503 fail-closed, RPC not called', async () => {
  const stub = makeStubClient({ rpcResults: trackedRpcOk() });
  await withTrackedBetRoute(stub, { allowed: false, retryAfter: 60, unavailable: true }, async ({ POST }) => {
    const response = await POST(jsonRequest(TRACKED_URL, singleLegBody()));
    assert.equal(response.status, 503);
    assert.equal(stub.calls.rpc.length, 0);
  });
});

await testAsync('tracked-bet: strict schema fails closed — unknown fields, 21 legs, express without total odds', async () => {
  const stub = makeStubClient({ rpcResults: trackedRpcOk() });
  await withTrackedBetRoute(stub, null, async ({ POST }) => {
    const leg = () => ({ sport: 'soccer', event_name: 'E', market_type: '1X2', odds: 2 });

    let response = await POST(jsonRequest(TRACKED_URL, singleLegBody({ rawText: 'leak' })));
    assert.equal(response.status, 400, 'unknown top-level field must fail closed');

    response = await POST(jsonRequest(TRACKED_URL, singleLegBody({
      legs: [{ ...leg(), statusText: 'Лайв' }],
    })));
    assert.equal(response.status, 400, 'unknown leg field must fail closed');

    response = await POST(jsonRequest(TRACKED_URL, singleLegBody({
      legs: Array.from({ length: 21 }, leg),
      total_odds: 999,
    })));
    assert.equal(response.status, 400, '21 legs must fail closed');

    response = await POST(jsonRequest(TRACKED_URL, singleLegBody({
      legs: [leg(), leg()],
    })));
    assert.equal(response.status, 400, 'an express without total odds must fail closed');

    response = await POST(jsonRequest(TRACKED_URL, singleLegBody({ stake: -5 })));
    assert.equal(response.status, 400, 'negative stake must fail closed');

    assert.equal(stub.calls.rpc.length, 0, 'no failed validation may reach the RPC');

    // The 20-leg maximum itself is accepted.
    response = await POST(jsonRequest(TRACKED_URL, singleLegBody({
      legs: Array.from({ length: 20 }, (_, i) => ({ ...leg(), event_name: `E${i + 1}` })),
      total_odds: 500,
    })));
    assert.equal(response.status, 200, '20 legs must be accepted');
    assert.equal(stub.calls.rpc.length, 1);
  });
});

await testAsync('tracked-bet: manual single maps to create_tracked_bet with derived total odds', async () => {
  const stub = makeStubClient({ rpcResults: trackedRpcOk() });
  await withTrackedBetRoute(stub, null, async ({ POST }) => {
    const response = await POST(jsonRequest(TRACKED_URL, singleLegBody()));
    const result = await readJsonResponse(response);

    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.bet_id, 'bet-060');
    assert.equal(result.body.replayed, false);

    assert.equal(stub.calls.rpc.length, 1);
    const call = stub.calls.rpc[0];
    assert.equal(call.name, 'create_tracked_bet');
    assert.equal(call.args.p_total_odds, null, 'single must let the RPC derive total odds');
    assert.equal(call.args.p_source, 'manual');
    assert.equal(call.args.p_stake, 50);
    assert.equal(call.args.p_idempotency_key, TRACKED_KEY, 'client idempotency key must pass through');
    assert.deepEqual(call.args.p_legs, [{
      sport: 'soccer', event_name: 'Arsenal vs Coventry', market_type: '1X2', selection: 'home', odds: 2.1,
    }]);
    assertNoFinancialTableAccess(stub);
  });
});

await testAsync('tracked-bet: scanner express preserves leg order, exact contract keys, required total odds', async () => {
  const stub = makeStubClient({ rpcResults: trackedRpcOk() });
  await withTrackedBetRoute(stub, null, async ({ POST }) => {
    const response = await POST(jsonRequest(TRACKED_URL, {
      legs: [
        { sport: 'soccer', event_name: 'L1', market_type: '1X2', selection: 'home', odds: 2.0 },
        { sport: 'tennis', event_name: 'L2', market_type: 'winner', selection: null, odds: 1.5 },
        { sport: 'cs2', event_name: 'L3', market_type: 'map', odds: 3.0 },
      ],
      total_odds: 9,
      stake: 20,
      source: 'scanner',
      idempotency_key: TRACKED_KEY,
    }));
    assert.equal(response.status, 200);

    const call = stub.calls.rpc[0];
    assert.equal(call.args.p_total_odds, 9, 'express must pass the entered total odds');
    assert.equal(call.args.p_source, 'scanner');
    assert.deepEqual(call.args.p_legs.map((l) => l.event_name), ['L1', 'L2', 'L3'], 'leg order must be preserved');
    for (const legPayload of call.args.p_legs) {
      assert.deepEqual(Object.keys(legPayload).sort(), ['event_name', 'market_type', 'odds', 'selection', 'sport'],
        'exactly the five contract keys may reach the RPC');
    }
    assert.equal(call.args.p_legs[1].selection, null, 'explicit null selection must stay null');
    assert.equal(call.args.p_legs[2].selection, null, 'absent selection must collapse to null');
    assertNoFinancialTableAccess(stub);
  });
});

await testAsync('tracked-bet: business errors map sanitized — 422 / 404 / 409, no raw DB text', async () => {
  for (const [message, status, expected] of [
    ['Insufficient balance', 422, 'Insufficient balance'],
    ['No default bankroll found', 404, 'Bankroll not found'],
    ['Idempotency conflict', 409, 'Request conflict'],
    ['Leg 2 has invalid odds', 422, 'Bet validation failed'],
  ]) {
    const stub = makeStubClient({ rpcResults: trackedRpcError(message) });
    await withTrackedBetRoute(stub, null, async ({ POST }) => {
      const response = await POST(jsonRequest(TRACKED_URL, singleLegBody({
        legs: [
          { sport: 'soccer', event_name: 'L1', market_type: '1X2', odds: 2 },
          { sport: 'soccer', event_name: 'L2', market_type: '1X2', odds: 2 },
        ],
        total_odds: 4,
      })));
      const result = await readJsonResponse(response);
      assert.equal(result.status, status, `${message} must map to ${status}`);
      assert.equal(result.body.error, expected);
    });
  }
});

await testAsync('tracked-bet: unknown DB error → 500 generic; raw message never leaks', async () => {
  const stub = makeStubClient({ rpcResults: trackedRpcError('deadlock detected on pk_bankrolls_secret_042') });
  await withTrackedBetRoute(stub, null, async ({ POST }) => {
    const response = await POST(jsonRequest(TRACKED_URL, singleLegBody()));
    const result = await readJsonResponse(response);
    assert.equal(result.status, 500);
    assert.equal(result.body.error, 'Transaction failed');
    assert.ok(!JSON.stringify(result.body).includes('deadlock'), 'raw DB text must not leak');
    assert.ok(!JSON.stringify(result.body).includes('secret'), 'raw DB identifiers must not leak');
  });
});

await testAsync('tracked-bet: exact replay passes through — 200, same bet id, replayed=true', async () => {
  const stub = makeStubClient({ rpcResults: trackedRpcOk({ replayed: true }) });
  await withTrackedBetRoute(stub, null, async ({ POST }) => {
    const response = await POST(jsonRequest(TRACKED_URL, singleLegBody()));
    const result = await readJsonResponse(response);
    assert.equal(result.status, 200);
    assert.equal(result.body.bet_id, 'bet-060');
    assert.equal(result.body.replayed, true);
  });
});

const SCANNER_ROUTE = 'app/api/ai/scanner/route.js';

function clearScannerModules() {
  for (const rel of [
    SCANNER_ROUTE,
    REQUEST_AUTH_MODULE,
    'lib/analytics/server.js',
    'lib/rate-limit.js',
    'lib/ai/coupon-scanner.js',
  ]) {
    try { delete require.cache[require.resolve(path.join(buildDir, rel))]; } catch { /* not loaded */ }
  }
}

async function withScannerRoute(stub, rate, fn, authOverride = null) {
  return withCompiledAlias(async () => {
    clearScannerModules();
    currentStub = stub;
    rateState = { result: rate ?? { allowed: true, retryAfter: 0, unavailable: false }, calls: [] };
    routeAuthState = { override: authOverride, calls: [] };
    stubServerModules();
    stubRequestAuthModule();
    stubRateLimitModule();
    const route = require(path.join(buildDir, SCANNER_ROUTE));
    try {
      return await fn(route, rateState);
    } finally {
      clearScannerModules();
      currentStub = null;
      rateState = null;
      routeAuthState = null;
    }
  });
}

await testAsync('scanner: timeout returns sanitized 504 and never performs an automatic provider retry', async () => {
  const stub = makeStubClient({ user: null });
  const previousApiKey = process.env.ANTHROPIC_API_KEY;
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  process.env.ANTHROPIC_API_KEY = 'fake-provider-key';
  globalThis.fetch = async () => {
    providerCalls++;
    const error = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';
    throw error;
  };

  try {
    await withScannerRoute(stub, null, async ({ POST }, rate) => {
      const response = await POST(new Request('https://example.test/api/ai/scanner', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${jwtWithRole('authenticated')}`,
        },
        body: JSON.stringify({ image: 'jpeg-base64', media_type: 'image/jpeg' }),
      }));
      const result = await readJsonResponse(response);
      assert.equal(result.status, 504);
      assert.equal(result.body.error, 'Scanner timed out — please try again');
      assert.equal(providerCalls, 1, 'ambiguous timeout must never auto-retry paid provider work');
      assert.equal(rate.calls[0].key, 'scanner:mobile-user');
    }, { authorized: true, supabase: stub, user: { id: 'mobile-user' } });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousApiKey;
  }
});

await testAsync('scanner: cookie user rate limit remains fail-closed before provider work', async () => {
  const stub = makeStubClient({ user: { id: 'cookie-user' } });
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls++;
    throw new Error('provider must not be reached');
  };

  try {
    await withScannerRoute(
      stub,
      { allowed: false, retryAfter: 17, unavailable: false },
      async ({ POST }, rate) => {
        const response = await POST(jsonRequest('https://example.test/api/ai/scanner', {
          image: 'jpeg-base64', media_type: 'image/jpeg',
        }));
        assert.equal(response.status, 429);
        assert.equal(response.headers.get('Retry-After'), '17');
        assert.equal(rate.calls[0].key, 'scanner:cookie-user');
        assert.equal(providerCalls, 0);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('tracked-bet: form and route sources — API-only path, idempotency lifecycle, no service_role', () => {
  // The route exists ONLY at the agreed path.
  assert.ok(existsSync(path.join(repoRoot, 'app/api/bets/tracked/route.ts')), 'route must live at app/api/bets/tracked/route.ts');
  assert.ok(!existsSync(path.join(repoRoot, 'app/api/bets/route.ts')), 'no route may exist at app/api/bets/route.ts');

  const page = readFileSync(path.join(repoRoot, 'app/(app)/bets/new/page.tsx'), 'utf8');
  assert.ok(!page.includes('create_quick_bet'), 'the form must no longer reference create_quick_bet');
  assert.ok(page.includes("fetch('/api/bets/tracked'"), 'the form must submit through POST /api/bets/tracked');
  assert.ok(!/fetch\('\/api\/bets'/.test(page), 'the form must not post to the unapproved /api/bets path');
  assert.ok(!/@\/lib\/supabase\/client/.test(page), 'the form must not talk to Supabase directly');
  assert.ok(!/\.from\('/.test(page), 'the form must not read financial tables directly');
  // Wiring (supplementary — the LIFECYCLE ITSELF is proven by the
  // behavioral state-machine tests above): the form must use the pure
  // helper and hold no second lifecycle implementation of its own.
  assert.ok(page.includes('createSubmitIntent()'), 'the form must initialize the shared intent machine');
  assert.ok(page.includes('beginSubmit('), 'submits must go through beginSubmit');
  assert.ok(page.includes('fingerprintPayload(parsed.data)'), 'the fingerprint must come from the shared helper');
  assert.ok(page.includes('() => crypto.randomUUID()'), 'the browser UUID generator must be injected, not hardcoded in logic');
  assert.equal((page.match(/crypto\.randomUUID/g) ?? []).length, 1, 'exactly one injected generator — no parallel key source');
  assert.ok(/res\.status === 409[\s\S]{0,300}resolveSubmit\(intentRef\.current, 'conflict'\)/.test(page),
    'a 409 must resolve through the machine as conflict');
  assert.ok(page.includes("resolveSubmit(intentRef.current, 'success')"), 'success must resolve through the machine');
  assert.equal((page.match(/resolveSubmit\(intentRef\.current, 'retryable'\)/g) ?? []).length, 2,
    'HTTP failures and network throws must both resolve as retryable');
  assert.ok(page.includes("begin.reason === 'conflict_unchanged'"), 'the conflict-unchanged block must be handled');
  assert.ok(page.includes("setErrors({ _root: 'Request conflict' })"), 'the fixed Request conflict error must be shown');
  assert.ok(!/keyRef|lastPayloadRef|conflictLockRef|inFlightRef/.test(page),
    'no second, component-local lifecycle implementation may exist');
  assert.ok(page.includes('disabled={busy}'), 'submit must be locked while busy (in flight or scanning)');
  // Success AND replay share one navigation path to the created bet.
  assert.ok(page.includes('router.push(`/bets/${json.bet_id}`)'), 'success must open the created bet detail');
  assert.ok(!page.includes("router.push('/bets')"), 'success must not navigate to the generic bets list');
  assert.ok(!/json\.replayed/.test(page), 'replay must take the same navigation path as success');
  assert.ok(page.includes('router.refresh()'), 'success must refresh server data');
  assert.ok(!/[^\w](\$\{|\$)\s*\(?stakeNum/.test(page.replace(/\$\{/g, '${')), 'payout preview must not hardcode a $ symbol');
  assert.ok(page.includes('MAX_TRACKED_BET_LEGS'), 'the 20-leg cap must gate the editor');

  const route = readFileSync(path.join(repoRoot, 'app/api/bets/tracked/route.ts'), 'utf8');
  const routeCode = route.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
  assert.ok(route.includes("from '@/lib/supabase/request-auth'"), 'route must use the shared request-scoped auth bridge');
  assert.ok(!/createAdminClient|service_role|SERVICE_ROLE/.test(routeCode), 'service_role must never appear in the user flow');
  assert.ok(route.includes('trackedBetRequestSchema'), 'route must validate with the shared strict schema');
  assert.ok(route.includes("rpc('create_tracked_bet'"), 'route must write through create_tracked_bet');
  assert.ok(!/\.from\('/.test(route), 'route must not touch financial tables directly');

  const scannerRoute = readFileSync(path.join(repoRoot, 'app/api/ai/scanner/route.ts'), 'utf8');
  assert.ok(scannerRoute.includes("from '@/lib/supabase/request-auth'"), 'scanner must use the shared request-scoped auth bridge');
  assert.ok(scannerRoute.includes('AbortSignal.timeout(SCANNER_UPSTREAM_TIMEOUT_MS)'), 'scanner provider calls need an upstream timeout');
  const scannerHandler = scannerRoute.slice(scannerRoute.indexOf('// Call Claude Vision'));
  assert.ok(scannerHandler.indexOf('if (isUpstreamTimeout(err))') < scannerHandler.indexOf('shouldRetryScannerParse(err)'),
    'timeout handling must precede parse retry decisions');

  const shared = readFileSync(path.join(repoRoot, 'lib/bets/tracked-bet.ts'), 'utf8');
  const sharedCode = shared.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
  assert.ok(/\.strict\(\)/.test(shared), 'shared schemas must be strict (unknown keys fail closed)');
  for (const noise of ['rawText', 'statusText', 'scoreText', 'isLive', 'periodOrPhase']) {
    assert.ok(!sharedCode.includes(noise), `scanner noise field ${noise} must not be modeled in the contract`);
  }
});

test('tracked-bet: legs render in coupon order; create_quick_bet stays untouched', () => {
  for (const rel of ['app/(app)/bets/page.tsx', 'app/(app)/bets/[id]/page.tsx']) {
    const src = readFileSync(path.join(repoRoot, rel), 'utf8');
    assert.ok(src.includes(".order('leg_index', { referencedTable: 'bet_legs'"),
      `${rel}: embedded legs must be ordered by leg_index`);
  }
  const migration016 = readFileSync(path.join(repoRoot, 'supabase/migrations/016_atomic_financial_writes.sql'), 'utf8');
  assert.ok(migration016.includes('CREATE OR REPLACE FUNCTION create_quick_bet'),
    'create_quick_bet must remain defined and unchanged in migration 016');
  const migration024 = readFileSync(path.join(repoRoot, 'supabase/migrations/024_create_tracked_bet.sql'), 'utf8');
  assert.ok(migration024.includes('CREATE OR REPLACE FUNCTION public.create_tracked_bet'),
    'migration 024 must remain the single tracked-bet write path');
});

// ── Decision #061 Phase A1: fail-closed tracker input lifecycle ──────
// Scanner overflow, full-replacement policy, and the busy lock. The
// adapter tests are BEHAVIORAL — they run the compiled helper with
// synthetic coupons; the page tests confirm the component actually
// wires those behaviors (fail-closed branch, fieldset lock).

console.log('\nDecision #061 Phase A1 — fail-closed tracker input lifecycle:');

function scannedLeg(i) {
  return { sport: 'soccer', eventName: `Event ${i}`, marketType: '1X2', selection: 'Home', odds: 1.5 + i / 100 };
}

test('scanner: a 20-leg coupon imports fully — all 20 legs, in coupon order', () => {
  const { scannerDataToDrafts, MAX_TRACKED_BET_LEGS } = loadTrackedBetLib();
  assert.equal(MAX_TRACKED_BET_LEGS, 20);
  const legs = Array.from({ length: 20 }, (_, i) => scannedLeg(i + 1));
  const result = scannerDataToDrafts({ sport: 'soccer', odds: 12.3, stake: 50, bookmaker: 'Bet365', legs });
  assert.equal(result.ok, true);
  assert.equal(result.legs.length, 20, 'no leg may be dropped at exactly the cap');
  assert.deepEqual(result.legs.map((l) => l.event_name), legs.map((l) => l.eventName), 'coupon order must be preserved');
  assert.equal(result.totalOdds, '12.3');
  assert.equal(result.stake, '50');
  assert.equal(result.bookmaker, 'Bet365');
});

test('scanner: a 21-leg coupon fails closed — no truncation, no partial import', () => {
  const { scannerDataToDrafts } = loadTrackedBetLib();
  const legs = Array.from({ length: 21 }, (_, i) => scannedLeg(i + 1));
  const result = scannerDataToDrafts({ sport: 'soccer', odds: 99.9, stake: 50, bookmaker: 'Bet365', legs });
  assert.deepEqual(result, { ok: false, reason: 'too_many_legs' },
    'overflow must return ONLY the refusal — no legs, totalOdds, stake or bookmaker may leak out');
});

test('scanner: overflow is checked on the RAW count — empty-name filtering cannot shrink 21 legs into an import', () => {
  const { scannerDataToDrafts } = loadTrackedBetLib();
  const legs = Array.from({ length: 21 }, (_, i) => (i < 3 ? { ...scannedLeg(i + 1), eventName: '   ' } : scannedLeg(i + 1)));
  const result = scannerDataToDrafts({ sport: 'soccer', odds: 8.5, stake: 25, bookmaker: 'Stake', legs });
  assert.deepEqual(result, { ok: false, reason: 'too_many_legs' },
    '21 raw legs must be refused even when filtering would leave <= 20');
});

test('scanner: full replacement — a coupon without stake/bookmaker/total returns empty strings, never stale carriers', () => {
  const { scannerDataToDrafts } = loadTrackedBetLib();
  const result = scannerDataToDrafts({ sport: 'soccer', legs: [scannedLeg(1), scannedLeg(2)] });
  assert.equal(result.ok, true);
  assert.equal(result.stake, '', 'absent stake must map to an explicit empty value');
  assert.equal(result.bookmaker, '', 'absent bookmaker must map to an explicit empty value');
  assert.equal(result.totalOdds, '', 'absent total odds must map to an explicit empty value');
});

test('scanner: single-leg coupon never gets a total odds value; legacy flattened fallback still imports', () => {
  const { scannerDataToDrafts } = loadTrackedBetLib();
  const single = scannerDataToDrafts({ sport: 'tennis', odds: 1.8, stake: 10, legs: [scannedLeg(1)] });
  assert.equal(single.ok, true);
  assert.equal(single.totalOdds, '', 'total odds is an express-only field');
  const legacy = scannerDataToDrafts({ sport: 'tennis', event_name: 'A vs B', market_type: 'Winner', odds: 2.1 });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.legs.length, 1);
  assert.equal(legacy.legs[0].event_name, 'A vs B');
});

test('editor: Single / Express mode switch is behavioural and preserves the first draft', () => {
  const { emptyLegDraft, switchLegDraftMode } = loadTrackedBetLib();
  const first = { ...emptyLegDraft('soccer'), event_name: 'A vs B', odds: '1.80' };
  const express = switchLegDraftMode([first], 'express');
  assert.equal(express.length, 2, 'Express must create a second editable leg');
  assert.deepEqual(express[0], first, 'Express must preserve the existing first leg');
  assert.equal(express[1].sport, 'soccer', 'the new leg inherits the first leg sport');
  const single = switchLegDraftMode(express, 'single');
  assert.deepEqual(single, [first], 'Single keeps the first leg and removes Express-only legs');
});

test('page: Single / Express controls are real accessible buttons, not passive indicators', () => {
  const page = readFileSync(path.join(repoRoot, 'app/(app)/bets/new/page.tsx'), 'utf8');
  assert.ok(page.includes('onClick={() => selectBetMode(\'single\')}'), 'Single must invoke the mode transition');
  assert.ok(page.includes('onClick={() => selectBetMode(\'express\')}'), 'Express must invoke the mode transition');
  assert.ok(page.includes('aria-pressed={!isExpress}') && page.includes('aria-pressed={isExpress}'),
    'both mode buttons must expose their selected state');
  assert.ok(page.includes("window.confirm('Switch to Single and remove the additional Express legs?')"),
    'dropping additional legs requires explicit confirmation');
});

test('dashboard: an Express summary renders every event, market, selection and individual odds', () => {
  const dashboard = readFileSync(path.join(repoRoot, 'app/(app)/dashboard/page.tsx'), 'utf8');
  assert.ok(dashboard.includes('legs.map((leg, legIndex) => ('), 'dashboard must map all Express legs');
  assert.ok(dashboard.includes('{leg.event_name}'), 'each Express event must be visible');
  assert.ok(dashboard.includes('[leg.market_type, leg.selection]'), 'each leg market and selection must be visible');
  assert.ok(dashboard.includes('Number(leg.odds).toFixed(2)'), 'each leg coefficient must be visible');
});

test('page: overflow branch runs BEFORE any state write, with the fixed non-echoing message', () => {
  const page = readFileSync(path.join(repoRoot, 'app/(app)/bets/new/page.tsx'), 'utf8');
  const okCheck = page.indexOf('if (!mapped.ok)');
  assert.ok(okCheck !== -1, 'the page must branch on the discriminated union');
  assert.ok(page.includes("setScanMsg('Coupon has more than 20 legs and was not imported.')"),
    'the refusal message must be fixed text (no coupon content, no leg count echo)');
  for (const write of ['setLegs(mapped.legs)', 'setTotalOdds(mapped.totalOdds)', 'setStake(mapped.stake)',
    'setBookmaker(mapped.bookmaker)', "setSource('scanner')"]) {
    const idx = page.indexOf(write);
    assert.ok(idx !== -1, `scan success must apply ${write}`);
    assert.ok(okCheck < idx, `${write} must come AFTER the ok check — nothing may be applied on overflow`);
  }
  assert.ok(!page.includes('.slice(0, MAX_TRACKED_BET_LEGS)'), 'no truncation path may exist in the page');
});

test('page: repeat scan is a full replacement — stake/bookmaker set unconditionally, notes never scanner-written', () => {
  const page = readFileSync(path.join(repoRoot, 'app/(app)/bets/new/page.tsx'), 'utf8');
  assert.ok(!/if\s*\(mapped\.stake\)/.test(page), 'stake must not be conditionally preserved from the previous coupon');
  assert.ok(!/if\s*\(mapped\.bookmaker\)/.test(page), 'bookmaker must not be conditionally preserved');
  const scanner = page.slice(page.indexOf('const runScanner'), page.indexOf('// Ctrl+V paste'));
  assert.ok(!scanner.includes('setNotes'), 'notes are user-owned — the scanner must never write them');
});

test('page: busy lock — one fieldset boundary disables fields, leg mutations, Cancel and Save together', () => {
  const page = readFileSync(path.join(repoRoot, 'app/(app)/bets/new/page.tsx'), 'utf8');
  assert.ok(page.includes('const busy = loading || scanning'), 'busy must cover BOTH the financial submit and the scan');
  assert.ok(page.includes('<fieldset disabled={busy}'), 'the form body must sit inside one disabled fieldset');
  assert.ok(page.includes('</fieldset>'), 'the fieldset must wrap the whole form body');
  assert.ok((page.match(/aria-busy=\{busy\}/g) ?? []).length >= 2, 'form and scanner zone must announce aria-busy');
  assert.ok(page.includes('disabled={busy || legs.length >= MAX_TRACKED_BET_LEGS}'), 'Add leg must respect the busy lock');
  assert.ok(/aria-label=\{`Remove leg \$\{index \+ 1\}`\}\s*\n\s*disabled=\{busy\}/.test(page), 'Remove leg must respect the busy lock');
  assert.ok(/onClick=\{\(\) => router\.back\(\)\}\s*\n\s*disabled=\{busy\}/.test(page), 'Cancel must be locked while busy');
  assert.ok(page.includes('disabled={busy}>') || /type="submit"[^>]*disabled=\{busy\}/.test(page), 'Save must be locked while busy');
});

test('page: scanner entry points hold synchronous busy guards; the financial fetch is never cancelled', () => {
  const page = readFileSync(path.join(repoRoot, 'app/(app)/bets/new/page.tsx'), 'utf8');
  assert.ok(page.includes('const scanningRef = useRef(false)'), 'the scan lock must be a synchronous ref');
  assert.equal((page.match(/if \(scanningRef\.current \|\| intentRef\.current\.status === 'in_flight'\)/g) ?? []).length, 3,
    'runScanner, paste and file-picker must each guard on scan + in-flight submit');
  const submit = page.slice(page.indexOf('async function handleSubmit'), page.indexOf('const stakeNum'));
  assert.ok(submit.includes('if (scanningRef.current) return'), 'submit must refuse while a scan is rewriting the draft');
  assert.ok(!/AbortController|\.abort\(|signal:/.test(page), 'the financial fetch must never be aborted/cancelled');
  const finallyBlock = page.slice(page.indexOf('} finally {'), page.indexOf('}, [])'));
  assert.ok(finallyBlock.includes('scanningRef.current = false') && finallyBlock.includes('setScanning(false)'),
    'the scan lock must always release, success or failure');
});

test('page: overflow gate blocks Save — checked before validation, before any UUID, before any network call', () => {
  const page = readFileSync(path.join(repoRoot, 'app/(app)/bets/new/page.tsx'), 'utf8');
  // The refused scan arms the gate INSIDE the fail-closed branch,
  // before it returns.
  const overflowBranch = page.slice(page.indexOf('if (!mapped.ok)'), page.indexOf('// Full-replacement'));
  assert.ok(overflowBranch.includes('setScannerOverflowBlocked(true)'),
    'a refused oversized coupon must arm the submit gate');
  // The gate fires before EVERYTHING that could produce a request:
  // zod validation, UUID minting via beginSubmit, and the fetch.
  const submit = page.slice(page.indexOf('async function handleSubmit'), page.indexOf('const stakeNum'));
  const gate = submit.indexOf('if (scannerOverflowBlocked) return');
  assert.ok(gate !== -1, 'handleSubmit must hold the overflow gate');
  assert.ok(gate < submit.indexOf('.safeParse('), 'gate must precede zod validation');
  assert.ok(gate < submit.indexOf('beginSubmit('), 'gate must precede UUID minting — no key may be created');
  assert.ok(gate < submit.indexOf("fetch('/api/bets/tracked'"), 'gate must precede the network call — 0 requests while blocked');
  // While blocked the gate returns SILENTLY: the fixed refusal message
  // stays on screen (nothing may overwrite or clear it on submit).
  const gated = submit.slice(0, gate);
  assert.ok(!gated.includes('setScanMsg') && !gated.includes('setErrors'),
    'nothing before the gate may rewrite the visible refusal message');
});

test('page: overflow gate unlocks ONLY via a valid scan or a manual payload edit that switches source to manual', () => {
  const page = readFileSync(path.join(repoRoot, 'app/(app)/bets/new/page.tsx'), 'utf8');
  // Unlock path 1: a later valid scan fully replaces the draft and
  // lifts the gate inside the success branch.
  const successBranch = page.slice(page.indexOf('// Full-replacement'), page.indexOf('} catch {'));
  assert.ok(successBranch.includes('setScannerOverflowBlocked(false)'), 'a valid scan must lift the gate');
  // Unlock path 2: every manual payload edit funnels through
  // markManualEdit, which lifts the gate AND flips source to manual.
  const marker = page.slice(page.indexOf('function markManualEdit'), page.indexOf('// ── Leg operations'));
  assert.ok(marker.includes('if (scannerOverflowBlocked)'), 'manual unlock must be conditional on the armed gate');
  assert.ok(marker.includes('setScannerOverflowBlocked(false)'), 'manual edit must lift the gate');
  assert.ok(marker.includes("setSource('manual')"), 'a manual unlock must switch source to manual');
  const editSites = (page.match(/markManualEdit\(/g) ?? []).length;
  assert.equal(editSites, 9, 'definition + 8 payload-edit sites (mode, leg fields, add/remove leg, total odds, stake, bookmaker, notes)');
  assert.ok(!/clearError\('/.test(page.slice(page.indexOf('function updateLeg'))),
    'no payload-edit path may bypass markManualEdit by calling clearError directly');
  // No third unlock path exists.
  assert.equal((page.match(/setScannerOverflowBlocked\(false\)/g) ?? []).length, 2,
    'exactly two unlock sites: valid scan and manual edit');
  assert.equal((page.match(/setScannerOverflowBlocked\(true\)/g) ?? []).length, 1,
    'exactly one arm site: the refused oversized coupon');
});

test('#061 A1: write path untouched — route, RPC, migration 024 and the intent machine keep their Phase B surface', () => {
  const route = readFileSync(path.join(repoRoot, 'app/api/bets/tracked/route.ts'), 'utf8');
  assert.ok(route.includes("rpc('create_tracked_bet'"), 'route must still write only through create_tracked_bet');
  assert.ok(route.includes('trackedBetRequestSchema'), 'route must still validate with the shared strict schema');
  const migration = readFileSync(path.join(repoRoot, 'supabase/migrations/024_create_tracked_bet.sql'), 'utf8');
  assert.ok(/IF v_leg_count < 1 OR v_leg_count > 20 THEN/.test(migration), 'server-side 1..20 leg bound must be unchanged');
  const lib = loadTrackedBetLib();
  for (const fn of ['createSubmitIntent', 'beginSubmit', 'resolveSubmit', 'fingerprintPayload', 'scannerDataToDrafts']) {
    assert.equal(typeof lib[fn], 'function', `${fn} must remain exported from the shared helper`);
  }
});

// ── Tracker pending cancellation — soft delete + atomic refund ──

const CANCEL_MIGRATION = 'supabase/migrations/20260721152711_cancel_pending_bet.sql';
const CANCEL_ROLLBACK = 'docs/cancel-pending-bet-rollback.sql';
const CANCEL_ROUTE = 'app/api/bets/[id]/cancel/route.js';
const CANCEL_BET_ID = 'aaaaaaaa-1111-4111-8111-bbbbbbbbbbbb';
const CANCEL_KEY = 'cccccccc-2222-4222-8222-dddddddddddd';

function cancelRequest(key = CANCEL_KEY) {
  return new Request(`https://example.test/api/bets/${CANCEL_BET_ID}/cancel`, {
    method: 'POST',
    headers: { 'idempotency-key': key },
  });
}

function cancelContext(id = CANCEL_BET_ID) {
  return { params: Promise.resolve({ id }) };
}

await testAsync('cancel route: anonymous and invalid requests fail before the RPC', async () => {
  const anonymous = makeStubClient({ user: null, maybeSingleRow: { id: CANCEL_BET_ID } });
  await withFinancialRoute(CANCEL_ROUTE, anonymous, async ({ POST }) => {
    const response = await POST(cancelRequest(), cancelContext());
    assert.equal(response.status, 401);
    assert.equal(anonymous.calls.rpc.length, 0);
  });

  const authenticated = makeStubClient({ maybeSingleRow: { id: CANCEL_BET_ID } });
  await withFinancialRoute(CANCEL_ROUTE, authenticated, async ({ POST }) => {
    const response = await POST(cancelRequest('not-a-uuid'), cancelContext());
    assert.equal(response.status, 400);
    assert.equal(authenticated.calls.rpc.length, 0);
  });
});

await testAsync('cancel route: verifies ownership then delegates the exact request to one RPC', async () => {
  const stub = makeStubClient({
    maybeSingleRow: { id: CANCEL_BET_ID },
    rpcResults: {
      cancel_pending_bet: {
        data: { bet_id: CANCEL_BET_ID, refund_amount: 100, balance: 555, replayed: false },
        error: null,
      },
    },
  });
  await withFinancialRoute(CANCEL_ROUTE, stub, async ({ POST }) => {
    const response = await POST(cancelRequest(), cancelContext());
    const result = await readJsonResponse(response);
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(stub.calls.rpc.length, 1);
    assert.deepEqual(stub.calls.rpc[0], {
      name: 'cancel_pending_bet',
      args: { p_bet_id: CANCEL_BET_ID, p_idempotency_key: CANCEL_KEY },
    });
    const ownership = stub.calls.from.find((entry) => entry.table === 'bets');
    assert.ok(ownership?.ops.some((op) => op.op === 'eq' && op.col === 'user_id' && op.val === 'user-1'));
    assert.ok(!stub.calls.from.some((entry) => entry.ops.some((op) => ['update', 'insert', 'delete'].includes(op.op))),
      'route must perform no direct table writes');
  });
});

await testAsync('cancel route: not-owned and settled/conflicting bets return sanitized errors', async () => {
  const missing = makeStubClient();
  await withFinancialRoute(CANCEL_ROUTE, missing, async ({ POST }) => {
    const response = await POST(cancelRequest(), cancelContext());
    assert.equal(response.status, 404);
    assert.equal(missing.calls.rpc.length, 0);
  });

  for (const [dbMessage, expectedStatus, expectedError] of [
    ['bet_not_cancellable', 409, 'Only pending bets can be deleted'],
    ['idempotency_conflict with secret ledger detail', 409, 'Cancellation request conflict'],
    ['stake_ledger_mismatch row=secret', 500, 'Bet could not be deleted safely'],
  ]) {
    const stub = makeStubClient({
      maybeSingleRow: { id: CANCEL_BET_ID },
      rpcResults: { cancel_pending_bet: { data: null, error: { message: dbMessage } } },
    });
    await withFinancialRoute(CANCEL_ROUTE, stub, async ({ POST }) => {
      const response = await POST(cancelRequest(), cancelContext());
      const result = await readJsonResponse(response);
      assert.equal(result.status, expectedStatus);
      assert.equal(result.body.error, expectedError);
      assert.ok(!JSON.stringify(result.body).includes('secret'), 'raw database diagnostics leaked');
    });
  }
});

test('cancel: migration retains the audit record and never hard-deletes financial data', () => {
  const sql = readFileSync(path.join(repoRoot, CANCEL_MIGRATION), 'utf8');
  assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS archived_at timestamptz'), 'archived_at soft-delete column missing');
  assert.ok(sql.includes("SET status = 'void'"), 'cancelled bet must become void');
  assert.ok(sql.includes("SET leg_status = 'void'"), 'cancelled legs must become void');
  assert.ok(!/DELETE\s+FROM\s+public\.(bets|bet_legs|bankrolls|bankroll_transactions)/i.test(sql),
    'financial audit rows must never be hard-deleted');
});

test('cancel: emergency rollback disables the RPC but preserves schema and financial audit data', () => {
  const migration = readFileSync(path.join(repoRoot, CANCEL_MIGRATION), 'utf8');
  const rollback = readFileSync(path.join(repoRoot, CANCEL_ROLLBACK), 'utf8');
  assert.ok(migration.includes(CANCEL_ROLLBACK), 'migration must point to the reviewed rollback artifact');
  assert.ok(/REVOKE EXECUTE ON FUNCTION public\.cancel_pending_bet\(uuid, text\)[\s\S]*?FROM PUBLIC, anon, authenticated;/.test(rollback),
    'rollback must revoke the cancellation RPC from every public caller');
  assert.ok(rollback.includes("has_function_privilege(\n       'authenticated'"),
    'rollback must verify that authenticated EXECUTE is gone');
  assert.ok(rollback.includes("to_regclass('public.uq_bankroll_tx_one_tracker_cancel')"),
    'rollback must retain and verify the one-refund-per-bet backstop');
  assert.ok(rollback.includes("column_name = 'archived_at'"),
    'rollback must retain and verify the archive marker');
  assert.ok(!/DROP\s+(TABLE|COLUMN|INDEX|FUNCTION)|DELETE\s+FROM/i.test(rollback),
    'rollback must not destroy schema or financial audit records');
});

test('cancel: refund is ownership-scoped, locked, ledger-verified and atomic', () => {
  const sql = readFileSync(path.join(repoRoot, CANCEL_MIGRATION), 'utf8');
  assert.ok(sql.includes('v_user_id        uuid := auth.uid()'), 'identity must come only from auth.uid()');
  assert.ok(/WHERE id = p_bet_id\s+AND user_id = v_user_id\s+FOR UPDATE;/.test(sql),
    'owned bet row must be locked before cancellation');
  assert.ok(/WHERE id = v_bet\.bankroll_id\s+AND user_id = v_user_id\s+FOR UPDATE;/.test(sql),
    'owned bankroll row must be locked before refund');
  assert.ok(sql.includes("AND type = 'stake'") && sql.includes('AND amount = -v_bet.stake'),
    'the original matching stake debit must be verified');
  assert.ok(sql.includes('IF v_stake_tx_count IS DISTINCT FROM 1 THEN'),
    'missing or duplicate stake ledger rows must fail closed');
  assert.ok(sql.includes('v_new_balance := v_balance + v_bet.stake'), 'refund must equal the stored stake exactly');
  assert.ok(sql.includes("'action',           'tracker_cancel'"), 'refund ledger entry must carry an audit action');
});

test('cancel: idempotency prevents a double refund even across different retry keys', () => {
  const sql = readFileSync(path.join(repoRoot, CANCEL_MIGRATION), 'utf8');
  assert.ok(sql.includes('uq_bankroll_tx_one_tracker_cancel'), 'one-refund-per-bet unique backstop missing');
  assert.ok(sql.includes('lower(idempotency_key) = v_key'), 'same-key replay lookup missing');
  assert.ok(sql.includes('IF v_bet.archived_at IS NOT NULL THEN'), 'fresh-key replay after an ambiguous response missing');
  assert.ok((sql.match(/'replayed',\s+true/g) ?? []).length >= 2,
    'both same-key and fresh-key retries must return as replays');
  assert.ok(/REVOKE EXECUTE ON FUNCTION public\.cancel_pending_bet\(uuid, text\)[\s\S]*?FROM PUBLIC, anon;/.test(sql),
    'cancel RPC must be revoked from PUBLIC and anon');
  assert.ok(/GRANT EXECUTE ON FUNCTION public\.cancel_pending_bet\(uuid, text\)[\s\S]*?TO authenticated;/.test(sql),
    'cancel RPC must be callable only by authenticated users');
});

test('cancel: route validates UUIDs, verifies ownership and writes only through the RPC', () => {
  const route = readFileSync(path.join(repoRoot, 'app/api/bets/[id]/cancel/route.ts'), 'utf8');
  assert.ok(route.includes("req.headers.get('idempotency-key')"), 'required idempotency header missing');
  assert.ok(route.includes(".eq('user_id', user.id)"), 'route ownership precheck missing');
  assert.ok(route.includes("rpc('cancel_pending_bet'"), 'route must delegate the atomic write to cancel_pending_bet');
  for (const table of ['bets', 'bet_legs', 'bankrolls', 'bankroll_transactions']) {
    assert.ok(!new RegExp(`from\\('${table}'\\)[\\s\\S]{0,300}\\.(update|insert|delete)\\(`).test(route),
      `route must not write ${table} directly`);
  }
  assert.ok(!route.includes('error.message }, { status: 500'), 'raw database errors must not reach the client');
});

test('cancel: web controls require confirmation and explain the refund/audit behavior', () => {
  const detail = readFileSync(path.join(repoRoot, 'app/(app)/bets/[id]/SettleActions.tsx'), 'utf8');
  const quick = readFileSync(path.join(repoRoot, 'components/bets/QuickSettle.tsx'), 'utf8');
  for (const [name, src] of [['detail', detail], ['list', quick]]) {
    assert.ok(src.includes('window.confirm('), `${name}: destructive confirmation missing`);
    assert.ok(src.includes('/cancel`'), `${name}: cancel endpoint missing`);
    assert.ok(src.includes("'Idempotency-Key': crypto.randomUUID()"), `${name}: idempotency key missing`);
    assert.ok(src.includes('stake will be returned'), `${name}: refund consequence must be explicit`);
  }
  assert.ok(detail.includes('The financial audit record is retained.'), 'detail must explain that deletion is a soft delete');
});

test('cancel: every product bet read excludes archived cancellations', () => {
  const reads = [
    'app/(app)/dashboard/page.tsx',
    'app/(app)/bets/page.tsx',
    'app/(app)/bets/[id]/page.tsx',
    'app/(app)/coach/page.tsx',
    'app/api/coach/route.ts',
    'app/api/risk/evaluate/route.ts',
    'app/(app)/analytics/page.tsx',
    'app/api/bets/[id]/settle/route.ts',
    'apps/mobile/src/bets/data.ts',
  ];
  for (const file of reads) {
    const src = readFileSync(path.join(repoRoot, file), 'utf8');
    const betReads = src.split(".from('bets')").length - 1;
    const archivedFilters = src.split(".is('archived_at', null)").length - 1;
    assert.ok(betReads > 0, `${file}: expected at least one bets read`);
    assert.ok(archivedFilters >= betReads, `${file}: every bets read must exclude archived rows`);
  }
});

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
