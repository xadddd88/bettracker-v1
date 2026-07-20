export type AutomaticLegGrade = 'won' | 'lost' | 'void' | 'pending' | 'needs_review'

export interface FootballScorePair {
  home: number | null
  away: number | null
}

export interface FootballResultSnapshot {
  status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled' | 'abandoned' | 'walkover'
  fulltime: FootballScorePair
  halftime: FootballScorePair
}

export interface FootballTrackedLeg {
  eventName: string
  marketType: string
  selection: string | null
}

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
  const direction = /(over|больше|більше|тотал больше|тотал більше)/i.test(value)
    ? 'over'
    : /(under|меньше|менше|тотал меньше|тотал менше)/i.test(value)
      ? 'under'
      : null
  const match = value.match(/(\d+(?:\.\d+)?)/)
  if (!direction || !match) return null
  const line = Number(match[1])
  if (!Number.isFinite(line) || line < 0 || Number.isInteger(line)) return null
  return { direction, line }
}

function scoreReady(score: FootballScorePair): score is { home: number; away: number } {
  return Number.isInteger(score.home) && Number.isInteger(score.away)
}

export function gradeFootballLeg(
  leg: FootballTrackedLeg,
  result: FootballResultSnapshot
): AutomaticLegGrade {
  if (result.status === 'cancelled') return 'void'
  if (result.status === 'postponed' || result.status === 'abandoned' || result.status === 'walkover') {
    return 'needs_review'
  }
  if (result.status !== 'finished') return 'pending'

  const market = normalized(leg.marketType)
  const isFirstHalf = /(first half|1st half|1[- ]?я половина|1[- ]?й тайм|1[- ]?й половин|перша половина)/i.test(market)
  const score = isFirstHalf ? result.halftime : result.fulltime
  if (!scoreReady(score)) return 'needs_review'

  if (/(1x2|match winner|результат матча|результат матчу)/i.test(market)) {
    const side = selectedSide(leg.eventName, leg.selection ?? '')
    if (!side) return 'needs_review'
    const actual = score.home === score.away ? 'draw' : score.home > score.away ? 'home' : 'away'
    return side === actual ? 'won' : 'lost'
  }

  if (/(total|тотал)/i.test(market)) {
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
