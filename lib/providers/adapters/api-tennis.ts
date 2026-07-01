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

// api-tennis.com signals auth failure with HTTP 200 + a body-level `error`
// flag (e.g. {"error":"1","result":[{"msg":"Wrong login credentials"}]})
// rather than a 4xx status, so providerFetch's response.ok check alone
// cannot catch it — the body must be inspected here.
interface ApiTennisEnvelope {
  error?: string
}

function scaffoldOnly(method: string): never {
  throw new ProviderError(
    'api_tennis',
    'unknown',
    `ApiTennisAdapter.${method} is an M1.2.a scaffold — sync is not implemented yet`
  )
}

// M1.2.a: skeleton only. fetchFixtures/fetchOdds/fetchResults intentionally
// throw — the tennis track is a separate REST integration (docs/TENNIS_TRACK_API_NOTES.md)
// and real sync lands in a later milestone.
export class ApiTennisAdapter implements FixtureSyncAdapter, OddsSyncAdapter, ResultSyncAdapter {
  readonly provider = 'api_tennis' as const

  async fetchFixtures(_: {
    competitionIds?: string[]
    dateFrom: string
    dateTo: string
  }): Promise<Array<ProviderMeta & { fixture: CanonicalFixtureDraft }>> {
    scaffoldOnly('fetchFixtures')
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

  // Read-only get_events check — lists supported tournament types for the
  // subscription; no fixtures/odds/results data touched. api-tennis.com
  // authenticates via an `APIkey` query param (mixed case is the real
  // param name), which redactUrl() now matches case-insensitively.
  async pingSmoke(): Promise<{ ok: true }> {
    const { API_TENNIS_KEY } = getProviderEnv()
    const url = new URL(BASE_URL)
    url.searchParams.set('method', 'get_events')
    url.searchParams.set('APIkey', API_TENNIS_KEY)
    const body = await providerFetch<ApiTennisEnvelope>(this.provider, url.toString())
    if (body.error && body.error !== '0') {
      throw sanitizeProviderError(this.provider, 'auth', undefined, url.toString())
    }
    return { ok: true }
  }
}
