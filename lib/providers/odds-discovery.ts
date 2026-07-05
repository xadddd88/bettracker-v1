import type { FixtureStatus, MappingConfidence, ProviderName, Sport } from './types'

export const ODDS_SYNC_WRITE_ENV = 'SPORTS_ODDS_SYNC_WRITE_ENABLED'
export const ODDS_SYNC_WRITE_CONFIRMATION = 'WRITE_ODDS_SNAPSHOT_M1_3'
export const ODDS_DISCOVERY_PROVIDER = 'api_football'
export const ODDS_DISCOVERY_MARKET = 'match_winner'
export const ODDS_PRE_KICKOFF_BUFFER_MINUTES = 15

const ODDS_ENDPOINT_NOT_DOCUMENTED = 'api_football odds endpoint/request/cost is not documented'
const FETCHER_NOT_CONFIGURED = 'provider odds fetcher is not configured'
const EMPTY_BOOKMAKER_ALLOWLIST = 'approved bookmaker allowlist is empty'
const MINUTE_MS = 60 * 1000

export interface OddsEndpointDocumentation {
  endpoint: string | null
  requestShape: string | null
  quotaCostPerRequest: number | null
}

export interface OddsDiscoveryFixtureCandidate {
  canonicalFixtureId: string
  sport: Sport
  status: FixtureStatus | 'unknown'
  kickoffAt: string | null
  provider: ProviderName
  providerFixtureId: string | null
  mappingConfidence: MappingConfidence | 'unknown'
}

export interface OddsDiscoveryBookmaker {
  providerBookmakerId: string
  name: string
}

export interface OddsDiscoveryMarket {
  providerMarketId: string
  name: string
}

export interface ProviderOddsDiscoveryRow {
  providerFixtureId: string
  bookmakers?: OddsDiscoveryBookmaker[]
  markets?: OddsDiscoveryMarket[]
  oddsAvailable?: boolean
  rawProviderPayload?: unknown
}

export interface OddsEndpointDiscoveryParams {
  provider: typeof ODDS_DISCOVERY_PROVIDER
  market: typeof ODDS_DISCOVERY_MARKET
  dryRun: boolean
  operatorConfirm?: string
  now?: string
  endpointDocumentation: OddsEndpointDocumentation
  fixtures: OddsDiscoveryFixtureCandidate[]
  bookmakerAllowlist?: OddsDiscoveryBookmaker[]
  fetchProviderOdds?: (params: {
    provider: typeof ODDS_DISCOVERY_PROVIDER
    market: typeof ODDS_DISCOVERY_MARKET
    providerFixtureIds: string[]
    endpointDocumentation: OddsEndpointDocumentation
  }) => Promise<ProviderOddsDiscoveryRow[]>
}

export interface OddsDiscoveryFixtureReport {
  canonicalFixtureId: string
  providerFixtureId: string | null
  sport: Sport
  status: FixtureStatus | 'unknown'
  kickoffAt: string | null
  providerLinkFound: boolean
  eligible: boolean
  blockedReasons: string[]
}

export interface OddsEndpointDiscoveryReport {
  dryRun: boolean
  writeEnabled: boolean
  operatorConfirmed: boolean
  provider: typeof ODDS_DISCOVERY_PROVIDER
  market: typeof ODDS_DISCOVERY_MARKET
  endpointDocumentation: {
    documented: boolean
    endpoint: string | null
    requestShape: string | null
    quotaCostPerRequest: number | null
  }
  estimatedProviderRequests: number
  providerCall: {
    allowed: boolean
    attempted: boolean
    blockedReasons: string[]
  }
  write: {
    allowed: boolean
    writeSkipped: boolean
    blockedReasons: string[]
  }
  fixtures: OddsDiscoveryFixtureReport[]
  discoveredBookmakers: OddsDiscoveryBookmaker[]
  discoveredMarkets: OddsDiscoveryMarket[]
  totals: {
    fixturesChecked: number
    providerLinksFound: number
    eligibleFixtures: number
    oddsAvailable: number
    oddsUnavailable: number
    insertedSnapshots: 0
    updatedSnapshots: 0
    failedWrites: 0
  }
}

