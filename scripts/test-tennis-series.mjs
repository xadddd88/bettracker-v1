#!/usr/bin/env node
// Tennis Live Series Calculator V1 — PR-1 pure-core tests.
// Exercises the compiled TypeScript in build/provider-smoke/ (real logic), the shared
// golden vectors (parse + math + financial state transitions, direct-math input/odds/
// output rejection, limit-gate input rejection, and adversarial series validation),
// and property invariants. No network, no DB, no external systems.
//
// Fields ending _minor carry raw integer minor units (money) as strings; odds_scaled
// carries raw scaled odds. Both are injected directly (BigInt) to exercise the math /
// state layer's own validators, bypassing the decimal-string parser.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(__dirname, '..');
const buildDir = path.join(repoRoot, 'build', 'provider-smoke', 'lib', 'tennis');

const contract = require(path.join(buildDir, 'contract.js'));
const mathmod = require(path.join(buildDir, 'series-math.js'));
const state = require(path.join(buildDir, 'series-state.js'));
const vectors = JSON.parse(readFileSync(path.join(repoRoot, 'docs', 'tennis', 'golden-vectors.json'), 'utf8'));

const { parseMoneyMinor, parseOddsScaled, formatMoneyMinor, formatOddsScaled } = contract;
const { requiredStakeMinorRaw, requiredStakeMinor, roundUpToStep, actualProfitMinor, targetMet, meetsTargetByProduct, defaultTargetProfitMinor, fixedOddsPlan, fixedOddsPlanForBankroll, growingOddsPlan, growingOddsPlanForBankroll, checkOpenBetLimits } = mathmod;
const { newSeries, openBet, settleBet, stopSeries, validateSeries, nextGameNumber } = state;

// Raw-injection helpers: prefer the *_minor / *_scaled raw field when present, else parse
// the decimal string. This lets a single vector target either the parser or the internal
// validators (e.g. a money value above the ceiling that the string parser would reject).
const M = (s, sm) => (sm !== undefined ? BigInt(sm) : parseMoneyMinor(s));
const O = (o, os) => (os !== undefined ? BigInt(os) : parseOddsScaled(o));

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.error(`  FAIL ${name}\n       ${e.message}`); } }

// ── default_target ───────────────────────────────────────────────────────────
for (const v of vectors.default_target) test(`default_target: ${v.name}`, () => {
  assert.equal(formatMoneyMinor(defaultTargetProfitMinor(parseMoneyMinor(v.startingStake), parseOddsScaled(v.openingOdds))), v.expectedDefaultTarget);
});

test('fixed plan: $20 at 3.15 across 15 games requires the exact isolated bank', () => {
  const plan = fixedOddsPlan(parseMoneyMinor('20.00'), parseOddsScaled('3.15'), 15);
  assert.equal(formatMoneyMinor(plan.targetProfitMinor), '43.00');
  assert.equal(formatMoneyMinor(plan.bankrollRequiredMinor), '13188.91');
  assert.deepEqual(
    plan.stakesMinor.map(formatMoneyMinor),
    ['20.00', '29.31', '42.94', '62.91', '92.17', '135.04', '197.85', '289.87', '424.70', '622.23', '911.64', '1335.66', '1956.90', '2867.08', '4200.61'],
  );
  assert.equal(formatOddsScaled(parseOddsScaled('3.15')), '3.150');
  let loss = BigInt(0);
  for (const stake of plan.stakesMinor) {
    assert.ok(actualProfitMinor(stake, parseOddsScaled('3.15'), loss) >= plan.targetProfitMinor);
    loss += stake;
  }
});

test('bank mode: derives the largest first stake whose full plan fits', () => {
  const bank = parseMoneyMinor('5000.00');
  const plan = fixedOddsPlanForBankroll(bank, parseOddsScaled('3.15'), 15);
  assert.ok(plan.bankrollRequiredMinor <= bank);
  const next = fixedOddsPlan(plan.initialStakeMinor + BigInt(1), parseOddsScaled('3.15'), 15);
  assert.ok(next.bankrollRequiredMinor > bank);
});

