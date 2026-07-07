import { providerFetch } from './http'

export const READ_ONLY_ODDS_PROVIDER = 'api_football'
export const READ_ONLY_ODDS_PROVIDER_FIXTURE_ID = '1576052'
export const READ_ONLY_ODDS_BET_ID = 1
export const READ_ONLY_ODDS_MARKET = 'match_winner'
export const READ_ONLY_ODDS_PRE_KICKOFF_BUFFER_MINUTES = 15

const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io'
const MINUTE_MS = 60 * 1000

interface SupabaseMaybeSingleResult<T> {
  data: T | null
  error: unknown
}

interface SupabaseQueryBuilder<T> {
  eq(column: string, value: string): SupabaseQueryBuilder<T>
  maybeSingle(): Promise<SupabaseMaybeSingleResult<T>>
}

interface SupabaseTableBuilder<T> {
  select(columns: string): SupabaseQueryBuilder<T>
}

export interface OddsDryRunSupabaseClient {
  from(table: string): SupabaseTableBuilder<unknown>
}

interface FixtureProviderLinkRow {
  id: string
  canonical_fixture_id: string
  provider: string
  provider_fixture_id: string
  mapping_confidence: string
}

interface CanonicalFixtureRow {
  id: string
  sport: string
  status: string
  kickoff_at: string | null
}

export interface OddsDryRunProviderRequest {
  providerFixtureId: string
  betId: number
  page: 1
}

export interface OddsDryRunBookmaker {
  providerBookmakerId: string
  name: string
}

export interface OddsDryRunMarket {
  providerMarketId: string
  name: string
}

export interface ReadOnlyOddsDryRunReport {
  dryRun: true
  provider: typeof READ_ONLY_ODDS_PROVIDER
  providerFixtureId: typeof READ_ONLY_ODDS_PROVIDER_FIXTURE_ID
  market: typeof READ_ONLY_ODDS_MARKET
  betId: typeof READ_ONLY_ODDS_BET_ID
  requestAttempted: boolean
  estimatedProviderRequests: 1
  actualProviderRequests: number
  paging: {
    current: number | null
    total: number | null
  }
  oddsAvailable: boolean
  discoveredBookmakers: OddsDryRunBookmaker[]
  discoveredMarkets: OddsDryRunMarket[]
  valuesPresent: boolean
  paginationOverflow: boolean
  stopReasons: string[]
  writeSkipped: true
  preflight: {
    passed: boolean
    providerLinkFound: boolean
    canonicalFixtureFound: boolean
    blockedReasons: string[]
  }
}

export interface RunReadOnlyOddsDryRunParams {
  supabase: OddsDryRunSupabaseClient
  now?: string
  fetchProviderOdds?: (request: OddsDryRunProviderRequest) => Promise<unknown>
}

function asFixtureProviderLink(value: unknown): FixtureProviderLinkRow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<FixtureProviderLinkRow>
  if (typeof row.id !== 'string') return null
  if (typeof row.canonical_fixture_id !== 'string') return null
  if (typeof row.provider !== 'string') return null
  if (typeof row.provider_fixture_id !== 'string') return null
  if (typeof row.mapping_confidence !== 'string') return null
  return row as FixtureProviderLinkRow
}