function hasText(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isEndpointDocumented(endpointDocumentation: OddsEndpointDocumentation): boolean {
  return (
    hasText(endpointDocumentation.endpoint) &&
    hasText(endpointDocumentation.requestShape) &&
    typeof endpointDocumentation.quotaCostPerRequest === 'number' &&
    Number.isFinite(endpointDocumentation.quotaCostPerRequest) &&
    endpointDocumentation.quotaCostPerRequest > 0
  )
}

function parseTime(value: string | null): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function uniqueBy<T>(items: T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []

  for (const item of items) {
    const key = keyFor(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

function fixtureReport(
  fixture: OddsDiscoveryFixtureCandidate,
  nowMs: number
): OddsDiscoveryFixtureReport {
  const blockedReasons: string[] = []
  const providerLinkFound =
    fixture.provider === ODDS_DISCOVERY_PROVIDER &&
    hasText(fixture.providerFixtureId) &&
    fixture.mappingConfidence === 'exact'

  if (fixture.sport !== 'football') blockedReasons.push('fixture sport is not football')
  if (fixture.status !== 'scheduled') blockedReasons.push('fixture status is not scheduled')
  if (!providerLinkFound) blockedReasons.push('exact api_football provider link is missing')

  const kickoffMs = parseTime(fixture.kickoffAt)
  if (kickoffMs === null) {
    blockedReasons.push('kickoff_at is missing')
  } else if (kickoffMs <= nowMs) {
    blockedReasons.push('kickoff already started')
  } else if (kickoffMs <= nowMs + ODDS_PRE_KICKOFF_BUFFER_MINUTES * MINUTE_MS) {
    blockedReasons.push('fixture is inside the pre-kickoff safety buffer')
  }

  return {
    canonicalFixtureId: fixture.canonicalFixtureId,
    providerFixtureId: fixture.providerFixtureId,
    sport: fixture.sport,
    status: fixture.status,
    kickoffAt: fixture.kickoffAt,
    providerLinkFound,
    eligible: blockedReasons.length === 0,
    blockedReasons,
  }
}

export async function runOddsEndpointDiscoveryDryRun(
  params: OddsEndpointDiscoveryParams
): Promise<OddsEndpointDiscoveryReport> {
  const endpointDocumented = isEndpointDocumented(params.endpointDocumentation)
  const nowMs = parseTime(params.now ?? new Date().toISOString()) ?? Date.now()
  const fixtures = params.fixtures.map((fixture) => fixtureReport(fixture, nowMs))
  const eligibleProviderFixtureIds = fixtures
    .filter((fixture) => fixture.eligible && fixture.providerFixtureId)
    .map((fixture) => fixture.providerFixtureId as string)

  const writeEnabled = process.env[ODDS_SYNC_WRITE_ENV] === 'true'
  const operatorConfirmed = params.operatorConfirm === ODDS_SYNC_WRITE_CONFIRMATION
  const writeBlockedReasons: string[] = []

  if (params.dryRun) {
    writeBlockedReasons.push('dry-run mode')
  } else {
    if (!writeEnabled) writeBlockedReasons.push(`${ODDS_SYNC_WRITE_ENV} is not enabled`)
    if (!operatorConfirmed) writeBlockedReasons.push(`operator confirmation must be ${ODDS_SYNC_WRITE_CONFIRMATION}`)
    if ((params.bookmakerAllowlist ?? []).length === 0) writeBlockedReasons.push(EMPTY_BOOKMAKER_ALLOWLIST)
  }

  const providerCallBlockedReasons: string[] = []
  if (!endpointDocumented) providerCallBlockedReasons.push(ODDS_ENDPOINT_NOT_DOCUMENTED)
  if (eligibleProviderFixtureIds.length === 0) providerCallBlockedReasons.push('no eligible pre-match fixtures')
  if (!params.fetchProviderOdds) providerCallBlockedReasons.push(FETCHER_NOT_CONFIGURED)
  if (!params.dryRun && writeBlockedReasons.length > 0) providerCallBlockedReasons.push(...writeBlockedReasons)

  const providerCallAllowed = providerCallBlockedReasons.length === 0
  const rows = providerCallAllowed && params.fetchProviderOdds
    ? await params.fetchProviderOdds({
        provider: params.provider,
        market: params.market,
        providerFixtureIds: eligibleProviderFixtureIds,
        endpointDocumentation: params.endpointDocumentation,
      })
    : []

  const availableFixtureIds = new Set(
    rows
      .filter((row) => row.oddsAvailable !== false)
      .map((row) => row.providerFixtureId)
  )
  const discoveredBookmakers = uniqueBy(
    rows.flatMap((row) => row.bookmakers ?? []),
    (bookmaker) => `${bookmaker.providerBookmakerId}:${bookmaker.name}`
  )
  const discoveredMarkets = uniqueBy(
    rows.flatMap((row) => row.markets ?? []),
    (market) => `${market.providerMarketId}:${market.name}`
  )
  const oddsAvailable = availableFixtureIds.size
  const oddsUnavailable = providerCallAllowed
    ? Math.max(eligibleProviderFixtureIds.length - oddsAvailable, 0)
    : 0
  const writeAllowed = !params.dryRun && writeBlockedReasons.length === 0 && providerCallAllowed

  return {
    dryRun: params.dryRun,
    writeEnabled,
    operatorConfirmed,
    provider: params.provider,
    market: params.market,
    endpointDocumentation: {
      documented: endpointDocumented,
      endpoint: params.endpointDocumentation.endpoint,
      requestShape: params.endpointDocumentation.requestShape,
      quotaCostPerRequest: params.endpointDocumentation.quotaCostPerRequest,
    },
    estimatedProviderRequests: eligibleProviderFixtureIds.length,
    providerCall: {
      allowed: providerCallAllowed,
      attempted: providerCallAllowed,
      blockedReasons: providerCallBlockedReasons,
    },
    write: {
      allowed: writeAllowed,
      writeSkipped: true,
      blockedReasons: writeBlockedReasons,
    },
    fixtures,
    discoveredBookmakers,
    discoveredMarkets,
    totals: {
      fixturesChecked: fixtures.length,
      providerLinksFound: fixtures.filter((fixture) => fixture.providerLinkFound).length,
      eligibleFixtures: eligibleProviderFixtureIds.length,
      oddsAvailable,
      oddsUnavailable,
      insertedSnapshots: 0,
      updatedSnapshots: 0,
      failedWrites: 0,
    },
  }
}