test('growing plan: bank mode targets rising profit across 10 games', () => {
  const bank = parseMoneyMinor('5000.00');
  const odds = parseOddsScaled('3.00');
  const plan = growingOddsPlanForBankroll(bank, odds, 10);
  assert.equal(formatMoneyMinor(plan.initialStakeMinor), '15.62');
  assert.equal(formatMoneyMinor(plan.bankrollRequiredMinor), '4998.47');
  assert.equal(formatMoneyMinor(plan.targetProfitMinor), '31.24');
  assert.deepEqual(
    plan.stakesMinor.map(formatMoneyMinor),
    ['15.62', '39.05', '74.20', '126.92', '206.00', '324.62', '502.55', '769.44', '1169.78', '1770.29'],
  );
  assert.deepEqual(
    plan.targetProfitsMinor.map(formatMoneyMinor),
    ['31.24', '62.48', '93.72', '124.96', '156.20', '187.44', '218.68', '249.92', '281.16', '312.40'],
  );

  let loss = BigInt(0);
  for (const [index, stake] of plan.stakesMinor.entries()) {
    assert.ok(actualProfitMinor(stake, odds, loss) >= plan.targetProfitsMinor[index]);
    loss += stake;
  }

  const next = growingOddsPlan(plan.initialStakeMinor + BigInt(1), odds, 10);
  assert.ok(next.bankrollRequiredMinor > bank);
});

test('bank mode property: returned first stake is cent-maximal across 100 plans', () => {
  let seed = 918273n;
  const rnd = (n) => {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return Number(seed % BigInt(n));
  };
  for (let i = 0; i < 100; i++) {
    const bank = BigInt(10000 + rnd(990000)); // $100.00 .. $9,999.99
    const odds = BigInt(1500 + rnd(6501));    // 1.500 .. 8.000
    const games = 1 + rnd(15);
    const plan = fixedOddsPlanForBankroll(bank, odds, games);
    assert.ok(plan.bankrollRequiredMinor <= bank);
    const next = fixedOddsPlan(plan.initialStakeMinor + BigInt(1), odds, games);
    assert.ok(next.bankrollRequiredMinor > bank);
  }
});

// ── required_stake (+ product guarantee) ──────────────────────────────────────
for (const v of vectors.required_stake) test(`required_stake: ${v.name}`, () => {
  const L = parseMoneyMinor(v.L), P = parseMoneyMinor(v.P), O2 = parseOddsScaled(v.odds), step = parseMoneyMinor(v.step);
  const req = requiredStakeMinor(L, P, O2, step);
  assert.equal(formatMoneyMinor(req), v.expectedRequired, `expected ${v.expectedRequired} got ${formatMoneyMinor(req)}`);
  assert.equal(meetsTargetByProduct(req, L, P, O2), true, 'ceil must guarantee projectedProfit >= P');
});

// ── win_profit + target_met ───────────────────────────────────────────────────
for (const v of vectors.win_profit) test(`win_profit: ${v.name}`, () => {
  const profit = actualProfitMinor(parseMoneyMinor(v.actualStake), parseOddsScaled(v.odds), parseMoneyMinor(v.LBefore));
  assert.equal(formatMoneyMinor(profit), v.expectedProfit);
  assert.equal(targetMet(profit, parseMoneyMinor(v.targetProfit)), v.expectedTargetMet);
});

// ── reject (string parse: precision / range / format) ─────────────────────────
for (const v of vectors.reject) test(`reject: ${v.name}`, () => {
  assert.throws(
    () => (v.kind === 'money' ? parseMoneyMinor(v.input) : parseOddsScaled(v.input)),
    (e) => e && e.name === 'DomainInputError' && e.code === v.expectedCode,
    `expected code ${v.expectedCode}`,
  );
});

// ── math_reject (math-layer input/odds range + output overflow; raw fields) ────
for (const v of vectors.math_reject) test(`math_reject: ${v.name}`, () => {
  const call = () => {
    switch (v.fn) {
      case 'requiredStakeMinorRaw':
        return requiredStakeMinorRaw(M(v.L, v.L_minor), M(v.P, v.P_minor), O(v.odds, v.odds_scaled));
      case 'requiredStakeMinor':
        return requiredStakeMinor(M(v.L, v.L_minor), M(v.P, v.P_minor), O(v.odds, v.odds_scaled), BigInt(1));
      case 'roundUpToStep':
        return roundUpToStep(M(v.minor, v.minor_minor), M(v.step, v.step_minor));
      case 'defaultTargetProfitMinor':
        return defaultTargetProfitMinor(M(v.startingStake, v.startingStake_minor), O(v.odds, v.odds_scaled));
      case 'actualProfitMinor':
        return actualProfitMinor(M(v.actualStake, v.actualStake_minor), O(v.odds, v.odds_scaled), M(v.LBefore, v.LBefore_minor));
      case 'targetMet':
        return targetMet(M(v.profit, v.profit_minor), M(v.target, v.target_minor));
      case 'meetsTargetByProduct':
        return meetsTargetByProduct(M(v.req, v.req_minor), M(v.L, v.L_minor), M(v.P, v.P_minor), O(v.odds, v.odds_scaled));
      default: throw new Error(`unknown fn ${v.fn}`);
    }
  };
  assert.throws(call, (e) => e && e.code === v.expectedCode, `expected code ${v.expectedCode}`);
});

