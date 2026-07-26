// Tennis Live Series Calculator V1 — PR-1 pure math (BigInt only).
//
// requiredStakeMinor = ceil((L_minor + P_minor) * oddsScale / (oddsScaled - oddsScale))
//   then rounded UP to the stake step.
// actualProfitMinor (win) = floor(actualStakeMinor * (oddsScaled - oddsScale) / oddsScale)
//   - L_before_settlement.
// targetMet = actualProfitMinor >= targetProfitMinor.
// defaultTargetProfitMinor = floor(startingStakeMinor * (openingOddsScaled - oddsScale) / oddsScale).
//
// Fail-closed: every public function validates its money inputs (bigint, non-negative
// where required, |value| <= MAX_MONEY_MINOR) BEFORE any arithmetic — a value above the
// ceiling is never accepted just because a later division brings the result under it.
// Every ADDITION of two money values goes through checkedAdd: the aggregate sum itself
// must stay within the money ceiling, so L + P or L + stake can never silently exceed it.
// Odds are range-checked to [1.010, 20.000] on every path; every computed money output
// is bounded; targetProfit must be non-negative; the stake step is sanity-bounded.

import { ODDS_SCALE, MAX_MONEY_MINOR, MIN_ODDS_SCALED, MAX_ODDS_SCALED } from './contract';

const ZERO = BigInt(0);
const ONE = BigInt(1);

export type MathErrorCode =
  | 'non_bigint'
  | 'negative_input'
  | 'zero_input'
  | 'input_out_of_range'
  | 'odds_out_of_range'
  | 'sanity_bound'
  | 'output_out_of_range'
  | 'aggregate_out_of_range'
  | 'bad_step'
  | 'negative_target'
  | 'zero_target'
  | 'invalid_games'
  | 'bank_too_small';

export class SeriesMathError extends Error {
  code: MathErrorCode;
  constructor(code: MathErrorCode, message: string) {
    super(message);
    this.name = 'SeriesMathError';
    this.code = code;
  }
}

const MAX_INTERMEDIATE = MAX_MONEY_MINOR * ODDS_SCALE * BigInt(1000);

// ── Single typed money-input validator ────────────────────────────────────────
export function assertMoneyInput(v: bigint, nonNeg = true): void {
  if (typeof v !== 'bigint') throw new SeriesMathError('non_bigint', 'money input must be a bigint');
  if (nonNeg && v < ZERO) throw new SeriesMathError('negative_input', 'money input must be non-negative');
  if (v > MAX_MONEY_MINOR || v < -MAX_MONEY_MINOR) throw new SeriesMathError('input_out_of_range', 'money input exceeds sanity ceiling');
}
export function assertStep(stepMinor: bigint): void {
  if (typeof stepMinor !== 'bigint') throw new SeriesMathError('non_bigint', 'stake step must be a bigint');
  if (stepMinor < ONE) throw new SeriesMathError('bad_step', 'stake step must be >= 1 minor unit');
  if (stepMinor > MAX_MONEY_MINOR) throw new SeriesMathError('input_out_of_range', 'stake step exceeds sanity ceiling');
}
export function assertTargetProfit(v: bigint): void {
  if (typeof v !== 'bigint') throw new SeriesMathError('non_bigint', 'target profit must be a bigint');
  if (v < ZERO) throw new SeriesMathError('negative_target', 'target profit must be non-negative');
  if (v > MAX_MONEY_MINOR) throw new SeriesMathError('input_out_of_range', 'target profit exceeds sanity ceiling');
}
export function assertOddsInRange(oddsScaled: bigint): void {
  if (typeof oddsScaled !== 'bigint') throw new SeriesMathError('non_bigint', 'odds must be a bigint');
  if (oddsScaled < MIN_ODDS_SCALED || oddsScaled > MAX_ODDS_SCALED) throw new SeriesMathError('odds_out_of_range', 'odds must be within [1.010, 20.000]');
}
function assertBound(v: bigint): void {
  if (v > MAX_INTERMEDIATE || v < -MAX_INTERMEDIATE) throw new SeriesMathError('sanity_bound', 'intermediate exceeds sanity bound');
}
function assertOutputBound(v: bigint): void {
  if (v > MAX_MONEY_MINOR || v < -MAX_MONEY_MINOR) throw new SeriesMathError('output_out_of_range', 'computed money output out of sanity range');
}
/**
 * Add two money values with an aggregate bound: each operand is validated, and the SUM
 * must itself stay within [-MAX_MONEY_MINOR, MAX_MONEY_MINOR]. Two in-range values could
 * otherwise sum to twice the ceiling and slip through a later division — checkedAdd makes
 * that a typed `aggregate_out_of_range` error instead.
 */
