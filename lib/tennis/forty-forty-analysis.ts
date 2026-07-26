import { getProviderEnv } from '../env'
import { sanitizeProviderError } from '../providers/errors'
import { providerFetch } from '../providers/http'

const API_TENNIS_URL = 'https://api.api-tennis.com/tennis/'
const API_TENNIS_KEY_PARAM = ['API', 'key'].join('')
const WINDOW_MS = 24 * 60 * 60 * 1000

type Tour = 'ATP' | 'WTA'

interface ApiTennisEnvelope {
  error?: number | string
  result?: unknown[]
  success?: number | string
}

interface PointScore {
  score?: unknown
}

interface PointByPointGame {
  points?: unknown
}

interface SetScore {
  score_first?: unknown
  score_second?: unknown
}

export interface FortyFortyMatch {
  tour: Tour
  tournament: string
  players: string
  startedAt: string
  games: number
  hits: number
}

export interface FortyFortyAggregate {
  matches: number
  matchesWithHit: number
  games: number
  hits: number
  gameRatePct: number | null
  matchRatePct: number | null
  averageHitsPerMatch: number | null
}

export interface FortyFortyAnalysis {
  generatedAt: string
  window: {
    from: string
    to: string
    basis: 'scheduled_start_utc'
  }
  scope: {
    tours: 'Men/Women Singles'
    mainDrawOnly: false
    excludes: string[]
  }
  foundMatches: number
  analyzedMatches: number
  skippedMatches: number
  men: FortyFortyAggregate
  women: FortyFortyAggregate
  total: FortyFortyAggregate
  comparison: {
    leader: Tour | 'equal' | 'insufficient_data'
    differencePercentagePoints: number | null
  }
  matches: FortyFortyMatch[]
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function numberValue(value: unknown): number | null {
  const normalized = stringValue(value)
  if (!normalized || !/^\d+$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function isTrue(value: unknown): boolean {
  if (value === true || value === 1) return true
  const normalized = stringValue(value)?.toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function tourFromType(value: unknown): Tour | null {
  const normalized = stringValue(value)?.toLowerCase()
  if (!normalized || !normalized.includes('singles')) return null
  if (
    normalized.includes('doubles')
    || normalized.includes('mixed')
    || normalized.includes('exhibition')
    || normalized.includes('boys')
    || normalized.includes('girls')
    || normalized.includes('junior')
  ) {
    return null
  }
  if (normalized.includes('wta') || normalized.includes('women')) return 'WTA'
  if (normalized.includes('atp') || normalized.includes('men') || normalized.includes('challenger')) {
    return 'ATP'
  }
  return null
}

function scheduledStart(row: Record<string, unknown>): Date | null {
  const date = stringValue(row.event_date)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null

  const rawTime = stringValue(row.event_time) ?? '00:00'
  const time = /^\d{2}:\d{2}$/.test(rawTime) ? `${rawTime}:00` : rawTime
  if (!/^\d{2}:\d{2}:\d{2}$/.test(time)) return null

  const parsed = new Date(`${date}T${time}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

type GameKind = 'regular' | 'tiebreak' | 'unknown'

const REGULAR_POINT = /^(0|15|30|40|A|AD|ADV)$/i
const POINT_SCORE = /^\s*([A-Z]+|\d+)\s*(?:-|–|—|:)\s*([A-Z]+|\d+)\s*$/i

function pointPair(value: unknown): [string, string] | null {
  const score = stringValue(value)
  if (!score) return null
  const match = POINT_SCORE.exec(score)
  return match ? [match[1].toUpperCase(), match[2].toUpperCase()] : null
}

function gameKind(value: unknown): { kind: GameKind; hit: boolean } {
  if (typeof value !== 'object' || value === null) return { kind: 'unknown', hit: false }
  const points = (value as PointByPointGame).points
  if (!Array.isArray(points) || points.length === 0) return { kind: 'unknown', hit: false }

  const pairs = points.map(point => {
    if (typeof point !== 'object' || point === null) return null
    return pointPair((point as PointScore).score)
  })
  if (pairs.some(pair => pair === null)) return { kind: 'unknown', hit: false }

  const completePairs = pairs as Array<[string, string]>
  const regular = completePairs.every(([left, right]) => (
    REGULAR_POINT.test(left) && REGULAR_POINT.test(right)
  ))
  if (regular) {
    return {
      kind: 'regular',
      hit: completePairs.some(([left, right]) => left === '40' && right === '40'),
    }
  }

  const numeric = completePairs.every(([left, right]) => /^\d+$/.test(left) && /^\d+$/.test(right))
  return { kind: numeric ? 'tiebreak' : 'unknown', hit: false }
}

function scoreCoverage(value: unknown): {
  expectedPointByPointGames: number
  expectedRegularGames: number
} | null {
  if (!Array.isArray(value) || value.length === 0) return null

  let expectedPointByPointGames = 0
  let expectedRegularGames = 0

  for (const rawScore of value) {
    if (typeof rawScore !== 'object' || rawScore === null) return null
    const score = rawScore as SetScore
    const first = numberValue(score.score_first)
    const second = numberValue(score.score_second)
    if (first === null || second === null) return null

    const high = Math.max(first, second)
    const low = Math.min(first, second)
    const matchTiebreak = high >= 10 && high - low >= 2
    if (matchTiebreak) {
      expectedPointByPointGames += 1
      continue
    }

    const setGames = first + second
    if (setGames < 6 || setGames > 13) return null
    const hasSetTiebreak = high === 7 && low === 6

    expectedPointByPointGames += setGames
    expectedRegularGames += setGames - (hasSetTiebreak ? 1 : 0)
  }

  return expectedPointByPointGames > 0 && expectedRegularGames > 0
    ? { expectedPointByPointGames, expectedRegularGames }
    : null
}

function analyzeMatch(row: Record<string, unknown>, tour: Tour, startedAt: Date): FortyFortyMatch | null {
  const coverage = scoreCoverage(row.scores)
  if (!coverage || !Array.isArray(row.pointbypoint)) return null
  if (row.pointbypoint.length !== coverage.expectedPointByPointGames) return null

  let games = 0
  let hits = 0
  for (const pointByPointGame of row.pointbypoint) {
    const result = gameKind(pointByPointGame)
    if (result.kind === 'unknown') return null
    if (result.kind === 'regular') {
      games += 1
      if (result.hit) hits += 1
    }
  }
  if (games !== coverage.expectedRegularGames) return null

  const firstPlayer = stringValue(row.event_first_player) ?? 'Игрок 1'
  const secondPlayer = stringValue(row.event_second_player) ?? 'Игрок 2'

  return {
    tour,
    tournament: stringValue(row.tournament_name) ?? `${tour} Singles`,
    players: `${firstPlayer} — ${secondPlayer}`,
    startedAt: startedAt.toISOString(),
    games,
    hits,
  }
}

function rounded(value: number, digits = 2): number {
  const multiplier = 10 ** digits
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier
}

function aggregate(matches: FortyFortyMatch[]): FortyFortyAggregate {
  const games = matches.reduce((sum, match) => sum + match.games, 0)
  const hits = matches.reduce((sum, match) => sum + match.hits, 0)
  const matchesWithHit = matches.filter(match => match.hits > 0).length

  return {
    matches: matches.length,
    matchesWithHit,
    games,
    hits,
    gameRatePct: games > 0 ? rounded((hits / games) * 100) : null,
    matchRatePct: matches.length > 0 ? rounded((matchesWithHit / matches.length) * 100) : null,
    averageHitsPerMatch: matches.length > 0 ? rounded(hits / matches.length) : null,
  }
}

export function analyzeFortyFortyFixtures(
  fixtures: unknown[],
  now = new Date(),
): FortyFortyAnalysis {
  if (Number.isNaN(now.getTime())) throw new Error('invalid_analysis_time')

  const from = new Date(now.getTime() - WINDOW_MS)
  const uniqueRows = new Map<string, Record<string, unknown>>()

  for (const fixture of fixtures) {
    if (typeof fixture !== 'object' || fixture === null) continue
    const row = fixture as Record<string, unknown>
    const key = stringValue(row.event_key)
      ?? [
        stringValue(row.event_date),
        stringValue(row.event_time),
        stringValue(row.event_first_player),
        stringValue(row.event_second_player),
      ].join('|')
    if (!uniqueRows.has(key)) uniqueRows.set(key, row)
  }

  const eligible: Array<{
    row: Record<string, unknown>
    tour: Tour
    startedAt: Date
  }> = []

  for (const row of uniqueRows.values()) {
    const tour = tourFromType(row.event_type_type)
    const startedAt = scheduledStart(row)
    const finished = stringValue(row.event_status)?.toLowerCase().includes('finished') ?? false

    if (
      !tour
      || !startedAt
      || !finished
      || isTrue(row.event_qualification)
      || startedAt < from
      || startedAt > now
    ) {
      continue
    }
    eligible.push({ row, tour, startedAt })
  }

  const matches = eligible
    .map(({ row, tour, startedAt }) => analyzeMatch(row, tour, startedAt))
    .filter((match): match is FortyFortyMatch => match !== null)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))

  const men = aggregate(matches.filter(match => match.tour === 'ATP'))
  const women = aggregate(matches.filter(match => match.tour === 'WTA'))
  const total = aggregate(matches)

  let leader: FortyFortyAnalysis['comparison']['leader'] = 'insufficient_data'
  let differencePercentagePoints: number | null = null
  if (men.gameRatePct !== null && women.gameRatePct !== null) {
    differencePercentagePoints = rounded(Math.abs(men.gameRatePct - women.gameRatePct))
    leader = men.gameRatePct === women.gameRatePct
      ? 'equal'
      : men.gameRatePct > women.gameRatePct
        ? 'ATP'
        : 'WTA'
  }

  return {
    generatedAt: now.toISOString(),
    window: {
      from: from.toISOString(),
      to: now.toISOString(),
      basis: 'scheduled_start_utc',
    },
    scope: {
      tours: 'Men/Women Singles',
      mainDrawOnly: false,
      excludes: ['qualification', 'doubles', 'mixed', 'junior', 'exhibition', 'tiebreaks'],
    },
    foundMatches: eligible.length,
    analyzedMatches: matches.length,
    skippedMatches: eligible.length - matches.length,
    men,
    women,
    total,
    comparison: { leader, differencePercentagePoints },
    matches,
  }
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function hasProviderError(body: ApiTennisEnvelope): boolean {
  const error = stringValue(body.error)
  return Boolean(error && error !== '0')
}

async function fetchFixturesByDate(
  dateFrom: string,
  dateTo: string,
): Promise<unknown[]> {
  const { API_TENNIS_KEY } = getProviderEnv()
  const url = new URL(API_TENNIS_URL)
  url.searchParams.set('method', 'get_fixtures')
  url.searchParams.set(API_TENNIS_KEY_PARAM, API_TENNIS_KEY)
  url.searchParams.set('date_start', dateFrom)
  url.searchParams.set('date_stop', dateTo)
  url.searchParams.set('timezone', 'UTC')

  const body = await providerFetch<ApiTennisEnvelope>('api_tennis', url.toString(), {
    cache: 'no-store',
    timeoutMs: 12_000,
  })
  if (hasProviderError(body) || !Array.isArray(body.result)) {
    throw sanitizeProviderError('api_tennis', 'invalid_response', undefined, url.toString())
  }
  return body.result
}

export async function fetchLast24HoursFortyForty(
  now = new Date(),
): Promise<FortyFortyAnalysis> {
  const from = new Date(now.getTime() - WINDOW_MS)
  const fixtures = await fetchFixturesByDate(utcDate(from), utcDate(now))
  return analyzeFortyFortyFixtures(fixtures, now)
}
