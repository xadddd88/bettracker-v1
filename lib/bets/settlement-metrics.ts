// Canonical settlement-metrics contract (Decision #058, resolves G4).
//
// Every UI/API surface that reports Win Rate, ROI, Net Profit, settled
// counts, or pending stake must compute them through this module instead
// of maintaining an independent formula.
//
// Status groups (Decision #057 §1.9 / #058):
//   supported settled            → won, lost, void
//   ROI / win-rate eligible      → won, lost (void is excluded)
//   pending                      → pending
//   unsupported financial states → push, cashed_out, partial — reachable in
//     the schema but with NO approved payout/P&L semantics (Decision #057
//     G1); they must not enter any financial metric until a future decision
//     defines them
//   unknown                      → any other value; never counted anywhere
//
// Missing pnl on a supported settled bet contributes 0 (the pre-existing
// safe behavior across all surfaces) — it is not coerced into any other
// financial meaning.

export const SUPPORTED_SETTLED_STATUSES = ['won', 'lost', 'void'] as const
export const ROI_ELIGIBLE_STATUSES = ['won', 'lost'] as const
export const UNSUPPORTED_FINANCIAL_STATUSES = ['push', 'cashed_out', 'partial'] as const

// Settlement P&L may be shown ONLY for these statuses. push/cashed_out/
// partial and unknown values have no approved P&L semantics (Decision #057
// G1), so surfaces must not render a stored pnl for them — stake and odds
// remain valid input facts.
export function isSupportedSettlementStatus(status: string): boolean {
  return (SUPPORTED_SETTLED_STATUSES as readonly string[]).includes(status)
}

export interface SettlementMetricsInput {
  status: string
  stake: number
  pnl?: number | null
  total_odds?: number | null
}

export interface SettlementMetrics {
  wonCount: number
  lostCount: number
  voidCount: number
  pendingCount: number
  /** push / cashed_out / partial — financially unsupported, excluded everywhere */
  unsupportedCount: number
  /** unrecognized status values — excluded everywhere */
  unknownCount: number
  /** won + lost + void */
  settledCount: number
  /** won ÷ (won + lost) × 100; null when won + lost = 0 */
  winRate: number | null
  /** Σ pnl over won + lost + void (missing pnl counts as 0) */
  netProfit: number
  /** Σ stake over won + lost */
  roiEligibleStake: number
  /** netProfit ÷ roiEligibleStake × 100; null when eligible stake = 0 */
  roi: number | null
  /** Σ stake over pending only */
  pendingStake: number
  /** mean total_odds over won + lost bets that have odds; null when none */
  avgOdds: number | null
}

export function calcSettlementMetrics(
  bets: readonly SettlementMetricsInput[]
): SettlementMetrics {
  let wonCount = 0
  let lostCount = 0
  let voidCount = 0
  let pendingCount = 0
  let unsupportedCount = 0
  let unknownCount = 0
  let netProfit = 0
  let roiEligibleStake = 0
  let pendingStake = 0
  let oddsSum = 0
  let oddsCount = 0

  for (const bet of bets) {
    switch (bet.status) {
      case 'won':
      case 'lost':
        if (bet.status === 'won') wonCount++
        else lostCount++
        netProfit += bet.pnl ?? 0
        roiEligibleStake += bet.stake
        if (bet.total_odds != null) {
          oddsSum += bet.total_odds
          oddsCount++
        }
        break
      case 'void':
        voidCount++
        netProfit += bet.pnl ?? 0
        break
      case 'pending':
        pendingCount++
        pendingStake += bet.stake
        break
      case 'push':
      case 'cashed_out':
      case 'partial':
        unsupportedCount++
        break
      default:
        unknownCount++
    }
  }

  const winLost = wonCount + lostCount

  return {
    wonCount,
    lostCount,
    voidCount,
    pendingCount,
    unsupportedCount,
    unknownCount,
    settledCount: winLost + voidCount,
    winRate: winLost > 0 ? (wonCount / winLost) * 100 : null,
    netProfit,
    roiEligibleStake,
    roi: roiEligibleStake > 0 ? (netProfit / roiEligibleStake) * 100 : null,
    pendingStake,
    avgOdds: oddsCount > 0 ? oddsSum / oddsCount : null,
  }
}
