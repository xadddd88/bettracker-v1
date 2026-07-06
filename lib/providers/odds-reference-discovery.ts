import { ProviderError } from './errors'
import { providerFetch } from './http'

export const ODDS_REFERENCE_DISCOVERY_PROVIDER = 'api_football'
export const ODDS_REFERENCE_DISCOVERY_CONFIRMATION = 'RUN_BOOKMAKER_MAPPING_DISCOVERY_M1_3'
export const ODDS_REFERENCE_DISCOVERY_CONFIRMATION_ERROR =
  'bookmaker/mapping discovery requires explicit operator confirmation'
export const ODDS_REFERENCE_DISCOVERY_MAX_PROVIDER_REQUESTS = 2

const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io'
const APPROVED_ENDPOINTS = ['bookmakers', 'mapping'] as const

export type OddsReferenceDiscoveryEndpoint = typeof APPROVED_ENDPOINTS[number]

export interface OddsReferenceDiscoveryProviderRequest {
  endpoint: OddsReferenceDiscoveryEndpoint
}

export interface OddsReferenceDiscoveryEndpointReport {
  endpoint: OddsReferenceDiscoveryEndpoint
  endpointName: `/odds/${OddsReferenceDiscoveryEndpoint}`
  requestAttempted: boolean
  paging: {
    current: number | null
    total: number | null
  }
  resultsCount: number
  paginationOverflow: boolean
  responseShapeValid: boolean
}

export interface OddsReferenceDiscoveryBookmaker {
  providerBookmakerId: string
  name: string
}

export interface OddsReferenceDiscoveryMapping {
  league: {
    id: string
    season: string
  }
  fixture: {
    id: string
  }
  update: string
}

export interface BookmakerMappingDiscoveryReport {
  dryRun: true
  provider: typeof ODDS_REFERENCE_DISCOVERY_PROVIDER
  scope: 'bookmaker_mapping_reference'
  estimatedProviderRequests: typeof ODDS_REFERENCE_DISCOVERY_MAX_PROVIDER_REQUESTS
  actualProviderRequests: number
  writeSkipped: true
  endpoints: OddsReferenceDiscoveryEndpointReport[]
  discoveredBookmakers: OddsReferenceDiscoveryBookmaker[]
  mappingCoverage: OddsReferenceDiscoveryMapping[]
  paginationOverflow: boolean
  stopReasons: string[]
}

export interface RunBookmakerMappingDiscoveryParams {
  fetchProviderReference?: (request: OddsReferenceDiscoveryProviderRequest) => Promise<unknown>
}

function emptyEndpointReport(endpoint: OddsReferenceDiscoveryEndpoint): OddsReferenceDiscoveryEndpointReport {
  return {
    endpoint,
    endpointName: `/odds/${endpoint}`,
    requestAttempted: false,
    paging: {
      current: null,
      total: null,
    },
    resultsCount: 0,
    paginationOverflow: false,
    responseShapeValid: true,
  }
}

function emptyReport(): BookmakerMappingDiscoveryReport {
  return {
    dryRun: true,
    provider: ODDS_REFERENCE_DISCOVERY_PROVIDER,
    scope: 'bookmaker_mapping_reference',
    estimatedProviderRequests: ODDS_REFERENCE_DISCOVERY_MAX_PROVIDER_REQUESTS,
    actualProviderRequests: 0,
    writeSkipped: true,
    endpoints: APPROVED_ENDPOINTS.map(emptyEndpointReport),
    discoveredBookmakers: [],
    mappingCoverage: [],
    paginationOverflow: false,
    stopReasons: [],
  }
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
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

function parseEnvelope(payload: unknown): {
  rows: unknown[]
  paging: OddsReferenceDiscoveryEndpointReport['paging']
  responseShapeValid: boolean
} {
  const envelope = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const pagingValue = envelope.paging && typeof envelope.paging === 'object'
    ? envelope.paging as Record<string, unknown>
    : {}

  return {
    rows: Array.isArray(envelope.response) ? envelope.response : [],
    paging: {
      current: toNumberOrNull(pagingValue.current),
      total: toNumberOrNull(pagingValue.total),
    },
    responseShapeValid: Array.isArray(envelope.response),
  }
}

function sanitizeBookmakers(rows: unknown[]): {
  bookmakers: OddsReferenceDiscoveryBookmaker[]
  responseShapeValid: boolean
} {
  const bookmakers: OddsReferenceDiscoveryBookmaker[] = []
  let responseShapeValid = true

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      responseShapeValid = false
      continue
    }

    const record = row as Record<string, unknown>
    const providerBookmakerId = toStringOrNull(record.id)
    const name = toStringOrNull(record.name)

    if (!providerBookmakerId || !name) {
      responseShapeValid = false
      continue
    }

    bookmakers.push({ providerBookmakerId, name })
  }

  return {
    bookmakers: uniqueBy(bookmakers, (bookmaker) => `${bookmaker.providerBookmakerId}:${bookmaker.name}`),
    responseShapeValid,
  }
}

