import type { Bet } from '@/types'

export interface PerformanceMetrics {
  netProfit: number
  roi: number | null
  winRate: number | null
  settledCount: number
  pendingStake: number
  totalDecisions: number
  conversionRate: number | null
  avgOdds: number | null

  wonCount: number
  lostCount: number
  voidCount: number
  pendingCount: number

  decisionsByAction: Record<string, number>

  bySport: SportPerf[]
  bySource: SourcePerf[]
  aiAnalyst: AIPerf
}

export interface SportPerf {
  sport: string
  total: number
  won: number
  lost: number
  void: number
  pending: number
  winRate: number | null
  roi: number | null
  netProfit: number
  totalStake: number
}

export interface SourcePerf {
  source: string
  total: number
  won: number
  lost: number
  winRate: number | null
  roi: number | null
  netProfit: number
}

export interface AIPerf {
  total: number
  won: number
  lost: number
  winRate: number | null
  roi: number | null
  netProfit: number
}

export function calcPerformance(
  bets: Bet[],
  decisions: Array<{ final_action: string }>,
): PerformanceMetrics {
  const won    = bets.filter(b => b.status === 'won')
  const lost   = bets.filter(b => b.status === 'lost')
  const voided = bets.filter(b => b.status === 'void')
  const pending = bets.filter(b => b.status === 'pending')

  // Void excluded from ROI and Win Rate per sprint spec
  const roiEligible = [...won, ...lost]
  const settled     = [...won, ...lost, ...voided]

  const netProfit    = settled.reduce((s, b) => s + (b.pnl ?? 0), 0)
  const roiStake     = roiEligible.reduce((s, b) => s + b.stake, 0)
  const roi          = roiStake > 0 ? (netProfit / roiStake) * 100 : null
  const winLost      = won.length + lost.length
  const winRate      = winLost > 0 ? (won.length / winLost) * 100 : null
  const pendingStake = pending.reduce((s, b) => s + b.stake, 0)

  const oddsPool = roiEligible.filter(b => b.total_odds != null)
  const avgOdds  = oddsPool.length > 0
    ? oddsPool.reduce((s, b) => s + (b.total_odds ?? 0), 0) / oddsPool.length
    : null

  const decisionsByAction: Record<string, number> = {
    placed: 0, skipped: 0, watchlisted: 0, ignored: 0, pending: 0,
  }
  for (const d of decisions) {
    const a = d.final_action
    if (a in decisionsByAction) decisionsByAction[a]++
  }
  const conversionRate = decisions.length > 0
    ? (decisionsByAction.placed / decisions.length) * 100
    : null

  // Group by sport from first leg
  const sportMap = new Map<string, Bet[]>()
  for (const bet of bets) {
    const sport = bet.legs?.[0]?.sport ?? 'other'
    if (!sportMap.has(sport)) sportMap.set(sport, [])
    sportMap.get(sport)!.push(bet)
  }
  const bySport: SportPerf[] = Array.from(sportMap.entries())
    .map(([sport, sb]) => {
      const sw = sb.filter(b => b.status === 'won')
      const sl = sb.filter(b => b.status === 'lost')
      const sv = sb.filter(b => b.status === 'void')
      const sp = sb.filter(b => b.status === 'pending')
      const np = [...sw, ...sl, ...sv].reduce((s, b) => s + (b.pnl ?? 0), 0)
      const rs = [...sw, ...sl].reduce((s, b) => s + b.stake, 0)
      return {
        sport,
        total: sb.length,
        won: sw.length,
        lost: sl.length,
        void: sv.length,
        pending: sp.length,
        winRate: (sw.length + sl.length) > 0 ? (sw.length / (sw.length + sl.length)) * 100 : null,
        roi: rs > 0 ? (np / rs) * 100 : null,
        netProfit: np,
        totalStake: sb.reduce((s, b) => s + b.stake, 0),
      }
    })
    .sort((a, b) => b.total - a.total)

  // Group by bet source
  const sourceMap = new Map<string, Bet[]>()
  for (const bet of bets) {
    const src = bet.source || 'manual'
    if (!sourceMap.has(src)) sourceMap.set(src, [])
    sourceMap.get(src)!.push(bet)
  }
  const bySource: SourcePerf[] = Array.from(sourceMap.entries())
    .map(([source, sb]) => {
      const sw = sb.filter(b => b.status === 'won')
      const sl = sb.filter(b => b.status === 'lost')
      const sv = sb.filter(b => b.status === 'void')
      const np = [...sw, ...sl, ...sv].reduce((s, b) => s + (b.pnl ?? 0), 0)
      const rs = [...sw, ...sl].reduce((s, b) => s + b.stake, 0)
      return {
        source,
        total: sb.length,
        won: sw.length,
        lost: sl.length,
        winRate: (sw.length + sl.length) > 0 ? (sw.length / (sw.length + sl.length)) * 100 : null,
        roi: rs > 0 ? (np / rs) * 100 : null,
        netProfit: np,
      }
    })
    .sort((a, b) => b.total - a.total)

  // AI Analyst = bets with source 'ai_analyst'
  const aiBets = bets.filter(b => b.source === 'ai_analyst')
  const aiW    = aiBets.filter(b => b.status === 'won')
  const aiL    = aiBets.filter(b => b.status === 'lost')
  const aiV    = aiBets.filter(b => b.status === 'void')
  const aiNP   = [...aiW, ...aiL, ...aiV].reduce((s, b) => s + (b.pnl ?? 0), 0)
  const aiRS   = [...aiW, ...aiL].reduce((s, b) => s + b.stake, 0)
  const aiAnalyst: AIPerf = {
    total: aiBets.length,
    won: aiW.length,
    lost: aiL.length,
    winRate: (aiW.length + aiL.length) > 0 ? (aiW.length / (aiW.length + aiL.length)) * 100 : null,
    roi: aiRS > 0 ? (aiNP / aiRS) * 100 : null,
    netProfit: aiNP,
  }

  return {
    netProfit,
    roi,
    winRate,
    settledCount: settled.length,
    pendingStake,
    totalDecisions: decisions.length,
    conversionRate,
    avgOdds,
    wonCount: won.length,
    lostCount: lost.length,
    voidCount: voided.length,
    pendingCount: pending.length,
    decisionsByAction,
    bySport,
    bySource,
    aiAnalyst,
  }
}
