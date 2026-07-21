import type {
  CanonicalFixtureDraft,
  FixtureSyncAdapter,
  FixtureStatus,
  OddsSyncAdapter,
  ProviderMeta,
  ResultSyncAdapter,
} from '../types'
import { ProviderError, redactUrl, sanitizeProviderError } from '../errors'
import { getProviderEnv } from '../../env'
import { providerFetch } from '../http'

const BASE_URL = 'https://v3.football.api-sports.io'
const DAY_MS = 24 * 60 * 60 * 1000

interface ApiFootballFixturesEnvelope {
  errors?: unknown
  response?: unknown[]
  paging?: { current?: number | string | null; total?: number | string | null } | null
}

interface ApiFootballFixtureRow {
  fixture?: {
    id?: number | string
    date?: string
    timezone?: string
    venue?: { name?: string | null; city?: string | null } | null
    status?: { short?: string | null; long?: string | null; elapsed?: number | null } | null
  }
  league?: {
    id?: number | string
    name?: string | null
    country?: string | null
    season?: number | string | null
    round?: string | null
  }
  teams?: {
    home?: { id?: number | string | null; name?: string | null } | null
    away?: { id?: number | string | null; name?: string | null } | null
  }
  goals?: { home?: number | null; away?: number | null } | null
  score?: {
    halftime?: { home?: number | null; away?: number | null } | null
    fulltime?: { home?: number | null; away?: number | null } | null
    extratime?: { home?: number | null; away?: number | null } | null
    penalty?: { home?: number | null; away?: number | null } | null
  } | null
}

function scaffoldOnly(method: string): never {
  throw new ProviderError(
    'api_football',
    'unknown',
    `ApiFootballAdapter.${method} is outside the currently approved adapter scope`
  )
}

