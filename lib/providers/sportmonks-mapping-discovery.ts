import { createAdminClient } from '../supabase/admin'
import { ProviderError, redactUrl, sanitizeProviderError } from './errors'
import { getProviderEnv } from '../env'
import { providerFetch } from './http'

// M1.2.e.2.b.2 read-only SportMonks mapping discovery (Decision #043).
// Finds the SportMonks fixture ID for canonical fixtures WITHOUT knowing that
// ID, using fixtures-by-date + a server-side league filter. Hard guardrails
// (Decisions #037/#040):
//   - max 2 provider requests per run, page 1 only, per_page=50
//   - stop and mark AMBIGUOUS if pagination.has_more === true (v3 has no
//     `total` field — has_more is the only multi-page signal)
//   - token travels in the Authorization header, never in the URL
//   - timezone parameter deliberately OMITTED so the date bucket stays UTC
//   - ZERO writes — provider-link writes are a later, separately approved step

export const SPORTMONKS_MAPPING_DISCOVERY_CONFIRMATION = 'RUN_SPORTMONKS_MAPPING_DISCOVERY_M1_2_E_2_B_2'
export const SPORTMONKS_MAPPING_DISCOVERY_MAX_PROVIDER_REQUESTS = 2
export const SPORTMONKS_MAPPING_DISCOVERY_CONFIRMATION_ERROR =
  'sportmonks mapping discovery requires the exact approved scope and operator confirmation'

const SPORTMONKS_BASE_URL = 'https://api.sportmonks.com/v3/football'
const PER_PAGE = 50

export type MappingDiscoveryConfidence = 'exact' | 'high' | 'medium' | 'needs_review'
export type MappingDiscoveryStatus =
  | 'matched'
  | 'not_found'
  | 'ambiguous'
  | 'target_invalid'
  | 'failed'

export interface DiscoveryTarget {
  canonicalFixtureId: string
  sport: string
  status: string
  kickoffAt: string // timestamptz from canonical_fixtures
  competitionName: string
  competitionCountry: string | null
  season: string | null
  homeTeamName: string | null // from api_football raw payload
  awayTeamName: string | null
}

interface SportMonksParticipant {
  id?: number | string
  name?: string | null
  meta?: { location?: string | null } | null
}

interface SportMonksFixture {
  id?: number | string
  name?: string | null
  league_id?: number | string
  season_id?: number | string
  state_id?: number | string
  starting_at?: string | null
  starting_at_timestamp?: number | null
  participants?: SportMonksParticipant[]
  league?: { id?: number | string; name?: string | null } | null
  state?: { id?: number | string; state?: string | null } | null
}

interface SportMonksEnvelope {
  data?: unknown
  pagination?: { count?: number; per_page?: number; current_page?: number; has_more?: boolean } | null
  rate_limit?: { resets_in_seconds?: number; remaining?: number; requested_entity?: string } | null
}

export interface MappingCandidateSummary {
  sportmonksFixtureId: string
  sportmonksName: string | null
  startingAt: string | null
  leagueId: string | null
  seasonId: string | null
  stateId: string | null
  homeParticipant: string | null
  awayParticipant: string | null
}

export interface MappingDiscoveryTargetReport {
  canonicalFixtureId: string
  matchInput: {
    kickoffAtUtc: string | null
    homeTeamName: string | null
    awayTeamName: string | null
    competitionName: string
  }
  status: MappingDiscoveryStatus
  confidence: MappingDiscoveryConfidence | null
  eligibleForProviderLink: boolean
  candidatesAtKickoff: number
  candidate: MappingCandidateSummary | null
  reasons: string[]
}

export interface MappingDiscoveryReport {
  provider: 'sportmonks'
  discoveryRunId: string
  sportmonksLeagueId: string
  maxProviderRequests: number
  providerRequestsUsed: number
  pagination: Array<{ requestDate: string; count: number | null; hasMore: boolean | null }>
  rateLimit: { remaining: number | null; resetsInSeconds: number | null; requestedEntity: string | null }
  targets: MappingDiscoveryTargetReport[]
  stopReasons: string[]
  writes: 'none'
}

// --- pure matching helpers (exported for the safety test harness) ---

const NAME_SUFFIX_TOKENS = new Set(['fc', 'afc', 'cf', 'sc'])

export function normalizeTeamName(raw: string | null | undefined): string {
  if (!raw) return ''
  const base = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const tokens = base.split(' ').filter((token) => token && !NAME_SUFFIX_TOKENS.has(token))
  return tokens.join(' ')
}

function namesExactMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeTeamName(a)
  const right = normalizeTeamName(b)
  return left.length > 0 && left === right
}

function namesFuzzyMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeTeamName(a)
  const right = normalizeTeamName(b)
  if (!left || !right) return false
  if (left === right) return true
  if (left.length >= 4 && right.includes(left)) return true
  if (right.length >= 4 && left.includes(right)) return true
  return false
}

export function kickoffMinuteUtc(value: string | null | undefined): string | null {
  if (!value) return null
  // Accepts both timestamptz ('2026-08-15T12:30:00+00:00') and SportMonks
  // UTC datetimes ('2026-08-15 12:30:00').
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 16)
}

function toIdString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function participantByLocation(fixture: SportMonksFixture, location: 'home' | 'away'): SportMonksParticipant | null {
  const participants = Array.isArray(fixture.participants) ? fixture.participants : []
  return participants.find((p) => p?.meta?.location === location) ?? null
}

export function classifyCandidate(
  target: Pick<DiscoveryTarget, 'homeTeamName' | 'awayTeamName'>,
  fixture: SportMonksFixture
): { confidence: MappingDiscoveryConfidence; reasons: string[] } {
  const home = participantByLocation(fixture, 'home')
  const away = participantByLocation(fixture, 'away')
  const reasons: string[] = []

  const homeExact = namesExactMatch(target.homeTeamName, home?.name)
  const awayExact = namesExactMatch(target.awayTeamName, away?.name)
  const homeFuzzy = namesFuzzyMatch(target.homeTeamName, home?.name)
  const awayFuzzy = namesFuzzyMatch(target.awayTeamName, away?.name)
  const swappedFuzzy =
    namesFuzzyMatch(target.homeTeamName, away?.name) && namesFuzzyMatch(target.awayTeamName, home?.name)

  if (homeExact && awayExact) {
    reasons.push('kickoff minute match + both team names exact + home/away orientation confirmed')
    return { confidence: 'exact', reasons }
  }
  if (homeFuzzy && awayFuzzy) {
    reasons.push('kickoff minute match + both team names fuzzy-matched + home/away orientation confirmed')
    return { confidence: 'high', reasons }
  }
  if (swappedFuzzy) {
    reasons.push('team names match but home/away orientation is swapped')
    return { confidence: 'needs_review', reasons }
  }
  if (homeFuzzy || awayFuzzy) {
    reasons.push('only one team name matched at kickoff')
    return { confidence: 'medium', reasons }
  }
  reasons.push('kickoff matched but neither team name matched')
  return { confidence: 'needs_review', reasons }
}

export function matchTargetAgainstFixtures(
  target: DiscoveryTarget,
  fixtures: SportMonksFixture[]
): Omit<MappingDiscoveryTargetReport, 'canonicalFixtureId' | 'matchInput'> {
  const targetKickoff = kickoffMinuteUtc(target.kickoffAt)
  if (!targetKickoff) {
    return {
      status: 'target_invalid',
      confidence: null,
      eligibleForProviderLink: false,
      candidatesAtKickoff: 0,
      candidate: null,
      reasons: ['canonical fixture has no parseable kickoff_at'],
    }
  }

  const atKickoff = fixtures.filter((fixture) => kickoffMinuteUtc(fixture.starting_at) === targetKickoff)
  if (atKickoff.length === 0) {
    return {
      status: 'not_found',
      confidence: null,
      eligibleForProviderLink: false,
      candidatesAtKickoff: 0,
      candidate: null,
      reasons: ['no fixture in the league response shares the canonical kickoff minute (UTC)'],
    }
  }

  const classified = atKickoff.map((fixture) => ({ fixture, ...classifyCandidate(target, fixture) }))
  const strong = classified.filter((entry) => entry.confidence === 'exact' || entry.confidence === 'high')

  if (strong.length > 1) {
    return {
      status: 'ambiguous',
      confidence: null,
      eligibleForProviderLink: false,
      candidatesAtKickoff: atKickoff.length,
      candidate: null,
      reasons: [`${strong.length} candidates matched at exact/high confidence — zero writes, mapping blocked`],
    }
  }

  const best =
    strong[0] ??
    classified.sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence))[0]

  const candidate = summarizeCandidate(best.fixture)
  const eligible = strong.length === 1 && candidate !== null

  return {
    status: 'matched',
    confidence: best.confidence,
    eligibleForProviderLink: eligible,
    candidatesAtKickoff: atKickoff.length,
    candidate,
    reasons: best.reasons,
  }
}

