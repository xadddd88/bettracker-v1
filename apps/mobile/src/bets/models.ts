export const BET_STATUSES = [
  'pending',
  'won',
  'lost',
  'void',
  'push',
  'cashed_out',
  'partial',
] as const;

export type BetStatus = (typeof BET_STATUSES)[number] | 'unknown';

export interface BetLegDto {
  id: string;
  legIndex: number | null;
  sport: string | null;
  eventName: string;
  marketType: string | null;
  selection: string | null;
  odds: number;
  status: string;
}

export interface BetDto {
  id: string;
  betType: string;
  bookmaker: string | null;
  legs: BetLegDto[];
  notes: string | null;
  placedAt: string;
  pnl: number | null;
  potentialPayout: number | null;
  settledAt: string | null;
  source: string | null;
  stake: number;
  status: BetStatus;
  totalOdds: number | null;
}

export interface CouponLeg {
  eventName: string;
  id: string;
  index: number;
  marketType: string | null;
  odds: number | null;
  selection: string | null;
}

export interface CouponPresentation {
  isExpress: boolean;
  isLegacy: boolean;
  label: string;
  legs: CouponLeg[];
}

interface RawLeg {
  event_name: string;
  id: string;
  leg_index?: number | null;
  leg_status?: string | null;
  market_type?: string | null;
  odds: number | string;
  selection?: string | null;
  sport?: string | null;
}

interface RawBet {
  bet_type: string;
  bookmaker?: string | null;
  id: string;
  legs?: RawLeg[] | null;
  notes?: string | null;
  placed_at: string;
  pnl?: number | string | null;
  potential_payout?: number | string | null;
  settled_at?: string | null;
  source?: string | null;
  stake: number | string;
  status: string;
  total_odds?: number | string | null;
}

function finiteNumber(value: number | string | null | undefined, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = finiteNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveBetStatus(value: string): BetStatus {
  return (BET_STATUSES as readonly string[]).includes(value) ? value as BetStatus : 'unknown';
}

export function sortLegs<T extends { legIndex: number | null }>(legs: T[]): T[] {
  return legs
    .map((leg, originalIndex) => ({ leg, originalIndex }))
    .sort((left, right) => {
      if (left.leg.legIndex === null && right.leg.legIndex === null) {
        return left.originalIndex - right.originalIndex;
      }
      if (left.leg.legIndex === null) return 1;
      if (right.leg.legIndex === null) return -1;
      return left.leg.legIndex - right.leg.legIndex || left.originalIndex - right.originalIndex;
    })
    .map(({ leg }) => leg);
}

export function mapBetRow(row: RawBet): BetDto {
  const legs = (row.legs ?? []).map((leg): BetLegDto => ({
    eventName: leg.event_name,
    id: leg.id,
    legIndex: Number.isInteger(leg.leg_index) ? leg.leg_index! : null,
    marketType: leg.market_type ?? null,
    odds: finiteNumber(leg.odds),
    selection: leg.selection?.trim() || null,
    sport: leg.sport ?? null,
    status: leg.leg_status ?? 'pending',
  }));

  return {
    betType: row.bet_type,
    bookmaker: row.bookmaker ?? null,
    id: row.id,
    legs: sortLegs(legs),
    notes: row.notes ?? null,
    placedAt: row.placed_at,
    pnl: nullableNumber(row.pnl),
    potentialPayout: nullableNumber(row.potential_payout),
    settledAt: row.settled_at ?? null,
    source: row.source ?? null,
    stake: finiteNumber(row.stake),
    status: resolveBetStatus(row.status),
    totalOdds: nullableNumber(row.total_odds),
  };
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  AUD: 'A$',
  CAD: 'CA$',
  EUR: '€',
  GBP: '£',
  UAH: '₴',
  USD: '$',
};

export function currencySymbol(currency: string | null | undefined): string {
  if (!currency) return '$';
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}

export function formatMoney(value: number, currency: string): string {
  const symbol = currencySymbol(currency);
  const sign = value < 0 ? '-' : '';
  return `${sign}${symbol}${Math.abs(value).toFixed(2)}`;
}

export function betFinancialSummary(
  bet: Pick<BetDto, 'pnl' | 'potentialPayout'>,
  currency: string,
): { label: 'P&L' | 'Payout'; value: string } {
  if (bet.pnl !== null) {
    return { label: 'P&L', value: formatMoney(bet.pnl, currency) };
  }

  return {
    label: 'Payout',
    value: bet.potentialPayout === null ? '—' : formatMoney(bet.potentialPayout, currency),
  };
}

export function betTitle(bet: BetDto): string {
  if (bet.legs.length === 0) return 'Tracked bet';
  if (bet.legs.length === 1) return bet.legs[0].eventName;
  return `${bet.legs.length}-leg Express`;
}

function legacyExpressCount(marketType: string | null): number | null {
  if (!marketType) return null;
  const match = marketType.match(/(?:express|експрес)\s*\(\s*(\d+)\s*(?:legs?|ног)/i);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isInteger(count) && count >= 2 && count <= 20 ? count : null;
}

function splitLegacyParts(value: string | null, expected: number): string[] | null {
  if (!value) return null;
  const parts = value.split(/\s+\+\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length === expected ? parts : null;
}

export function couponPresentation(bet: BetDto): CouponPresentation {
  const mappedLegs = bet.legs.map((leg, index): CouponLeg => ({
    eventName: leg.eventName,
    id: leg.id,
    index: leg.legIndex ?? index + 1,
    marketType: leg.marketType,
    odds: leg.odds,
    selection: leg.selection,
  }));

  if (mappedLegs.length > 1) {
    return {
      isExpress: true,
      isLegacy: false,
      label: `Express · ${mappedLegs.length} legs`,
      legs: mappedLegs,
    };
  }

  const onlyLeg = bet.legs[0];
  const expected = legacyExpressCount(onlyLeg?.marketType ?? null);
  const events = expected && onlyLeg ? splitLegacyParts(onlyLeg.eventName, expected) : null;
  const selections = expected && onlyLeg ? splitLegacyParts(onlyLeg.selection, expected) : null;

  if (onlyLeg && expected && events && selections) {
    return {
      isExpress: true,
      isLegacy: true,
      label: `Express · ${expected} legs`,
      legs: events.map((eventName, index) => ({
        eventName,
        id: `${onlyLeg.id}-legacy-${index + 1}`,
        index: index + 1,
        marketType: null,
        odds: null,
        selection: selections[index],
      })),
    };
  }

  const legacyExpress = bet.betType === 'parlay' || expected !== null;
  return {
    isExpress: legacyExpress,
    isLegacy: legacyExpress,
    label: legacyExpress ? 'Legacy Express' : 'Single',
    legs: mappedLegs,
  };
}