export function checkedAdd(a: bigint, b: bigint, nonNeg = true): bigint {
  assertMoneyInput(a, nonNeg);
  assertMoneyInput(b, nonNeg);
  const sum = a + b;
  if (sum > MAX_MONEY_MINOR || sum < -MAX_MONEY_MINOR) {
    throw new SeriesMathError('aggregate_out_of_range', 'sum of money values exceeds the money ceiling');
  }
  return sum;
}
function ceilDivPos(a: bigint, b: bigint): bigint { return (a + b - ONE) / b; }
function floorDivPos(a: bigint, b: bigint): bigint { return a / b; }
function oddsMinusOne(oddsScaled: bigint): bigint { assertOddsInRange(oddsScaled); return oddsScaled - ODDS_SCALE; }

/** Raw required stake, rounded UP to the minor unit (cent). */
export function requiredStakeMinorRaw(lMinor: bigint, pMinor: bigint, oddsScaled: bigint): bigint {
  const sum = checkedAdd(lMinor, pMinor);       // validates each operand + the aggregate L + P
  const denom = oddsMinusOne(oddsScaled);
  const numer = sum * ODDS_SCALE;
  assertBound(numer);
  const out = ceilDivPos(numer, denom);
  assertOutputBound(out);
  return out;
}

/** Round a minor-unit amount UP to a stake step (>=1 minor unit). step=1 → no-op. */
export function roundUpToStep(minor: bigint, stepMinor: bigint): bigint {
  assertMoneyInput(minor);
  assertStep(stepMinor);
  if (stepMinor === ONE) return minor;
  const out = ceilDivPos(minor, stepMinor) * stepMinor;
  assertOutputBound(out);
  return out;
}

/** Required stake rounded UP to minor unit, then UP to the stake step. */
export function requiredStakeMinor(lMinor: bigint, pMinor: bigint, oddsScaled: bigint, stepMinor: bigint = ONE): bigint {
  assertStep(stepMinor);
  const out = roundUpToStep(requiredStakeMinorRaw(lMinor, pMinor, oddsScaled), stepMinor);
  assertOutputBound(out);
  return out;
}

/** Realized net series profit on a WIN, from the ACTUAL stake and stored odds. */
export function actualProfitMinor(actualStakeMinor: bigint, oddsScaled: bigint, lBeforeMinor: bigint): bigint {
  assertMoneyInput(actualStakeMinor);
  assertMoneyInput(lBeforeMinor);
  const gain = oddsMinusOne(oddsScaled);
  const gross = actualStakeMinor * gain;
  assertBound(gross);
  const out = floorDivPos(gross, ODDS_SCALE) - lBeforeMinor;
  assertOutputBound(out);
  return out;
}

/** target_met on a win: actual net profit meets or exceeds the target. Integer compare. */
export function targetMet(actualProfitMinorValue: bigint, targetProfitMinor: bigint): boolean {
  assertMoneyInput(actualProfitMinorValue, false); // profit may be negative
  assertTargetProfit(targetProfitMinor);
  return actualProfitMinorValue >= targetProfitMinor;
}

/**
 * projectedProfit >= P guarantee check by integer PRODUCT comparison (no division):
 *   requiredStakeMinor * (oddsScaled - oddsScale) >= (L_minor + P_minor) * oddsScale
 */
export function meetsTargetByProduct(requiredStakeMinorValue: bigint, lMinor: bigint, pMinor: bigint, oddsScaled: bigint): boolean {
  assertMoneyInput(requiredStakeMinorValue);
  const sum = checkedAdd(lMinor, pMinor);       // validates each operand + the aggregate L + P
  const gain = oddsMinusOne(oddsScaled);
  const lhs = requiredStakeMinorValue * gain;
  const rhs = sum * ODDS_SCALE;
  assertBound(lhs);
  assertBound(rhs);
  return lhs >= rhs;
}

/** Default target profit derived from starting stake and opening odds (floor). */
export function defaultTargetProfitMinor(startingStakeMinor: bigint, openingOddsScaled: bigint): bigint {
  assertMoneyInput(startingStakeMinor);
  const gain = oddsMinusOne(openingOddsScaled);
  const gross = startingStakeMinor * gain;
  assertBound(gross);
  const out = floorDivPos(gross, ODDS_SCALE);
  assertOutputBound(out);
  return out;
}

export interface FixedOddsPlan {
  bankrollRequiredMinor: bigint;
  initialStakeMinor: bigint;
  stakesMinor: bigint[];
  targetProfitMinor: bigint;
}

function assertGameCount(games: number): void {
  if (!Number.isInteger(games) || games < 1 || games > 15) {
    throw new SeriesMathError('invalid_games', 'games must be a whole number between 1 and 15');
  }
}

/**
 * Build the consecutive-loss stake plan for one fixed coefficient.
 *
 * The first stake defines the target profit. Every later stake recovers all
 * recorded losses and preserves that same target profit. The total is the
 * isolated bank required to reach the selected final game.
 */
