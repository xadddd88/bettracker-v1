import type {
  CanonicalFixtureDraft,
  FixtureSyncAdapter,
  FixtureStatus,
  OddsSyncAdapter,
  ProviderMeta,
  ResultSyncAdapter,
} from '../types'
import { ProviderError, sanitizeProviderError } from '../errors'
import { getProviderEnv } from '../../env'
import { providerFetch } from '../http'

const BASE_URL = 'https://v3.football.api-sports.io'

interface ApiFootballFixturesEnvelope {
  errors?: unknown
  response?: unknown[]
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
}

function scaffoldOnly(method: string): never {
  throw new ProviderError(
    'api_football',
    'unknown',
    `ApiFootballAdapter.${method} is outside M1.2.b scope — only fixture sync is implemented`
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

function teamRef(id: unknown, name: unknown): string | null {
  const idRef = toStringOrNull(id)
  if (idRef) return `api_football:team:${idRef}`
  return toStringOrNull(name)
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

// M1.2.b: fixture fetch only. This path is read-only by itself; writes are
// gated in lib/providers/fixture-sync.ts and the operator route. Odds/results
// remain scaffold-only until later milestones.
export class ApiFootballAdapter implements FixtureSyncAdapter, OddsSyncAdapter, ResultSyncAdapter {
  readonly provider = 'api_football' as const

  async fetchFixtures(params: {
    competitionIds?: string[]
    dateFrom: string
    dateTo: string
  }): Promise<Array<ProviderMeta & { fixture: CanonicalFixtureDraft }>> {
    const { API_FOOTBALL_KEY } = getProviderEnv()
    const leagueIds = params.competitionIds?.length ? params.competitionIds : [undefined]
    const fixtures: Array<ProviderMeta & { fixture: CanonicalFixtureDraft }> = []

    for (const leagueId of leagueIds) {
      const url = new URL(`${BASE_URL}/fixtures`)
      url.searchParams.set('from', params.dateFrom)
      url.searchParams.set('to', params.dateTo)
      if (leagueId) url.searchParams.set('league', leagueId)

      const body = await providerFetch<ApiFootballFixturesEnvelope>(this.provider, url.toString(), {
        headers: { 'x-apisports-key': API_FOOTBALL_KEY },
      })

      if (hasProviderErrors(body.errors)) {
        throw sanitizeProviderError(this.provider, 'invalid_response', undefined, url.toString())
      }

      const rows = Array.isArray(body.response) ? body.response : []
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

  async fetchResults(_: { providerFixtureIds: string[] }): Promise<
    Array<
      ProviderMeta & {
        providerFixtureId: string
        status: FixtureStatus
        outcomeData: Record<string, unknown>
        winnerRef: string | null
      }
    >
  > {
    scaffoldOnly('fetchResults')
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
