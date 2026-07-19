import type { BetDto } from '@/bets/models';

export interface BetSummary {
  netPnl: number;
  openCount: number;
  settledCount: number;
}

export function summarizeBets(bets: readonly BetDto[]): BetSummary {
  return bets.reduce<BetSummary>((summary, bet) => {
    if (bet.status === 'pending') summary.openCount += 1;
    if (bet.pnl !== null) {
      summary.netPnl += bet.pnl;
      summary.settledCount += 1;
    }
    return summary;
  }, { netPnl: 0, openCount: 0, settledCount: 0 });
}
