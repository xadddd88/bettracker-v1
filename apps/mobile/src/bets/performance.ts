import type { BetDto } from '@/bets/models';

export type MobilePerformance = {
  avgOdds: number | null;
  bySport: {
    label: string;
    lost: number;
    netPnl: number;
    pending: number;
    roi: number | null;
    total: number;
    void: number;
    winRate: number | null;
    won: number;
  }[];
  lost: number;
  netPnl: number;
  pending: number;
  pendingStake: number;
  roi: number | null;
  settled: number;
  unsupported: number;
  void: number;
  winRate: number | null;
  won: number;
};

type CorePerformance = Omit<MobilePerformance, 'bySport'>;

const KNOWN_SPORTS = new Set(['basketball', 'cs2', 'ice_hockey', 'mma', 'other', 'soccer', 'tennis']);

function normalizedSport(sport: string | null): string {
  const normalized = sport?.trim().toLowerCase() ?? '';
  return KNOWN_SPORTS.has(normalized) ? normalized : 'other';
}

export function betSportBucket(bet: Pick<BetDto, 'legs'>): string {
  const sports = bet.legs.map((leg) => normalizedSport(leg.sport));
  if (sports.length === 0) return 'other';
  return new Set(sports).size === 1 ? sports[0]! : 'mixed';
}

function calculateCore(bets: readonly BetDto[]): CorePerformance {
  let won = 0;
  let lost = 0;
  let voidCount = 0;
  let pending = 0;
  let unsupported = 0;
  let netPnl = 0;
  let roiStake = 0;
  let pendingStake = 0;
  let oddsSum = 0;
  let oddsCount = 0;

  for (const bet of bets) {
    if (bet.status === 'won' || bet.status === 'lost') {
      if (bet.status === 'won') won += 1;
      else lost += 1;
      netPnl += bet.pnl ?? 0;
      roiStake += bet.stake;
      const odds = bet.totalOdds ?? bet.legs[0]?.odds ?? null;
      if (odds !== null) {
        oddsSum += odds;
        oddsCount += 1;
      }
    } else if (bet.status === 'void') {
      voidCount += 1;
      netPnl += bet.pnl ?? 0;
    } else if (bet.status === 'pending') {
      pending += 1;
      pendingStake += bet.stake;
    } else {
      unsupported += 1;
    }
  }

  const winLoss = won + lost;
  return {
    avgOdds: oddsCount ? oddsSum / oddsCount : null,
    lost,
    netPnl,
    pending,
    pendingStake,
    roi: roiStake ? (netPnl / roiStake) * 100 : null,
    settled: winLoss + voidCount,
    unsupported,
    void: voidCount,
    winRate: winLoss ? (won / winLoss) * 100 : null,
    won,
  };
}

export function calculateMobilePerformance(bets: readonly BetDto[]): MobilePerformance {
  const groups = new Map<string, BetDto[]>();
  for (const bet of bets) {
    const sport = betSportBucket(bet);
    groups.set(sport, [...(groups.get(sport) ?? []), bet]);
  }

  const bySport = [...groups.entries()]
    .map(([label, rows]) => ({ label, total: rows.length, ...calculateCore(rows) }))
    .map(({ avgOdds: _avgOdds, pendingStake: _pendingStake, settled: _settled, unsupported: _unsupported, ...row }) => row)
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label));

  return { ...calculateCore(bets), bySport };
}