// ── limits (required AND actual checked independently) ────────────────────────
for (const v of vectors.limits) test(`limits: ${v.name}`, () => {
  const res = checkOpenBetLimits({
    requiredStakeMinor: parseMoneyMinor(v.requiredStake),
    actualStakeMinor: parseMoneyMinor(v.actualStake),
    lMinor: parseMoneyMinor(v.L),
    remainingBankMinor: parseMoneyMinor(v.remainingBank),
    perBetLimitMinor: parseMoneyMinor(v.perBetLimit),
    seriesExposureLimitMinor: parseMoneyMinor(v.seriesExposureLimit),
  });
  assert.equal(res.ok, v.expectedOk);
  if (!v.expectedOk) assert.equal(res.reason, v.expectedReason);
});

// ── limit_reject (limit gate rejects invalid money inputs, fail-closed) ───────
for (const v of vectors.limit_reject) test(`limit_reject: ${v.name}`, () => {
  const call = () => checkOpenBetLimits({
    requiredStakeMinor: M(v.requiredStake, v.requiredStake_minor),
    actualStakeMinor: M(v.actualStake, v.actualStake_minor),
    lMinor: M(v.L, v.L_minor),
    remainingBankMinor: M(v.remainingBank, v.remainingBank_minor),
    perBetLimitMinor: M(v.perBetLimit, v.perBetLimit_minor),
    seriesExposureLimitMinor: M(v.seriesExposureLimit, v.seriesExposureLimit_minor),
  });
  assert.throws(call, (e) => e && e.code === v.expectedCode, `expected code ${v.expectedCode}`);
});

// ── state_cases (financial transitions + adversarial validation, from JSON) ───
function buildSeries(j) {
  const s = {
    state: j.state,
    gamesUsed: j.gamesUsed,
    realizedLossMinor: M(j.realizedLoss, j.realizedLoss_minor),
    pending: j.pending
      ? {
          state: 'pending',
          gameNumber: j.pending.gameNumber,
          actualStakeMinor: M(j.pending.actualStake, j.pending.actualStake_minor),
          oddsScaled: O(j.pending.odds, j.pending.odds_scaled),
          requiredStakeMinor: M(j.pending.required, j.pending.required_minor),
        }
      : null,
  };
  if (j.stopReason !== undefined) s.stopReason = j.stopReason;
  return s;
}
for (const c of vectors.state_cases) test(`state_case: ${c.name}`, () => {
  const s = buildSeries(c.series);
  const run = () => {
    if (c.action === 'stop') return stopSeries(s);
    if (c.action === 'open') return openBet(s, { actualStakeMinor: M(c.bet.actualStake, c.bet.actualStake_minor), oddsScaled: O(c.bet.odds, c.bet.odds_scaled), requiredStakeMinor: M(c.bet.required, c.bet.required_minor) });
    if (c.action === 'settle') return settleBet(s, c.result, M(c.targetProfit, c.targetProfit_minor));
    if (c.action === 'nextGameNumber') return { gameNumber: nextGameNumber(s) };
    if (c.action === 'validate') { validateSeries(s); return {}; }
    throw new Error(`unknown action ${c.action}`);
  };
  if (c.expect.errorCode) {
    assert.throws(run, (e) => e && e.code === c.expect.errorCode, `expected code ${c.expect.errorCode}`);
    return;
  }
  const r = run();
  if (c.expect.seriesState !== undefined) assert.equal(r.series.state, c.expect.seriesState);
  if (c.expect.realizedLoss !== undefined) assert.equal(formatMoneyMinor(r.series.realizedLossMinor), c.expect.realizedLoss);
  if (c.expect.gamesUsed !== undefined) assert.equal(r.series.gamesUsed, c.expect.gamesUsed);
  if (c.expect.stopReason !== undefined) assert.equal(r.series.stopReason, c.expect.stopReason);
  if (c.expect.betState !== undefined) assert.equal(r.bet.state, c.expect.betState);
  if (c.expect.actualProfit !== undefined) assert.equal(formatMoneyMinor(r.bet.actualProfitMinor), c.expect.actualProfit);
  if (c.expect.targetMet !== undefined) assert.equal(r.bet.targetMet, c.expect.targetMet);
  if (c.expect.gameNumber !== undefined) assert.equal(r.gameNumber, c.expect.gameNumber);
  if (c.expect.pendingActualStake !== undefined) assert.equal(formatMoneyMinor(r.series.pending.actualStakeMinor), c.expect.pendingActualStake);
  if (c.expect.pendingRequiredStake !== undefined) assert.equal(formatMoneyMinor(r.series.pending.requiredStakeMinor), c.expect.pendingRequiredStake);
  if (c.expect.betActualStake !== undefined) assert.equal(formatMoneyMinor(r.bet.actualStakeMinor), c.expect.betActualStake);
  if (c.expect.betRequiredStake !== undefined) assert.equal(formatMoneyMinor(r.bet.requiredStakeMinor), c.expect.betRequiredStake);
});