function confidenceRank(confidence: MappingDiscoveryConfidence): number {
  if (confidence === 'exact') return 4
  if (confidence === 'high') return 3
  if (confidence === 'medium') return 2
  return 1
}

function summarizeCandidate(fixture: SportMonksFixture): MappingCandidateSummary | null {
  const id = toIdString(fixture.id)
  if (!id) return null
  return {
    sportmonksFixtureId: id,
    sportmonksName: fixture.name ?? null,
    startingAt: fixture.starting_at ?? null,
    leagueId: toIdString(fixture.league_id ?? fixture.league?.id),
    seasonId: toIdString(fixture.season_id),
    stateId: toIdString(fixture.state_id ?? fixture.state?.id),
    homeParticipant: participantByLocation(fixture, 'home')?.name ?? null,
    awayParticipant: participantByLocation(fixture, 'away')?.name ?? null,
  }
}

// --- target loading (service-role read; zero writes) ---

export async function loadDiscoveryTargets(canonicalFixtureIds: string[]): Promise<DiscoveryTarget[]> {
  const supabase = createAdminClient()

  const { data: fixtures, error: fixturesError } = await supabase
    .from('canonical_fixtures')
    .select('id, sport, status, kickoff_at, competition_name, competition_country, season')
    .in('id', canonicalFixtureIds)

  if (fixturesError) throw new Error(`canonical fixture load failed: ${fixturesError.message}`)

  const { data: links, error: linksError } = await supabase
    .from('fixture_provider_links')
    .select('canonical_fixture_id, raw_provider_payload')
    .eq('provider', 'api_football')
    .in('canonical_fixture_id', canonicalFixtureIds)

  if (linksError) throw new Error(`provider link load failed: ${linksError.message}`)

  return (fixtures ?? []).map((row) => {
    const link = (links ?? []).find((l) => l.canonical_fixture_id === row.id)
    const payload = (link?.raw_provider_payload ?? null) as {
      teams?: { home?: { name?: string | null } | null; away?: { name?: string | null } | null } | null
    } | null

    return {
      canonicalFixtureId: row.id,
      sport: row.sport,
      status: row.status,
      kickoffAt: row.kickoff_at,
      competitionName: row.competition_name,
      competitionCountry: row.competition_country ?? null,
      season: row.season ?? null,
      homeTeamName: payload?.teams?.home?.name ?? null,
      awayTeamName: payload?.teams?.away?.name ?? null,
    }
  })
}

// --- discovery run (read-only; max 2 provider requests) ---

function nextDiscoveryRunId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const random = Math.random().toString(36).slice(2, 10)
  return `sportmonks-mapping-discovery-${stamp}-${random}`
}

function kickoffDateUtc(kickoffAt: string): string | null {
  const minute = kickoffMinuteUtc(kickoffAt)
  return minute ? minute.slice(0, 10) : null
}