function asCanonicalFixture(value: unknown): CanonicalFixtureRow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<CanonicalFixtureRow>
  if (typeof row.id !== 'string') return null
  if (typeof row.sport !== 'string') return null
  if (typeof row.status !== 'string') return null
  if (row.kickoff_at !== null && typeof row.kickoff_at !== 'string') return null
  return row as CanonicalFixtureRow
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function emptyReport(blockedReasons: string[] = []): ReadOnlyOddsDryRunReport {
  return {
    dryRun: true,
    provider: READ_ONLY_ODDS_PROVIDER,
    providerFixtureId: READ_ONLY_ODDS_PROVIDER_FIXTURE_ID,
    market: READ_ONLY_ODDS_MARKET,
    betId: READ_ONLY_ODDS_BET_ID,
    requestAttempted: false,
    estimatedProviderRequests: 1,
    actualProviderRequests: 0,
    paging: {
      current: null,
      total: null,
    },
    oddsAvailable: false,
    discoveredBookmakers: [],
    discoveredMarkets: [],
    valuesPresent: false,
    paginationOverflow: false,
    stopReasons: [],
    writeSkipped: true,
    preflight: {
      passed: blockedReasons.length === 0,
      providerLinkFound: false,
      canonicalFixtureFound: false,
      blockedReasons,
    },
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

async function runPreflight(
  supabase: OddsDryRunSupabaseClient,
  nowMs: number
): Promise<ReadOnlyOddsDryRunReport['preflight']> {
  const blockedReasons: string[] = []

  const linkResult = await supabase
    .from('fixture_provider_links')
    .select('id, canonical_fixture_id, provider, provider_fixture_id, mapping_confidence')
    .eq('provider', READ_ONLY_ODDS_PROVIDER)
    .eq('provider_fixture_id', READ_ONLY_ODDS_PROVIDER_FIXTURE_ID)
    .maybeSingle()

  if (linkResult.error) blockedReasons.push('provider link lookup failed')
  const link = asFixtureProviderLink(linkResult.data)

  if (!link) {
    blockedReasons.push('exact api_football provider link is missing')
    return {
      passed: false,
      providerLinkFound: false,
      canonicalFixtureFound: false,
      blockedReasons,
    }
  }

  if (link.provider !== READ_ONLY_ODDS_PROVIDER) blockedReasons.push('provider is not api_football')
  if (link.provider_fixture_id !== READ_ONLY_ODDS_PROVIDER_FIXTURE_ID) {
    blockedReasons.push('provider_fixture_id is outside approved PR #83 scope')
  }
  if (link.mapping_confidence !== 'exact') blockedReasons.push('mapping_confidence is not exact')

  const fixtureResult = await supabase
    .from('canonical_fixtures')
    .select('id, sport, status, kickoff_at')
    .eq('id', link.canonical_fixture_id)
    .maybeSingle()

  if (fixtureResult.error) blockedReasons.push('canonical fixture lookup failed')
  const fixture = asCanonicalFixture(fixtureResult.data)

  if (!fixture) {
    blockedReasons.push('linked canonical fixture is missing')
    return {
      passed: false,
      providerLinkFound: true,
      canonicalFixtureFound: false,
      blockedReasons,
    }
  }

  if (fixture.sport !== 'football') blockedReasons.push('canonical fixture sport is not football')
  if (fixture.status !== 'scheduled') blockedReasons.push('canonical fixture status is not scheduled')

  const kickoffMs = parseTime(fixture.kickoff_at)
  if (kickoffMs === null) {
    blockedReasons.push('kickoff_at is missing')
  } else if (kickoffMs <= nowMs) {
    blockedReasons.push('kickoff already started')
  } else if (kickoffMs <= nowMs + READ_ONLY_ODDS_PRE_KICKOFF_BUFFER_MINUTES * MINUTE_MS) {
    blockedReasons.push('fixture is inside the pre-kickoff safety buffer')
  }

  return {
    passed: blockedReasons.length === 0,
    providerLinkFound: true,
    canonicalFixtureFound: true,
    blockedReasons,
  }
}

function sanitizeProviderOddsPayload(payload: unknown): Pick<
  ReadOnlyOddsDryRunReport,
  'paging' | 'oddsAvailable' | 'discoveredBookmakers' | 'discoveredMarkets' | 'valuesPresent' | 'paginationOverflow'
> {
  const envelope = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const pagingValue = envelope.paging && typeof envelope.paging === 'object'
    ? envelope.paging as Record<string, unknown>
    : {}
  const paging = {
    current: toNumberOrNull(pagingValue.current),
    total: toNumberOrNull(pagingValue.total),
  }
  const rows = Array.isArray(envelope.response) ? envelope.response : []
  const bookmakers: OddsDryRunBookmaker[] = []
  const markets: OddsDryRunMarket[] = []
  let valuesPresent = false

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const rowBookmakers = Array.isArray((row as Record<string, unknown>).bookmakers)
      ? (row as Record<string, unknown>).bookmakers as unknown[]
      : []

    for (const bookmaker of rowBookmakers) {
      if (!bookmaker || typeof bookmaker !== 'object') continue
      const bookmakerRecord = bookmaker as Record<string, unknown>
      const providerBookmakerId = toStringOrNull(bookmakerRecord.id)
      const bookmakerName = toStringOrNull(bookmakerRecord.name)
      if (providerBookmakerId && bookmakerName) {
        bookmakers.push({ providerBookmakerId, name: bookmakerName })
      }

      const bets = Array.isArray(bookmakerRecord.bets) ? bookmakerRecord.bets : []
      for (const bet of bets) {
        if (!bet || typeof bet !== 'object') continue
        const betRecord = bet as Record<string, unknown>
        const providerMarketId = toStringOrNull(betRecord.id)
        const marketName = toStringOrNull(betRecord.name)
        if (providerMarketId && marketName) {
          markets.push({ providerMarketId, name: marketName })
        }
        if (Array.isArray(betRecord.values) && betRecord.values.length > 0) {
          valuesPresent = true
        }
      }
    }
  }

  return {
    paging,
    oddsAvailable: rows.length > 0 && valuesPresent,
    discoveredBookmakers: uniqueBy(bookmakers, (bookmaker) => `${bookmaker.providerBookmakerId}:${bookmaker.name}`),
    discoveredMarkets: uniqueBy(markets, (market) => `${market.providerMarketId}:${market.name}`),
    valuesPresent,
    paginationOverflow: typeof paging.total === 'number' && paging.total > 1,
  }
}

export async function fetchApiFootballReadOnlyOdds(
  request: OddsDryRunProviderRequest
): Promise<unknown> {
  const apiFootballKey = process.env.API_FOOTBALL_KEY
  if (!apiFootballKey) {
    throw new Error('API_FOOTBALL_KEY is not set')
  }

  const url = new URL(`${API_FOOTBALL_BASE_URL}/odds`)
  url.searchParams.set('fixture', request.providerFixtureId)
  url.searchParams.set('bet', String(request.betId))

  return providerFetch(READ_ONLY_ODDS_PROVIDER, url.toString(), {
    headers: { 'x-apisports-key': apiFootballKey },
  })
}

export async function runReadOnlyOddsDryRun(
  params: RunReadOnlyOddsDryRunParams
): Promise<ReadOnlyOddsDryRunReport> {
  const nowMs = parseTime(params.now ?? new Date().toISOString()) ?? Date.now()
  const preflight = await runPreflight(params.supabase, nowMs)

  if (!preflight.passed) {
    return {
      ...emptyReport(),
      preflight,
    }
  }

  const fetchProviderOdds = params.fetchProviderOdds ?? fetchApiFootballReadOnlyOdds
  const providerPayload = await fetchProviderOdds({
    providerFixtureId: READ_ONLY_ODDS_PROVIDER_FIXTURE_ID,
    betId: READ_ONLY_ODDS_BET_ID,
    page: 1,
  })
  const sanitized = sanitizeProviderOddsPayload(providerPayload)
  const stopReasons = sanitized.paginationOverflow
    ? ['provider pagination total exceeds approved page-1 budget']
    : []

  return {
    ...emptyReport(),
    requestAttempted: true,
    actualProviderRequests: 1,
    paging: sanitized.paging,
    oddsAvailable: sanitized.oddsAvailable,
    discoveredBookmakers: sanitized.discoveredBookmakers,
    discoveredMarkets: sanitized.discoveredMarkets,
    valuesPresent: sanitized.valuesPresent,
    paginationOverflow: sanitized.paginationOverflow,
    stopReasons,
    preflight,
  }
}