// ── additional hardcoded smoke of a full 3-game series (loss, void, win) ──────
test('additional: loss -> void -> win integrates financial + state', () => {
  let s = newSeries();
  let o = openBet(s, { actualStakeMinor: parseMoneyMinor('20.00'), oddsScaled: parseOddsScaled('3.00'), requiredStakeMinor: parseMoneyMinor('20.00') });
  ({ series: s } = settleBet(o.series, 'lost', parseMoneyMinor('40.00')));         // L = 20.00
  assert.equal(formatMoneyMinor(s.realizedLossMinor), '20.00');
  o = openBet(s, { actualStakeMinor: parseMoneyMinor('30.00'), oddsScaled: parseOddsScaled('3.00'), requiredStakeMinor: parseMoneyMinor('30.00') });
  ({ series: s } = settleBet(o.series, 'void', parseMoneyMinor('40.00')));         // L unchanged
  assert.equal(formatMoneyMinor(s.realizedLossMinor), '20.00');
  assert.equal(s.gamesUsed, 2);
  o = openBet(s, { actualStakeMinor: parseMoneyMinor('30.00'), oddsScaled: parseOddsScaled('3.00'), requiredStakeMinor: parseMoneyMinor('30.00') });
  const done = settleBet(o.series, 'won', parseMoneyMinor('40.00'));               // profit = 30*(2) - 20 = 40.00
  assert.equal(done.series.state, 'won');
  assert.equal(formatMoneyMinor(done.bet.actualProfitMinor), '40.00');
  assert.equal(done.bet.targetMet, true);
});
test('additional: validateSeries rejects a malformed snapshot', () => {
  assert.throws(() => validateSeries({ state: 'open', gamesUsed: 0.5, realizedLossMinor: BigInt(0), pending: null }), (e) => e.code === 'invalid_series');
});
test('additional: settle then re-open advances game_number and clears pending', () => {
  let s = newSeries();
  let o = openBet(s, { actualStakeMinor: parseMoneyMinor('20.00'), oddsScaled: parseOddsScaled('3.00'), requiredStakeMinor: parseMoneyMinor('20.00') });
  assert.equal(o.gameNumber, 1);
  ({ series: s } = settleBet(o.series, 'lost', parseMoneyMinor('40.00')));
  assert.equal(s.pending, null);
  assert.equal(nextGameNumber(s), 2);
  o = openBet(s, { actualStakeMinor: parseMoneyMinor('30.00'), oddsScaled: parseOddsScaled('3.00'), requiredStakeMinor: parseMoneyMinor('30.00') });
  assert.equal(o.gameNumber, 2);
});

// ── property/boundary: ceil guarantees projectedProfit >= P; win@required >= P ─
test('property: required stake always guarantees target (1000 seeded cases)', () => {
  let seed = 1234567n; const rnd = (n) => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return Number(seed % BigInt(n)); };
  for (let i = 0; i < 1000; i++) {
    const L = BigInt(rnd(500000));                 // 0..$5000.00
    const P = BigInt(rnd(500000) + 1);             // >= $0.01
    const O2 = BigInt(1010 + rnd(18990));          // 1.010..19.999 scaled
    const step = BigInt([1, 5, 10, 100][rnd(4)]);  // 1c,5c,10c,$1 steps
    const req = requiredStakeMinor(L, P, O2, step);
    assert.equal(meetsTargetByProduct(req, L, P, O2), true, `product guarantee failed L=${L} P=${P} O=${O2}`);
    const profit = actualProfitMinor(req, O2, L);
    assert.ok(profit >= P, `win-at-required must meet P: profit=${profit} P=${P}`);
  }
});

console.log(`${passed + failed} tests — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
