import type { Bet } from '@/types'
import { calcSettlementMetrics } from '@/lib/bets/settlement-metrics'

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
  // Canonical settlement metrics (Decision #058): won/lost/void are the
  // supported settled outcomes, void is excluded from Win Rate and ROI,
  // and push/cashed_out/partial/unknown enter no financial metric.
  const m = calcSettlementMetrics(bets)

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
      const sm = calcSettlementMetrics(sb)
      return {
        sport,
        total: sb.length,
        won: sm.wonCount,
        lost: sm.lostCount,
        void: sm.voidCount,
        pending: sm.pendingCount,
        winRate: sm.winRate,
        roi: sm.roi,
        netProfit: sm.netProfit,
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
      const sm = calcSettlementMetrics(sb)
      return {
        source,
        total: sb.length,
        won: sm.wonCount,
        lost: sm.lostCount,
        winRate: sm.winRate,
        roi: sm.roi,
        netProfit: sm.netProfit,
      }
    })
    .sort((a, b) => b.total - a.total)

  // AI Analyst = bets with source 'ai_analyst'
  const aiBets = bets.filter(b => b.source === 'ai_analyst')
  const am = calcSettlementMetrics(aiBets)
  const aiAnalyst: AIPerf = {
    total: aiBets.length,
    won: am.wonCount,
    lost: am.lostCount,
    winRate: am.winRate,
    roi: am.roi,
    netProfit: am.netProfit,
  }

  return {
    netProfit: m.netProfit,
    roi: m.roi,
    winRate: m.winRate,
    settledCount: m.settledCount,
    pendingStake: m.pendingStake,
    totalDecisions: decisions.length,
    conversionRate,
    avgOdds: m.avgOdds,
    wonCount: m.wonCount,
    lostCount: m.lostCount,
    voidCount: m.voidCount,
    pendingCount: m.pendingCount,
    decisionsByAction,
    bySport,
    bySource,
    aiAnalyst,
  }
}
