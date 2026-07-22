import type { Bet } from '@/types'
import { calcSettlementMetrics } from '@/lib/bets/settlement-metrics'

export interface PerformanceMetrics {
  netProfit: number
  roi: number | null
  winRate: number | null
  settledCount: number
  pendingStake: number
  unsupportedCount: number
  unknownCount: number
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
  void: number
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

const KNOWN_SPORTS = new Set(['basketball', 'cs2', 'ice_hockey', 'mma', 'other', 'soccer', 'tennis'])

function normalizedSport(sport: string | undefined): string {
  const normalized = sport?.trim().toLowerCase() ?? ''
  return KNOWN_SPORTS.has(normalized) ? normalized : 'other'
}

export function betSportBucket(bet: Pick<Bet, 'legs'>): string {
  const sports = (bet.legs ?? []).map((leg) => normalizedSport(leg.sport))
  if (sports.length === 0) return 'other'
  return new Set(sports).size === 1 ? sports[0]! : 'mixed'
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

  // A same-sport Express belongs to that sport; a cross-sport Express is Mixed.
  const sportMap = new Map<string, Bet[]>()
  for (const bet of bets) {
    const sport = betSportBucket(bet)
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
        void: sm.voidCount,
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
    unsupportedCount: m.unsupportedCount,
    unknownCount: m.unknownCount,
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
