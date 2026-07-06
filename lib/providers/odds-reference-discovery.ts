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
  bookmakerRowsTotal: number | null
  validBookmakerRows: number | null
  invalidBookmakerRows: number | null
  invalidBookmakerRowReasons: string[]
  partialBookmakerRows: number | null
  partialBookmakerRowReasons: string[]
  nonFatalWarnings: string[]
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
  nonFatalWarnings: string[]
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
    bookmakerRowsTotal: null,
    validBookmakerRows: null,
    invalidBookmakerRows: null,
    invalidBookmakerRowReasons: [],
    partialBookmakerRows: null,
    partialBookmakerRowReasons: [],
    nonFatalWarnings: [],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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
    nonFatalWarnings: [],
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
  bookmakerRowsTotal: number
  validBookmakerRows: number
  invalidBookmakerRows: number
  invalidBookmakerRowReasons: string[]
  partialBookmakerRows: number
  partialBookmakerRowReasons: string[]
  nonFatalWarnings: string[]
} {
  const bookmakers: OddsReferenceDiscoveryBookmaker[] = []
  const invalidBookmakerRowReasons: string[] = []
  const partialBookmakerRowReasons: string[] = []
  const nonFatalWarnings: string[] = []
  let validBookmakerRows = 0
  let partialBookmakerRows = 0

  const recordInvalidRow = (reason: string) => {
    if (!invalidBookmakerRowReasons.includes(reason)) {
      invalidBookmakerRowReasons.push(reason)
    }
  }
  const recordPartialRow = (reason: string, warning: string) => {
    partialBookmakerRows += 1
    if (!partialBookmakerRowReasons.includes(reason)) {
      partialBookmakerRowReasons.push(reason)
    }
    if (!nonFatalWarnings.includes(warning)) {
      nonFatalWarnings.push(warning)
    }
  }

  for (const row of rows) {
    if (!isRecord(row)) {
      recordInvalidRow('non-object row')
      continue
    }

    const record = row
    let bookmakerRecord = record
    if ('bookmaker' in record) {
      if (!isRecord(record.bookmaker)) {
        recordInvalidRow('unsupported wrapper shape')
        continue
      }
      bookmakerRecord = record.bookmaker
    }

    const providerBookmakerId = toStringOrNull(bookmakerRecord.id)
    const name = toStringOrNull(bookmakerRecord.name)

    if (!providerBookmakerId) {
      recordInvalidRow('missing id')
      continue
    }
    if (!name) {
      recordPartialRow('missing name', 'bookmaker row missing name')
      continue
    }

    validBookmakerRows += 1
    bookmakers.push({ providerBookmakerId, name })
  }

  const invalidBookmakerRows = rows.length - validBookmakerRows - partialBookmakerRows

  return {
    bookmakers: uniqueBy(bookmakers, (bookmaker) => `${bookmaker.providerBookmakerId}:${bookmaker.name}`),
    responseShapeValid: invalidBookmakerRows === 0,
    bookmakerRowsTotal: rows.length,
    validBookmakerRows,
    invalidBookmakerRows,
    invalidBookmakerRowReasons,
    partialBookmakerRows,
    partialBookmakerRowReasons,
    nonFatalWarnings,
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
    let bookmakerRowsTotal: number | null = null
    let validBookmakerRows: number | null = null
    let invalidBookmakerRows: number | null = null
    let invalidBookmakerRowReasons: string[] = []
    let partialBookmakerRows: number | null = null
    let partialBookmakerRowReasons: string[] = []
    let nonFatalWarnings: string[] = []

    if (endpoint === 'bookmakers') {
      const sanitized = sanitizeBookmakers(envelope.rows)
      discoveredBookmakers = sanitized.bookmakers
      responseShapeValid = responseShapeValid && sanitized.responseShapeValid
      bookmakerRowsTotal = sanitized.bookmakerRowsTotal
      validBookmakerRows = sanitized.validBookmakerRows
      invalidBookmakerRows = sanitized.invalidBookmakerRows
      invalidBookmakerRowReasons = sanitized.invalidBookmakerRowReasons
      partialBookmakerRows = sanitized.partialBookmakerRows
      partialBookmakerRowReasons = sanitized.partialBookmakerRowReasons
      nonFatalWarnings = sanitized.nonFatalWarnings
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
      bookmakerRowsTotal,
      validBookmakerRows,
      invalidBookmakerRows,
      invalidBookmakerRowReasons,
      partialBookmakerRows,
      partialBookmakerRowReasons,
      nonFatalWarnings,
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
      nonFatalWarnings: uniqueBy(
        [...report.nonFatalWarnings, ...nonFatalWarnings],
        (warning) => warning
      ),
    }
  }

  return report
}
