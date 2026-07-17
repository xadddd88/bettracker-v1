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

export function betTitle(bet: BetDto): string {
  if (bet.legs.length === 0) return 'Tracked bet';
  if (bet.legs.length === 1) return bet.legs[0].eventName;
  return `${bet.legs.length}-leg Express`;
}
