export type ProviderName = 'api_football' | 'sportmonks' | 'api_tennis'

export type Sport = 'football' | 'tennis'

export type MappingConfidence = 'exact' | 'high' | 'medium' | 'low' | 'needs_review'

export type FixtureStatus =
  | 'scheduled'
  | 'live'
  | 'finished'
  | 'postponed'
  | 'cancelled'
  | 'abandoned'
  | 'retired'
  | 'walkover'

export interface CanonicalFixtureDraft {
  sport: Sport
  competitionName: string
  competitionCountry?: string | null
  season?: string | null
  round?: string | null
  kickoffAt: string
  status: FixtureStatus
  homeRef?: string | null
  awayRef?: string | null
  participantARef?: string | null
  participantBRef?: string | null
  venue?: string | null
  metadata?: Record<string, unknown>
}

export interface ProviderMeta {
  providerFixtureId: string
  rawProviderPayload: unknown
  providerUpdatedAt?: string | null
}

// Each adapter translates a single provider's response shape into the
// canonical drafts below (§5) — nothing downstream ever sees a raw
// provider payload directly except via rawProviderPayload for debugging.

export interface FixtureSyncAdapter {
  readonly provider: ProviderName
  fetchFixtures(params: {
    competitionIds?: string[]
    dateFrom: string
    dateTo: string
    season?: string
  }): Promise<Array<ProviderMeta & { fixture: CanonicalFixtureDraft }>>
}

export interface OddsSyncAdapter {
  readonly provider: ProviderName
  fetchOdds(params: { providerFixtureIds: string[] }): Promise<
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
  >
}

export interface ResultSyncAdapter {
  readonly provider: ProviderName
  fetchResults(params: { providerFixtureIds: string[] }): Promise<
    Array<
      ProviderMeta & {
        providerFixtureId: string
        status: FixtureStatus
        outcomeData: Record<string, unknown>
        winnerRef: string | null
      }
    >
  >
}

export interface EnrichmentAdapter {
  readonly provider: 'sportmonks'
  fetchEnrichment(params: { providerFixtureId: string }): Promise<
    ProviderMeta & {
      xgHome?: number | null
      xgAway?: number | null
      predictions?: Record<string, unknown>
      matchFacts?: Record<string, unknown>
      momentum?: Record<string, unknown>
    }
  >
}