function sanitizeMapping(rows: unknown[]): {
  mappingCoverage: OddsReferenceDiscoveryMapping[]
  responseShapeValid: boolean
} {
  const mappingCoverage: OddsReferenceDiscoveryMapping[] = []
  let responseShapeValid = true

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      responseShapeValid = false
      continue
    }

    const record = row as Record<string, unknown>
    const league = record.league && typeof record.league === 'object'
      ? record.league as Record<string, unknown>
      : {}
    const fixture = record.fixture && typeof record.fixture === 'object'
      ? record.fixture as Record<string, unknown>
      : {}
    const leagueId = toStringOrNull(league.id)
    const leagueSeason = toStringOrNull(league.season)
    const fixtureId = toStringOrNull(fixture.id)
    const update = toStringOrNull(record.update)

    if (!leagueId || !leagueSeason || !fixtureId || !update) {
      responseShapeValid = false
      continue
    }

    mappingCoverage.push({
      league: {
        id: leagueId,
        season: leagueSeason,
      },
      fixture: {
        id: fixtureId,
      },
      update,
    })
  }

  return {
    mappingCoverage: uniqueBy(
      mappingCoverage,
      (mapping) => `${mapping.league.id}:${mapping.league.season}:${mapping.fixture.id}:${mapping.update}`
    ),
    responseShapeValid,
  }
}

function replaceEndpointReport(
  endpoints: OddsReferenceDiscoveryEndpointReport[],
  next: OddsReferenceDiscoveryEndpointReport
): OddsReferenceDiscoveryEndpointReport[] {
  return endpoints.map((endpoint) => endpoint.endpoint === next.endpoint ? next : endpoint)
}

export async function fetchApiFootballReferenceEndpoint(
  request: OddsReferenceDiscoveryProviderRequest
): Promise<unknown> {
  const apiFootballKey = process.env.API_FOOTBALL_KEY
  if (!apiFootballKey) {
    throw new ProviderError(
      ODDS_REFERENCE_DISCOVERY_PROVIDER,
      'auth',
      'API_FOOTBALL_KEY is not configured'
    )
  }

  const url = new URL(`${API_FOOTBALL_BASE_URL}/odds/${request.endpoint}`)

  return providerFetch(ODDS_REFERENCE_DISCOVERY_PROVIDER, url.toString(), {
    headers: { 'x-apisports-key': apiFootballKey },
  })
}

export async function runBookmakerMappingDiscovery(
  params: RunBookmakerMappingDiscoveryParams = {}
): Promise<BookmakerMappingDiscoveryReport> {
  const fetchProviderReference = params.fetchProviderReference ?? fetchApiFootballReferenceEndpoint
  let report = emptyReport()

  for (const endpoint of APPROVED_ENDPOINTS) {
    if (report.stopReasons.length > 0) break

    const payload = await fetchProviderReference({ endpoint })
    const envelope = parseEnvelope(payload)
    const paginationOverflow = typeof envelope.paging.total === 'number' && envelope.paging.total > 1
    let discoveredBookmakers: OddsReferenceDiscoveryBookmaker[] = []
    let mappingCoverage: OddsReferenceDiscoveryMapping[] = []
    let responseShapeValid = envelope.responseShapeValid

    if (endpoint === 'bookmakers') {
      const sanitized = sanitizeBookmakers(envelope.rows)
      discoveredBookmakers = sanitized.bookmakers
      responseShapeValid = responseShapeValid && sanitized.responseShapeValid
    } else {
      const sanitized = sanitizeMapping(envelope.rows)
      mappingCoverage = sanitized.mappingCoverage
      responseShapeValid = responseShapeValid && sanitized.responseShapeValid
    }

    const endpointReport: OddsReferenceDiscoveryEndpointReport = {
      endpoint,
      endpointName: `/odds/${endpoint}`,
      requestAttempted: true,
      paging: envelope.paging,
      resultsCount: envelope.rows.length,
      paginationOverflow,
      responseShapeValid,
    }

    const stopReasons = [...report.stopReasons]
    if (paginationOverflow) {
      stopReasons.push(`provider pagination total exceeds approved page-1 budget for /odds/${endpoint}`)
    }
    if (!responseShapeValid) {
      stopReasons.push(`provider response shape differs from expected evidence for /odds/${endpoint}`)
    }

    report = {
      ...report,
      actualProviderRequests: report.actualProviderRequests + 1,
      endpoints: replaceEndpointReport(report.endpoints, endpointReport),
      discoveredBookmakers: uniqueBy(
        [...report.discoveredBookmakers, ...discoveredBookmakers],
        (bookmaker) => `${bookmaker.providerBookmakerId}:${bookmaker.name}`
      ),
      mappingCoverage: uniqueBy(
        [...report.mappingCoverage, ...mappingCoverage],
        (mapping) => `${mapping.league.id}:${mapping.league.season}:${mapping.fixture.id}:${mapping.update}`
      ),
      paginationOverflow: report.paginationOverflow || paginationOverflow,
      stopReasons,
    }
  }

  return report
}