function hasProviderErrors(errors: unknown): boolean {
  if (!errors) return false
  if (Array.isArray(errors)) return errors.length > 0
  if (typeof errors === 'object') return Object.keys(errors as Record<string, unknown>).length > 0
  if (typeof errors === 'string') return errors.trim().length > 0
  return true
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function mapFixtureStatus(shortStatus?: string | null, longStatus?: string | null): FixtureStatus {
  const short = shortStatus?.toUpperCase() ?? ''
  const long = longStatus?.toLowerCase() ?? ''

  if (['FT', 'AET', 'PEN'].includes(short) || long.includes('finished')) return 'finished'
  if (['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE'].includes(short) || long.includes('progress')) return 'live'
  if (['PST'].includes(short) || long.includes('postponed')) return 'postponed'
  if (['CANC', 'CND'].includes(short) || long.includes('cancel')) return 'cancelled'
  if (['ABD'].includes(short) || long.includes('abandon')) return 'abandoned'

  return 'scheduled'
}

function mapResultStatus(shortStatus?: string | null): FixtureStatus | null {
  const short = shortStatus?.trim().toUpperCase() ?? ''

  if (['TBD', 'NS'].includes(short)) return 'scheduled'
  if (['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(short)) return 'live'
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished'
  if (short === 'PST') return 'postponed'
  if (['CANC', 'CND'].includes(short)) return 'cancelled'
  if (short === 'ABD') return 'abandoned'
  if (['AWD', 'WO'].includes(short)) return 'walkover'

  return null
}

function teamRef(id: unknown, name: unknown): string | null {
  const idRef = toStringOrNull(id)
  if (idRef) return `api_football:team:${idRef}`
  return toStringOrNull(name)
}

function dateOnlyToUtcMs(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return Number.NaN

  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function datesInRange(dateFrom: string, dateTo: string): string[] {
  const start = dateOnlyToUtcMs(dateFrom)
  const end = dateOnlyToUtcMs(dateTo)

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return [dateFrom]
  }

  const dates: string[] = []
  for (let value = start; value <= end; value += DAY_MS) {
    dates.push(new Date(value).toISOString().slice(0, 10))
  }
  return dates
}

function parseApiFootballFixture(row: unknown): (ProviderMeta & { fixture: CanonicalFixtureDraft }) | null {
  const fixtureRow = row as ApiFootballFixtureRow
  const providerFixtureId = toStringOrNull(fixtureRow.fixture?.id)
  const kickoffAt = toStringOrNull(fixtureRow.fixture?.date)

  if (!providerFixtureId || !kickoffAt) return null

  const homeRef = teamRef(fixtureRow.teams?.home?.id, fixtureRow.teams?.home?.name)
  const awayRef = teamRef(fixtureRow.teams?.away?.id, fixtureRow.teams?.away?.name)
  const competitionName = toStringOrNull(fixtureRow.league?.name) ?? 'Unknown football competition'
  const competitionCountry = toStringOrNull(fixtureRow.league?.country)
  const season = toStringOrNull(fixtureRow.league?.season)
  const round = toStringOrNull(fixtureRow.league?.round)
  const venueName = toStringOrNull(fixtureRow.fixture?.venue?.name)
  const venueCity = toStringOrNull(fixtureRow.fixture?.venue?.city)

  return {
    providerFixtureId,
    rawProviderPayload: row,
    providerUpdatedAt: null,
    fixture: {
      sport: 'football',
      competitionName,
      competitionCountry,
      season,
      round,
      kickoffAt,
      status: mapFixtureStatus(fixtureRow.fixture?.status?.short, fixtureRow.fixture?.status?.long),
      homeRef,
      awayRef,
      participantARef: null,
      participantBRef: null,
      venue: venueName,
      metadata: {
        provider: 'api_football',
        providerFixtureId,
        leagueId: toStringOrNull(fixtureRow.league?.id),
        timezone: toStringOrNull(fixtureRow.fixture?.timezone),
        venueCity,
        statusShort: toStringOrNull(fixtureRow.fixture?.status?.short),
      },
    },
  }
}

function finiteScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function parseApiFootballResult(row: unknown): ProviderMeta & {
  providerFixtureId: string
  status: FixtureStatus
  outcomeData: Record<string, unknown>
  winnerRef: string | null
} {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new ProviderError('api_football', 'invalid_response', 'result response contained a malformed row')
  }

  const fixtureRow = row as ApiFootballFixtureRow
  const providerFixtureId = toStringOrNull(fixtureRow.fixture?.id)
  if (!providerFixtureId) {
    throw new ProviderError('api_football', 'invalid_response', 'result response row has no fixture ID')
  }

  const status = mapResultStatus(fixtureRow.fixture?.status?.short)
  if (!status) {
    throw new ProviderError('api_football', 'invalid_response', 'result response contained an unknown fixture status')
  }
  const homeRef = teamRef(fixtureRow.teams?.home?.id, fixtureRow.teams?.home?.name)
  const awayRef = teamRef(fixtureRow.teams?.away?.id, fixtureRow.teams?.away?.name)
  const fulltimeHome = finiteScore(fixtureRow.score?.fulltime?.home ?? fixtureRow.goals?.home)
  const fulltimeAway = finiteScore(fixtureRow.score?.fulltime?.away ?? fixtureRow.goals?.away)

  let winnerRef: string | null = null
  if (status === 'finished' && fulltimeHome !== null && fulltimeAway !== null) {
    if (fulltimeHome > fulltimeAway) winnerRef = homeRef
    if (fulltimeAway > fulltimeHome) winnerRef = awayRef
  }

  return {
    providerFixtureId,
    rawProviderPayload: row,
    providerUpdatedAt: null,
    status,
    winnerRef,
    outcomeData: {
      version: 1,
      statusShort: toStringOrNull(fixtureRow.fixture?.status?.short),
      homeRef,
      awayRef,
      score: {
        halftime: {
          home: finiteScore(fixtureRow.score?.halftime?.home),
          away: finiteScore(fixtureRow.score?.halftime?.away),
        },
        fulltime: { home: fulltimeHome, away: fulltimeAway },
        extratime: {
          home: finiteScore(fixtureRow.score?.extratime?.home),
          away: finiteScore(fixtureRow.score?.extratime?.away),
        },
        penalty: {
          home: finiteScore(fixtureRow.score?.penalty?.home),
          away: finiteScore(fixtureRow.score?.penalty?.away),
        },
      },
    },
  }
}

// Fixture and result reads are read-only by themselves. Fixture writes remain
// gated in lib/providers/fixture-sync.ts and the operator route; this result
// foundation has no caller, scheduler, write, or settlement path.
export class ApiFootballAdapter implements FixtureSyncAdapter, OddsSyncAdapter, ResultSyncAdapter {
  readonly provider = 'api_football' as const

  async fetchFixtures(params: {
    competitionIds?: string[]
    dateFrom: string
    dateTo: string
    season?: string
  }): Promise<Array<ProviderMeta & { fixture: CanonicalFixtureDraft }>> {
    const { API_FOOTBALL_KEY } = getProviderEnv()
    const leagueIds = params.competitionIds?.length ? params.competitionIds : []

    // API-Football requires `season` alongside `league` + `from`/`to`; without
    // it the provider returns an empty envelope. Fail before any network call.
    if (leagueIds.length && !params.season) {
      throw new ProviderError(
        this.provider,
        'invalid_response',
        'league-filtered fixture sync requires a season (e.g. "2026")'
      )
    }

    const fixtures: Array<ProviderMeta & { fixture: CanonicalFixtureDraft }> = []
    const requests = leagueIds.length
      ? leagueIds.map((leagueId) => ({ leagueId, date: null as string | null }))
      : datesInRange(params.dateFrom, params.dateTo).map((date) => ({ leagueId: null as string | null, date }))

    for (const request of requests) {
      const url = new URL(`${BASE_URL}/fixtures`)
      if (request.date) {
        url.searchParams.set('date', request.date)
      } else {
        url.searchParams.set('from', params.dateFrom)
        url.searchParams.set('to', params.dateTo)
        if (request.leagueId) url.searchParams.set('league', request.leagueId)
        if (params.season) url.searchParams.set('season', params.season)
      }

      const body = await providerFetch<ApiFootballFixturesEnvelope>(this.provider, url.toString(), {
        headers: { 'x-apisports-key': API_FOOTBALL_KEY },
      })

      if (hasProviderErrors(body.errors)) {
        throw sanitizeProviderError(this.provider, 'invalid_response', undefined, url.toString())
      }

      // Stop instead of silently ingesting page 1 of a multi-page response —
      // partial coverage written as mapping_confidence='exact' would corrupt
      // fixture identity. Every real v3 envelope carries paging.total as an
      // integer; anything else (missing, string, NaN) is shape drift where
      // single-page completeness cannot be verified, so it must block too —
      // coercing malformed values used to slip past the overflow check.
      const pagingTotal = body.paging?.total
      if (typeof pagingTotal !== 'number' || !Number.isInteger(pagingTotal) || pagingTotal < 0) {
        throw new ProviderError(
          this.provider,
          'invalid_response',
          `fixtures response has missing or malformed paging.total — cannot verify single-page completeness: ${redactUrl(url.toString())}`
        )
      }
      if (pagingTotal > 1) {
        throw new ProviderError(
          this.provider,
          'invalid_response',
          `fixtures response spans ${pagingTotal} pages — pagination overflow, narrow the query: ${redactUrl(url.toString())}`
        )
      }

      const rows = Array.isArray(body.response) ? body.response : []

      // total=0 is only coherent for an empty match day — rows alongside it
      // mean the envelope is inconsistent and completeness cannot be trusted.
      if (pagingTotal === 0 && rows.length > 0) {
        throw new ProviderError(
          this.provider,
          'invalid_response',
          `fixtures response reports paging.total=0 but contains rows — inconsistent envelope, cannot verify single-page completeness: ${redactUrl(url.toString())}`
        )
      }

      for (const row of rows) {
        const parsed = parseApiFootballFixture(row)
        if (parsed) fixtures.push(parsed)
      }
    }

    return fixtures
  }

  async fetchOdds(_: { providerFixtureIds: string[] }): Promise<
    Array<
      ProviderMeta & {
        providerFixtureId: string
        rawMarketName: string
        selection: string
        line: number | null
        price: number
        bookmaker?: string | null
      }
    >
  > {
    scaffoldOnly('fetchOdds')
  }

  async fetchResults(params: { providerFixtureIds: string[] }): Promise<
    Array<
      ProviderMeta & {
        providerFixtureId: string
        status: FixtureStatus
        outcomeData: Record<string, unknown>
        winnerRef: string | null
      }
    >
  > {
    const providerFixtureIds = [...new Set(params.providerFixtureIds)]
    if (providerFixtureIds.length < 1 || providerFixtureIds.length > 20) {
      throw new ProviderError(this.provider, 'invalid_response', 'result fetch requires 1..20 unique fixture IDs')
    }
    if (providerFixtureIds.some((id) => !/^\d+$/.test(id))) {
      throw new ProviderError(this.provider, 'invalid_response', 'result fetch fixture IDs must be numeric')
    }

    const { API_FOOTBALL_KEY } = getProviderEnv()
    const url = new URL(`${BASE_URL}/fixtures`)
    url.searchParams.set('ids', providerFixtureIds.join('-'))

    const body = await providerFetch<ApiFootballFixturesEnvelope>(this.provider, url.toString(), {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
    })
    if (hasProviderErrors(body.errors)) {
      throw sanitizeProviderError(this.provider, 'invalid_response', undefined, url.toString())
    }
    const pagingTotal = body.paging?.total
    if (typeof pagingTotal !== 'number' || !Number.isInteger(pagingTotal) || pagingTotal < 0 || pagingTotal > 1) {
      throw new ProviderError(this.provider, 'invalid_response', 'result response completeness could not be verified')
    }
    if (!Array.isArray(body.response)) {
      throw new ProviderError(this.provider, 'invalid_response', 'result response rows are missing or malformed')
    }

    const requested = new Set(providerFixtureIds)
    const results = body.response.map(parseApiFootballResult)
    const returned = new Set<string>()

    for (const result of results) {
      if (!requested.has(result.providerFixtureId)) {
        throw new ProviderError(this.provider, 'invalid_response', 'result response contained an unexpected fixture ID')
      }
      if (returned.has(result.providerFixtureId)) {
        throw new ProviderError(this.provider, 'invalid_response', 'result response contained a duplicate fixture ID')
      }
      returned.add(result.providerFixtureId)
    }

    if (returned.size !== requested.size) {
      throw new ProviderError(this.provider, 'invalid_response', 'result response omitted a requested fixture ID')
    }

    return results
  }

  // Read-only account/quota check — no fixtures/odds/results data touched.
  async pingSmoke(): Promise<{ ok: true }> {
    const { API_FOOTBALL_KEY } = getProviderEnv()
    await providerFetch(this.provider, `${BASE_URL}/status`, {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
    })
    return { ok: true }
  }
}
