export type AutomaticLegGrade = 'won' | 'lost' | 'void' | 'pending' | 'needs_review'

export interface FootballScorePair {
  home: number | null
  away: number | null
}

export interface FootballResultSnapshot {
  status:
    | 'scheduled'
    | 'live'
    | 'finished'
    | 'postponed'
    | 'cancelled'
    | 'abandoned'
    | 'walkover'
    | 'unknown'
  fulltime: FootballScorePair
  halftime: FootballScorePair
}

export interface FootballTrackedLeg {
  eventName: string
  marketType: string
  selection: string | null
}

const FULL_TIME_1X2_MARKETS = new Set([
  '1x2',
  'match winner',
  'результат матча',
  'результат матчу',
])

const FIRST_HALF_1X2_MARKETS = new Set([
  'first half - 1x2',
  '1st half - 1x2',
  '1-я половина - 1x2',
  '1-й тайм - 1x2',
  'перша половина - 1x2',
])

const FULL_TIME_GOAL_TOTAL_MARKETS = new Set([
  'total',
  'match total',
  'full time total',
  'total goals',
  'тотал',
  'тотал матча',
  'тотал матчу',
  'общий тотал',
  'загальний тотал',
])

const FIRST_HALF_GOAL_TOTAL_MARKETS = new Set([
  'first half total',
  '1st half total',
  'first half goals total',
  '1-я половина - тотал',
  '1-й тайм - тотал',
  'тотал 1-го тайма',
  'перша половина - тотал',
  'тотал 1-го тайму',
])

function normalized(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ') ?? ''
}

function eventParticipants(eventName: string): [string, string] | null {
  const parts = eventName.split(/\s+(?:vs?\.?|[-–—])\s+/i).map((part) => normalized(part)).filter(Boolean)
  return parts.length === 2 ? [parts[0], parts[1]] : null
}

function selectedSide(eventName: string, selection: string): 'home' | 'away' | 'draw' | null {
  const value = normalized(selection)
  if (['draw', 'x', 'ничья', 'нічия'].includes(value)) return 'draw'
  const participants = eventParticipants(eventName)
  if (!participants) return null
  if (value === participants[0]) return 'home'
  if (value === participants[1]) return 'away'
  return null
}

function parseTotal(selection: string): { direction: 'over' | 'under'; line: number } | null {
  const value = normalized(selection).replace(',', '.')
  const match =
    /^(?:total\s+)?(over|under)\s*(\d+(?:\.\d+)?)$/i.exec(value) ??
    /^(?:тотал\s+)?(больше|меньше|більше|менше)\s*(\d+(?:\.\d+)?)$/i.exec(value)
  if (!match) return null

  const direction = /^(?:over|больше|більше)$/i.test(match[1]) ? 'over' : 'under'
  const line = Number(match[2])
  if (!Number.isFinite(line) || line < 0 || !Number.isInteger(line * 2) || Number.isInteger(line)) return null
  return { direction, line }
}

function scoreReady(score: FootballScorePair): score is { home: number; away: number } {
  return Number.isInteger(score.home) && Number.isInteger(score.away)
}

export function gradeFootballLeg(
  leg: FootballTrackedLeg,
  result: FootballResultSnapshot
): AutomaticLegGrade {
  if (
    result.status === 'postponed' ||
    result.status === 'cancelled' ||
    result.status === 'abandoned' ||
    result.status === 'walkover' ||
    result.status === 'unknown'
  ) {
    return 'needs_review'
  }
  if (result.status === 'scheduled' || result.status === 'live') return 'pending'
  if (result.status !== 'finished') return 'needs_review'

  const market = normalized(leg.marketType)
  if (FULL_TIME_1X2_MARKETS.has(market) || FIRST_HALF_1X2_MARKETS.has(market)) {
    const score = FIRST_HALF_1X2_MARKETS.has(market) ? result.halftime : result.fulltime
    if (!scoreReady(score)) return 'needs_review'
    const side = selectedSide(leg.eventName, leg.selection ?? '')
    if (!side) return 'needs_review'
    const actual = score.home === score.away ? 'draw' : score.home > score.away ? 'home' : 'away'
    return side === actual ? 'won' : 'lost'
  }

  if (FULL_TIME_GOAL_TOTAL_MARKETS.has(market) || FIRST_HALF_GOAL_TOTAL_MARKETS.has(market)) {
    const score = FIRST_HALF_GOAL_TOTAL_MARKETS.has(market) ? result.halftime : result.fulltime
    if (!scoreReady(score)) return 'needs_review'
    const total = parseTotal(leg.selection ?? '')
    if (!total) return 'needs_review'
    const goals = score.home + score.away
    return total.direction === 'over'
      ? goals > total.line ? 'won' : 'lost'
      : goals < total.line ? 'won' : 'lost'
  }

  return 'needs_review'
}

export function gradeExpress(grades: AutomaticLegGrade[]): AutomaticLegGrade {
  if (grades.length < 2) return 'needs_review'
  if (grades.includes('lost')) return 'lost'
  if (grades.includes('needs_review') || grades.includes('void')) return 'needs_review'
  if (grades.includes('pending')) return 'pending'
  return grades.every((grade) => grade === 'won') ? 'won' : 'needs_review'
}
