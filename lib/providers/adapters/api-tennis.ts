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

const BASE_URL = 'https://api.api-tennis.com/tennis/'
const AUTH_QUERY_PARAM = ['API', 'key'].join('')

// api-tennis.com can signal auth/request failure with HTTP 200 plus a body-level
// error flag, so providerFetch's response.ok check alone cannot catch it.
interface ApiTennisEnvelope<T = unknown> {
  success?: number | string
  error?: number | string
  result?: T
}

interface ApiTennisFixtureRow {
  event_key?: number | string
  event_date?: string | null
  event_time?: string | null
  event_first_player?: string | null
  first_player_key?: number | string | null
  event_second_player?: string | null
  second_player_key?: number | string | null
  event_status?: string | null
  event_live?: number | string | null
  event_type_type?: string | null
  tournament_name?: string | null
  tournament_key?: number | string | null
  tournament_round?: string | null
  tournament_season?: number | string | null
  event_qualification?: boolean | string | null
}

function scaffoldOnly(method: string): never {
  throw new ProviderError(
    'api_tennis',
    'unknown',
    `ApiTennisAdapter.${method} is outside M1.2.b scope — only fixture sync is implemented`
  )
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function hasApiTennisError(body: ApiTennisEnvelope): boolean {
  const error = toStringOrNull(body.error)
  return Boolean(error && error !== '0')
}

function mapFixtureStatus(statusValue?: string | null, liveValue?: number | string | null): FixtureStatus {
  const status = statusValue?.trim().toLowerCase() ?? ''
  const isLive = toStringOrNull(liveValue) === '1'

  if (isLive) return 'live'
  if (!status || status === '-') return 'scheduled'
  if (status.includes('finished')) return 'finished'
  if (status.includes('postponed')) return 'postponed'
  if (status.includes('cancel')) return 'cancelled'
  if (status.includes('abandon')) return 'abandoned'
  if (status.includes('retired')) return 'retired'
  if (status.includes('walkover') || status === 'w/o') return 'walkover'

  return 'scheduled'
}

function playerRef(id: unknown, name: unknown): string | null {
  const idRef = toStringOrNull(id)
  if (idRef) return `api_tennis:player:${idRef}`
  return toStringOrNull(name)
}

function parseUtcKickoff(dateValue: unknown, timeValue: unknown): string | null {
  const date = toStringOrNull(dateValue)
  if (!date) return null
  const time = toStringOrNull(timeValue) ?? '00:00'
  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time
  const kickoff = new Date(`${date}T${normalizedTime}Z`)
  return Number.isNaN(kickoff.getTime()) ? null : kickoff.toISOString()
}

function parseApiTennisFixture(row: unknown): (ProviderMeta & { fixture: CanonicalFixtureDraft }) | null {
  const fixtureRow = row as ApiTennisFixtureRow
  const providerFixtureId = toStringOrNull(fixtureRow.event_key)
  const kickoffAt = parseUtcKickoff(fixtureRow.event_date, fixtureRow.event_time)

  if (!providerFixtureId || !kickoffAt) return null

  const competitionName =
    toStringOrNull(fixtureRow.tournament_name) ??
    toStringOrNull(fixtureRow.event_type_type) ??
    'Unknown tennis tournament'

  return {
    providerFixtureId,
    rawProviderPayload: row,
    providerUpdatedAt: null,
    fixture: {
      sport: 'tennis',
      competitionName,
      competitionCountry: null,
      season: toStringOrNull(fixtureRow.tournament_season),
      round: toStringOrNull(fixtureRow.tournament_round),
      kickoffAt,
      status: mapFixtureStatus(fixtureRow.event_status, fixtureRow.event_live),
      homeRef: null,
      awayRef: null,
      participantARef: playerRef(fixtureRow.first_player_key, fixtureRow.event_first_player),
      participantBRef: playerRef(fixtureRow.second_player_key, fixtureRow.event_second_player),
      venue: null,
      metadata: {
        provider: 'api_tennis',
        providerFixtureId,
        tournamentKey: toStringOrNull(fixtureRow.tournament_key),
        eventType: toStringOrNull(fixtureRow.event_type_type),
        eventQualification: toStringOrNull(fixtureRow.event_qualification),
        eventLive: toStringOrNull(fixtureRow.event_live),
      },
    },
  }
}

// M1.2.b: fixture fetch only. This path is read-only by itself; writes are
// gated in lib/providers/fixture-sync.ts and the operator route. Odds/results
// remain scaffold-only until later milestones.
export class ApiTennisAdapter implements FixtureSyncAdapter, OddsSyncAdapter, ResultSyncAdapter {
  readonly provider = 'api_tennis' as const

  async fetchFixtures(params: {
    competitionIds?: string[]
    dateFrom: string
    dateTo: string
  }): Promise<Array<ProviderMeta & { fixture: CanonicalFixtureDraft }>> {
    const { API_TENNIS_KEY } = getProviderEnv()
    const tournamentKeys = params.competitionIds?.length ? params.competitionIds : [undefined]
    const fixtures: Array<ProviderMeta & { fixture: CanonicalFixtureDraft }> = []

    for (const tournamentKey of tournamentKeys) {
      const url = new URL(BASE_URL)
      url.searchParams.set('method', 'get_fixtures')
      url.searchParams.set(AUTH_QUERY_PARAM, API_TENNIS_KEY)
      url.searchParams.set('date_start', params.dateFrom)
      url.searchParams.set('date_stop', params.dateTo)
      url.searchParams.set('timezone', 'UTC')
      if (tournamentKey) url.searchParams.set('tournament_key', tournamentKey)

      const body = await providerFetch<ApiTennisEnvelope<unknown[]>>(this.provider, url.toString())
      if (hasApiTennisError(body)) {
        throw sanitizeProviderError(this.provider, 'invalid_response', undefined, url.toString())
      }

      const rows = Array.isArray(body.result) ? body.result : []
      for (const row of rows) {
        const parsed = parseApiTennisFixture(row)
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

  // Read-only supported-events check — no fixtures/odds/results data touched.
  async pingSmoke(): Promise<{ ok: true }> {
    const { API_TENNIS_KEY } = getProviderEnv()
    const url = new URL(BASE_URL)
    url.searchParams.set('method', 'get_events')
    url.searchParams.set(AUTH_QUERY_PARAM, API_TENNIS_KEY)
    const body = await providerFetch<ApiTennisEnvelope>(this.provider, url.toString())
    if (hasApiTennisError(body)) {
      throw sanitizeProviderError(this.provider, 'auth', undefined, url.toString())
    }
    return { ok: true }
  }
}
