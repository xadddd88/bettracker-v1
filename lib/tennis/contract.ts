// Tennis Live Series Calculator V1 — PR-1 pure contract layer.
//
// All money/odds domain inputs arrive as DECIMAL STRINGS and are parsed to exact
// BigInt units. No Number / parseFloat / Math.round anywhere in domain math.
// Extra precision is REJECTED (typed error), never silently rounded.
//
// Scales (fixed by the Stage-2 gate):
//   moneyScale = 100   → money minor units (cents)
//   oddsScale  = 1000  → odds milli-units
//   odds range 1.010 .. 20.000  → 1010 .. 20000 (scaled)

// BigInt constants via BigInt(...) (not `n` literals) so the module type-checks under
// the app tsconfig target as well as the ES2020 scripts build. Behavior is identical.
const B0 = BigInt(0);
export const MONEY_SCALE = BigInt(100);
export const ODDS_SCALE = BigInt(1000);
export const MIN_ODDS_SCALED = BigInt(1010); // 1.010
export const MAX_ODDS_SCALED = BigInt(20000); // 20.000
// Sanity ceiling on any money value (defensive; BigInt cannot overflow but absurd
// magnitudes must fail closed rather than propagate). $100,000,000.00 = 10,000,000,000 cents.
export const MAX_MONEY_MINOR = BigInt('10000000000');

export type DomainErrorCode =
  | 'money_format'
  | 'money_precision'
  | 'money_out_of_range'
  | 'odds_format'
  | 'odds_precision'
  | 'odds_out_of_range';

export class DomainInputError extends Error {
  code: DomainErrorCode;
  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainInputError';
    this.code = code;
  }
}

// Money: up to 12 integer digits, 0..2 fractional digits. 3+ dp → precision reject.
const MONEY_RE = /^(\d{1,12})(?:\.(\d{1,2}))?$/;
const MONEY_PRECISION_RE = /^\d{1,12}\.\d{3,}$/;

export function parseMoneyMinor(input: string): bigint {
  if (typeof input !== 'string') throw new DomainInputError('money_format', 'money must be a decimal string');
  const s = input.trim();
  if (MONEY_PRECISION_RE.test(s)) throw new DomainInputError('money_precision', `money has more than 2 decimal places: ${s}`);
  const m = MONEY_RE.exec(s);
  if (!m) throw new DomainInputError('money_format', `invalid money string: ${s}`);
  const whole = BigInt(m[1]);
  const frac = (m[2] ?? '').padEnd(2, '0');
  const minor = whole * MONEY_SCALE + BigInt(frac);
  if (minor < B0 || minor > MAX_MONEY_MINOR) throw new DomainInputError('money_out_of_range', `money out of sanity range: ${s}`);
  return minor;
}

// Odds: 1..2 integer digits, 0..3 fractional digits. 4+ dp → precision reject.
const ODDS_RE = /^(\d{1,2})(?:\.(\d{1,3}))?$/;
const ODDS_PRECISION_RE = /^\d{1,2}\.\d{4,}$/;

export function parseOddsScaled(input: string): bigint {
  if (typeof input !== 'string') throw new DomainInputError('odds_format', 'odds must be a decimal string');
  const s = input.trim();
  if (ODDS_PRECISION_RE.test(s)) throw new DomainInputError('odds_precision', `odds has more than 3 decimal places: ${s}`);
  const m = ODDS_RE.exec(s);
  if (!m) throw new DomainInputError('odds_format', `invalid odds string: ${s}`);
  const whole = BigInt(m[1]);
  const frac = (m[2] ?? '').padEnd(3, '0');
  const scaled = whole * ODDS_SCALE + BigInt(frac);
  if (scaled < MIN_ODDS_SCALED || scaled > MAX_ODDS_SCALED) {
    throw new DomainInputError('odds_out_of_range', `odds out of range [1.010, 20.000]: ${s}`);
  }
  return scaled;
}

// Format a money-minor BigInt back to a canonical decimal string (2 dp), for
// deterministic reporting/golden-vector comparison. Sign-aware for profit values.
export function formatMoneyMinor(minor: bigint): string {
  const neg = minor < B0;
  const abs = neg ? -minor : minor;
  const whole = abs / MONEY_SCALE;
  const frac = (abs % MONEY_SCALE).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${whole.toString()}.${frac}`;
}