export function fixedOddsPlan(
  initialStakeMinor: bigint,
  oddsScaled: bigint,
  games: number,
  stepMinor: bigint = ONE,
): FixedOddsPlan {
  assertMoneyInput(initialStakeMinor);
  if (initialStakeMinor === ZERO) {
    throw new SeriesMathError('zero_input', 'initial stake must be greater than zero');
  }
  assertOddsInRange(oddsScaled);
  assertGameCount(games);
  assertStep(stepMinor);

  const targetProfitMinor = defaultTargetProfitMinor(initialStakeMinor, oddsScaled);
  if (targetProfitMinor === ZERO) {
    throw new SeriesMathError('zero_target', 'initial stake is too small for this coefficient');
  }

  const stakesMinor: bigint[] = [];
  let accumulatedLossMinor = ZERO;
  for (let game = 1; game <= games; game += 1) {
    const stakeMinor = game === 1
      ? initialStakeMinor
      : requiredStakeMinor(accumulatedLossMinor, targetProfitMinor, oddsScaled, stepMinor);
    stakesMinor.push(stakeMinor);
    accumulatedLossMinor = checkedAdd(accumulatedLossMinor, stakeMinor);
  }

  return {
    bankrollRequiredMinor: accumulatedLossMinor,
    initialStakeMinor,
    stakesMinor,
    targetProfitMinor,
  };
}

/**
 * Find the largest cent-denominated first stake whose full fixed-odds plan
 * fits within the selected isolated bank.
 */
export function fixedOddsPlanForBankroll(
  bankrollLimitMinor: bigint,
  oddsScaled: bigint,
  games: number,
  stepMinor: bigint = ONE,
): FixedOddsPlan {
  assertMoneyInput(bankrollLimitMinor);
  if (bankrollLimitMinor === ZERO) {
    throw new SeriesMathError('zero_input', 'bankroll must be greater than zero');
  }
  assertOddsInRange(oddsScaled);
  assertGameCount(games);
  assertStep(stepMinor);

  const gain = oddsMinusOne(oddsScaled);
  const minimumInitialStake = ceilDivPos(ODDS_SCALE, gain);
  let low = minimumInitialStake;
  let high = bankrollLimitMinor;
  let best: FixedOddsPlan | null = null;

  while (low <= high) {
    const candidate = (low + high) / BigInt(2);
    let plan: FixedOddsPlan | null = null;
    try {
      plan = fixedOddsPlan(candidate, oddsScaled, games, stepMinor);
    } catch (error) {
      if (!(error instanceof SeriesMathError)
        || !['aggregate_out_of_range', 'output_out_of_range', 'sanity_bound'].includes(error.code)) {
        throw error;
      }
    }

    if (plan && plan.bankrollRequiredMinor <= bankrollLimitMinor) {
      best = plan;
      low = candidate + ONE;
    } else {
      high = candidate - ONE;
    }
  }

  if (!best) {
    throw new SeriesMathError('bank_too_small', 'bankroll is too small for this coefficient and game count');
  }
  return best;
}

// ── Limit checks (gate C): required AND actual are checked independently. ──────
export type LimitBlockReason =
  | 'required_exceeds_remaining_bank'
  | 'actual_exceeds_remaining_bank'
  | 'required_exceeds_per_bet_limit'
  | 'actual_exceeds_per_bet_limit'
  | 'required_exceeds_series_exposure'
  | 'actual_exceeds_series_exposure';

export interface LimitInputs {
  requiredStakeMinor: bigint;
  actualStakeMinor: bigint;
  lMinor: bigint;
  remainingBankMinor: bigint;   // must be a non-negative, in-range money value
  perBetLimitMinor: bigint;
  seriesExposureLimitMinor: bigint;
}
export type LimitResult = { ok: true } | { ok: false; reason: LimitBlockReason };

/** Fail-closed limit gate. Validates all inputs first; never advises increasing the bank. */
export function checkOpenBetLimits(i: LimitInputs): LimitResult {
  assertMoneyInput(i.requiredStakeMinor);
  assertMoneyInput(i.actualStakeMinor);
  assertMoneyInput(i.lMinor);
  assertMoneyInput(i.remainingBankMinor); // negative remaining bank → typed error, not a block
  assertMoneyInput(i.perBetLimitMinor);
  assertMoneyInput(i.seriesExposureLimitMinor);
  if (i.requiredStakeMinor > i.remainingBankMinor) return { ok: false, reason: 'required_exceeds_remaining_bank' };
  if (i.actualStakeMinor > i.remainingBankMinor) return { ok: false, reason: 'actual_exceeds_remaining_bank' };
  if (i.requiredStakeMinor > i.perBetLimitMinor) return { ok: false, reason: 'required_exceeds_per_bet_limit' };
  if (i.actualStakeMinor > i.perBetLimitMinor) return { ok: false, reason: 'actual_exceeds_per_bet_limit' };
  // Aggregate exposure sums are checkedAdd'd: L + stake can never silently exceed the ceiling.
  if (checkedAdd(i.lMinor, i.requiredStakeMinor) > i.seriesExposureLimitMinor) return { ok: false, reason: 'required_exceeds_series_exposure' };
  if (checkedAdd(i.lMinor, i.actualStakeMinor) > i.seriesExposureLimitMinor) return { ok: false, reason: 'actual_exceeds_series_exposure' };
  return { ok: true };
}