export async function runSportMonksMappingDiscovery(params: {
  canonicalFixtureIds: string[]
  sportmonksLeagueId: string
}): Promise<MappingDiscoveryReport> {
  const { SPORTMONKS_TOKEN } = getProviderEnv()
  const report: MappingDiscoveryReport = {
    provider: 'sportmonks',
    discoveryRunId: nextDiscoveryRunId(),
    sportmonksLeagueId: params.sportmonksLeagueId,
    maxProviderRequests: SPORTMONKS_MAPPING_DISCOVERY_MAX_PROVIDER_REQUESTS,
    providerRequestsUsed: 0,
    pagination: [],
    rateLimit: { remaining: null, resetsInSeconds: null, requestedEntity: null },
    targets: [],
    stopReasons: [],
    writes: 'none',
  }

  const targets = await loadDiscoveryTargets(params.canonicalFixtureIds)

  for (const requestedId of params.canonicalFixtureIds) {
    if (!targets.some((t) => t.canonicalFixtureId === requestedId)) {
      report.targets.push({
        canonicalFixtureId: requestedId,
        matchInput: { kickoffAtUtc: null, homeTeamName: null, awayTeamName: null, competitionName: 'unknown' },
        status: 'target_invalid',
        confidence: null,
        eligibleForProviderLink: false,
        candidatesAtKickoff: 0,
        candidate: null,
        reasons: ['canonical fixture not found'],
      })
    }
  }

  const validTargets: DiscoveryTarget[] = []
  for (const target of targets) {
    const problems: string[] = []
    if (target.sport !== 'football') problems.push(`sport is ${target.sport}, expected football`)
    if (target.status !== 'scheduled') problems.push(`status is ${target.status}, expected scheduled`)
    if (!kickoffDateUtc(target.kickoffAt)) problems.push('kickoff_at is missing or unparseable')
    if (!target.homeTeamName || !target.awayTeamName) problems.push('team names unavailable in provider payload')

    if (problems.length) {
      report.targets.push({
        canonicalFixtureId: target.canonicalFixtureId,
        matchInput: {
          kickoffAtUtc: kickoffMinuteUtc(target.kickoffAt),
          homeTeamName: target.homeTeamName,
          awayTeamName: target.awayTeamName,
          competitionName: target.competitionName,
        },
        status: 'target_invalid',
        confidence: null,
        eligibleForProviderLink: false,
        candidatesAtKickoff: 0,
        candidate: null,
        reasons: problems,
      })
      continue
    }
    validTargets.push(target)
  }

  // One request per distinct UTC kickoff date; both targets on the same
  // matchday share a single request.
  const dates = [...new Set(validTargets.map((t) => kickoffDateUtc(t.kickoffAt) as string))]
  if (dates.length > SPORTMONKS_MAPPING_DISCOVERY_MAX_PROVIDER_REQUESTS) {
    report.stopReasons.push(
      `targets span ${dates.length} dates — exceeds the max of ${SPORTMONKS_MAPPING_DISCOVERY_MAX_PROVIDER_REQUESTS} provider requests`
    )
    return report
  }

  const fixturesByDate = new Map<string, SportMonksFixture[]>()

  for (const date of dates) {
    const url = new URL(`${SPORTMONKS_BASE_URL}/fixtures/date/${date}`)
    url.searchParams.set('include', 'participants;league;state')
    url.searchParams.set('filters', `fixtureLeagues:${params.sportmonksLeagueId}`)
    url.searchParams.set('per_page', String(PER_PAGE))
    // NOTE: no `timezone` parameter — the date bucket must stay UTC, and the
    // token travels in the Authorization header, never in the URL.

    report.providerRequestsUsed++
    const body = await providerFetch<SportMonksEnvelope>('sportmonks', url.toString(), {
      headers: { Authorization: SPORTMONKS_TOKEN },
    })

    const pagination = body.pagination ?? null
    report.pagination.push({
      requestDate: date,
      count: typeof pagination?.count === 'number' ? pagination.count : null,
      hasMore: typeof pagination?.has_more === 'boolean' ? pagination.has_more : null,
    })
    if (body.rate_limit) {
      report.rateLimit = {
        remaining: body.rate_limit.remaining ?? null,
        resetsInSeconds: body.rate_limit.resets_in_seconds ?? null,
        requestedEntity: body.rate_limit.requested_entity ?? null,
      }
    }

    if (!Array.isArray(body.data)) {
      throw sanitizeProviderError('sportmonks', 'invalid_response', undefined, url.toString())
    }

    if (pagination?.has_more === true) {
      // v3 has no total field; has_more=true on page 1 means the league-day
      // result set exceeds per_page=50. No page 2 is approved — stop.
      report.stopReasons.push(
        `pagination has_more=true for ${date} — result set exceeds page 1, no page 2 approved: ${redactUrl(url.toString())}`
      )
      fixturesByDate.set(date, [])
      continue
    }

    fixturesByDate.set(date, body.data as SportMonksFixture[])
  }

  for (const target of validTargets) {
    const date = kickoffDateUtc(target.kickoffAt) as string
    const dayHadOverflow = report.stopReasons.some((reason) => reason.includes(`has_more=true for ${date}`))
    const fixtures = fixturesByDate.get(date) ?? []

    if (dayHadOverflow) {
      report.targets.push({
        canonicalFixtureId: target.canonicalFixtureId,
        matchInput: {
          kickoffAtUtc: kickoffMinuteUtc(target.kickoffAt),
          homeTeamName: target.homeTeamName,
          awayTeamName: target.awayTeamName,
          competitionName: target.competitionName,
        },
        status: 'ambiguous',
        confidence: null,
        eligibleForProviderLink: false,
        candidatesAtKickoff: 0,
        candidate: null,
        reasons: ['pagination overflow on the discovery date — result incomplete, mapping blocked'],
      })
      continue
    }

    const outcome = matchTargetAgainstFixtures(target, fixtures)
    report.targets.push({
      canonicalFixtureId: target.canonicalFixtureId,
      matchInput: {
        kickoffAtUtc: kickoffMinuteUtc(target.kickoffAt),
        homeTeamName: target.homeTeamName,
        awayTeamName: target.awayTeamName,
        competitionName: target.competitionName,
      },
      ...outcome,
    })
  }

  return report
}

export { ProviderError }
