// Tennis Live Series Calculator V1 — PR-1 pure state machine + financial state.
//
// Series: open | won | stopped.  Bet: pending | won | lost | void (really modeled).
// - realizedLossMinor lives on the series and is the authority for L.
// - Exactly one pending bet per series (a PendingBet object, not a boolean).
// - loss: realizedLossMinor += pending.actualStakeMinor (blocked if it would cross the
//   money ceiling); void: unchanged; win: settled bet 'won' with actualProfitMinor +
//   targetMet, using L BEFORE settlement.
// - void CONSUMES a game_number; lost/void on game 15 → stopped(max_games); win → won.
// - Fail-closed: every entry validates the Series snapshot and its money/odds fields.

import { MAX_MONEY_MINOR, MIN_ODDS_SCALED, MAX_ODDS_SCALED } from './contract';
import { actualProfitMinor, targetMet, assertMoneyInput, assertTargetProfit, assertOddsInRange } from './series-math';

export const MAX_GAMES = 15;

export type SeriesState = 'open' | 'won' | 'stopped';
export type BetState = 'pending' | 'won' | 'lost' | 'void';
export type BetResult = 'won' | 'lost' | 'void';
export type StopReason = 'manual' | 'max_games';

export interface PendingBet {
  state: 'pending';
  gameNumber: number;
  actualStakeMinor: bigint;
  oddsScaled: bigint;
  requiredStakeMinor: bigint;
}

export interface SettledBet {
  state: 'won' | 'lost' | 'void';
  gameNumber: number;
  actualStakeMinor: bigint;
  requiredStakeMinor: bigint; // kept separate from actualStakeMinor
  oddsScaled: bigint;
  actualProfitMinor?: bigint; // 'won' only
  targetMet?: boolean;        // 'won' only
}

export interface Series {
  state: SeriesState;
  gamesUsed: number;
  realizedLossMinor: bigint;
  pending: PendingBet | null;
  stopReason?: StopReason;
}

export type StateErrorCode =
  | 'invalid_series'
  | 'series_not_open'
  | 'pending_bet_exists'
  | 'no_pending_bet'
  | 'max_games'
  | 'invalid_result'
  | 'loss_exceeds_ceiling';

export class SeriesStateError extends Error {
  code: StateErrorCode;
  constructor(code: StateErrorCode, message: string) {
    super(message);
    this.name = 'SeriesStateError';
    this.code = code;
  }
}

const ZERO = BigInt(0);
const VALID_STATES: readonly SeriesState[] = ['open', 'won', 'stopped'];
const VALID_RESULTS: readonly BetResult[] = ['won', 'lost', 'void'];
const VALID_STOP_REASONS: readonly StopReason[] = ['manual', 'max_games'];

function inMoneyRange(v: unknown): boolean {
  return typeof v === 'bigint' && v >= ZERO && v <= MAX_MONEY_MINOR;
}
function inOddsRange(v: unknown): boolean {
  return typeof v === 'bigint' && v >= MIN_ODDS_SCALED && v <= MAX_ODDS_SCALED;
}

/** Fail-closed validation of a Series snapshot. Throws invalid_series on any defect. */
export function validateSeries(series: Series): void {
  if (!series || typeof series !== 'object') throw new SeriesStateError('invalid_series', 'series must be an object');
  if (!VALID_STATES.includes(series.state)) throw new SeriesStateError('invalid_series', `invalid series state: ${String(series.state)}`);
  const g = series.gamesUsed;
  if (typeof g !== 'number' || !Number.isInteger(g) || g < 0 || g > MAX_GAMES) {
    throw new SeriesStateError('invalid_series', `gamesUsed must be an integer in [0, ${MAX_GAMES}]`);
  }
  if (!inMoneyRange(series.realizedLossMinor)) {
    throw new SeriesStateError('invalid_series', 'realizedLossMinor must be a non-negative bigint within the money ceiling');
  }
  // a won series must have consumed at least one game — you cannot win at game zero
  if (series.state === 'won' && g < 1) {
    throw new SeriesStateError('invalid_series', 'a won series must have consumed at least one game (gamesUsed >= 1)');
  }
  // state <-> stopReason consistency
  if (series.state === 'stopped') {
    if (series.stopReason === undefined || !VALID_STOP_REASONS.includes(series.stopReason)) {
      throw new SeriesStateError('invalid_series', 'a stopped series must have a valid stopReason');
    }
    if (series.stopReason === 'max_games' && g !== MAX_GAMES) {
      throw new SeriesStateError('invalid_series', 'max_games stopReason requires gamesUsed = 15');
    }
  } else if (series.stopReason !== undefined) {
    throw new SeriesStateError('invalid_series', `a ${series.state} series must not carry a stopReason`);
  }
  // pending consistency
  const p = series.pending;
  if (p !== null) {
    if (series.state !== 'open') throw new SeriesStateError('invalid_series', 'a pending bet is only valid while the series is open');
    if (!p || p.state !== 'pending') throw new SeriesStateError('invalid_series', 'pending bet malformed');
    if (!Number.isInteger(p.gameNumber) || p.gameNumber !== g + 1 || p.gameNumber < 1 || p.gameNumber > MAX_GAMES) {
      throw new SeriesStateError('invalid_series', 'pending gameNumber must be the next ordinal within range');
    }
    if (!inMoneyRange(p.actualStakeMinor) || !inMoneyRange(p.requiredStakeMinor)) {
      throw new SeriesStateError('invalid_series', 'pending stake fields must be in-range money values');
    }
    if (!inOddsRange(p.oddsScaled)) {
      throw new SeriesStateError('invalid_series', 'pending odds must be within [1.010, 20.000]');
    }
  }
}

