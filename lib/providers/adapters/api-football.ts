import type {
  CanonicalFixtureDraft,
  FixtureSyncAdapter,
  FixtureStatus,
  OddsSyncAdapter,
  ProviderMeta,
  ResultSyncAdapter,
} from '../types'
import { ProviderError } from '../errors'
import { getProviderEnv } from '../../env'
import { providerFetch } from '../http'

const BASE_URL = 'https://v3.football.api-sports.io'

function scaffoldOnly(method: string): never {
  throw new ProviderError(
    'api_football',
    'unknown',
    `ApiFootballAdapter.${method} is an M1.2.a scaffold — sync is not implemented yet`
  )
}

// M1.2.a: skeleton only. fetchFixtures/fetchOdds/fetchResults intentionally
// throw — real sync lands in a later milestone. pingSmoke() is the only
// method that performs a live call, and it is read-only.
export class ApiFootballAdapter implements FixtureSyncAdapter, OddsSyncAdapter, ResultSyncAdapter {
  readonly provider = 'api_football' as const

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

  // Read-only account/quota check — no fixtures/odds/results data touched.
  async pingSmoke(): Promise<{ ok: true }> {
    const { API_FOOTBALL_KEY } = getProviderEnv()
    await providerFetch(this.provider, `${BASE_URL}/status`, {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
    })
    return { ok: true }
  }
}