export function newSeries(): Series {
  return { state: 'open', gamesUsed: 0, realizedLossMinor: ZERO, pending: null };
}

/**
 * The game_number the next opened bet would occupy (1-based). Fail-closed: validates the
 * snapshot first, and once all MAX_GAMES have been used there is no next game — throws
 * max_games rather than returning an out-of-range 16.
 */
export function nextGameNumber(series: Series): number {
  validateSeries(series);
  const n = series.gamesUsed + 1;
  if (n > MAX_GAMES) throw new SeriesStateError('max_games', `no next game: all ${MAX_GAMES} games have been used`);
  return n;
}

/** Open a new pending bet. Validates snapshot + bet money/odds; blocks the 16th bet. */
export function openBet(
  series: Series,
  bet: { actualStakeMinor: bigint; oddsScaled: bigint; requiredStakeMinor: bigint },
): { gameNumber: number; series: Series } {
  validateSeries(series);
  if (series.state !== 'open') throw new SeriesStateError('series_not_open', `cannot open a bet on a ${series.state} series`);
  if (series.pending !== null) throw new SeriesStateError('pending_bet_exists', 'a pending bet already exists');
  const gameNumber = series.gamesUsed + 1;
  if (gameNumber > MAX_GAMES) throw new SeriesStateError('max_games', `game ${gameNumber} exceeds max ${MAX_GAMES}`);
  assertMoneyInput(bet.actualStakeMinor);       // rejects negative / out-of-range money
  assertMoneyInput(bet.requiredStakeMinor);
  assertOddsInRange(bet.oddsScaled);            // rejects invalid odds
  const pending: PendingBet = { state: 'pending', gameNumber, actualStakeMinor: bet.actualStakeMinor, oddsScaled: bet.oddsScaled, requiredStakeMinor: bet.requiredStakeMinor };
  return { gameNumber, series: { ...series, pending } };
}

/** Settle the current pending bet, applying the financial transition. */
export function settleBet(series: Series, result: BetResult, targetProfitMinor: bigint): { series: Series; bet: SettledBet } {
  validateSeries(series);
  if (series.state !== 'open') throw new SeriesStateError('series_not_open', `cannot settle on a ${series.state} series`);
  if (series.pending === null) throw new SeriesStateError('no_pending_bet', 'no pending bet to settle');
  if (!VALID_RESULTS.includes(result)) throw new SeriesStateError('invalid_result', `unknown settlement result: ${String(result)}`);
  assertTargetProfit(targetProfitMinor);

  const p = series.pending;
  const gameNumber = p.gameNumber;
  const base = { ...series, pending: null, gamesUsed: gameNumber, stopReason: undefined as StopReason | undefined };

  if (result === 'won') {
    const profit = actualProfitMinor(p.actualStakeMinor, p.oddsScaled, series.realizedLossMinor);
    const bet: SettledBet = { state: 'won', gameNumber, actualStakeMinor: p.actualStakeMinor, requiredStakeMinor: p.requiredStakeMinor, oddsScaled: p.oddsScaled, actualProfitMinor: profit, targetMet: targetMet(profit, targetProfitMinor) };
    return { series: { ...base, state: 'won' }, bet };
  }

  let realizedLossMinor = series.realizedLossMinor;
  if (result === 'lost') {
    if (series.realizedLossMinor + p.actualStakeMinor > MAX_MONEY_MINOR) {
      throw new SeriesStateError('loss_exceeds_ceiling', 'accumulated realized loss would exceed the money ceiling');
    }
    realizedLossMinor = series.realizedLossMinor + p.actualStakeMinor;
  }
  const bet: SettledBet = { state: result, gameNumber, actualStakeMinor: p.actualStakeMinor, requiredStakeMinor: p.requiredStakeMinor, oddsScaled: p.oddsScaled };
  if (gameNumber >= MAX_GAMES) {
    return { series: { ...base, realizedLossMinor, state: 'stopped', stopReason: 'max_games' }, bet };
  }
  return { series: { ...base, realizedLossMinor, state: 'open' }, bet };
}

/** Manual stop. Forbidden while a pending bet exists. */
export function stopSeries(series: Series): { series: Series } {
  validateSeries(series);
  if (series.pending !== null) throw new SeriesStateError('pending_bet_exists', 'cannot stop while a bet is pending');
  if (series.state !== 'open') throw new SeriesStateError('series_not_open', `series is already ${series.state}`);
  return { series: { ...series, state: 'stopped', stopReason: 'manual' } };
}
