import { createAdminClient } from '../supabase/admin'
import { ProviderError } from './errors'
import { getProviderEnv } from '../env'
import { providerFetch } from './http'
import { kickoffMinuteUtc } from './sportmonks-mapping-discovery'

// M1.2.e canonical-linked SportMonks read-only enrichment dry-run
// (Decision #034). Validates that the approved canonical fixture's SportMonks
// counterpart is reachable and identity-consistent, reporting only shape
// booleans — never enrichment content. Hard guardrails:
//   - exactly ONE approved canonical fixture / provider fixture pair
//   - DB preflight runs BEFORE the provider token is loaded; any preflight
//     failure aborts with zero provider calls
//   - max 1 provider request; no pagination, no retry, no fallback endpoint
//   - include set is EMPTY — fixture base response only
//   - token travels in the Authorization header, never in the URL
//   - sanitized report only: no raw payload, no fixture/team/player text, no
//     odds prices, no predictions — presence booleans and identity ids only
//   - ZERO writes; football_enrichment and all downstream usage stay blocked

export const SPORTMONKS_ENRICHMENT_DRY_RUN_CONFIRMATION = 'RUN_SPORTMONKS_ENRICHMENT_DRY_RUN_M1_2_E'
export const SPORTMONKS_ENRICHMENT_DRY_RUN_MAX_PROVIDER_REQUESTS = 1
export const SPORTMONKS_ENRICHMENT_DRY_RUN_CONFIRMATION_ERROR =
  'sportmonks enrichment dry-run requires the exact approved scope and operator confirmation'

// Decision #034 pinned runtime scope (Decisions #044-#046 identity chain).
export const SPORTMONKS_ENRICHMENT_APPROVED_CANONICAL_FIXTURE_ID = '92afd570-399a-48b9-915a-e1ffaf52a71c'
export const SPORTMONKS_ENRICHMENT_APPROVED_PROVIDER_FIXTURE_ID = '19722203'
export const SPORTMONKS_ENRICHMENT_APPROVED_KICKOFF_MINUTE_UTC = '2026-08-21T19:00'
export const SPORTMONKS_ENRICHMENT_APPROVED_LEAGUE_ID = '8'
// SportMonks football sport id (v3 core entity).
export const SPORTMONKS_ENRICHMENT_APPROVED_SPORT_ID = '1'

const SPORTMONKS_BASE_URL = 'https://api.sportmonks.com/v3/football'

// Provider-derived values never reach the report as raw text: ids must be
// digit-only and bounded, timestamps must parse and are re-emitted as
// normalized ISO strings.
const MAX_ID_LENGTH = 20
const MAX_TIMESTAMP_LENGTH = 40
const TIMESTAMP_SHAPE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/

// Families that only ever matter as presence booleans. Content is never read.
const ENRICHMENT_FAMILY_KEYS = [
  'participants',
  'scores',
  'periods',
  'events',
  'statistics',
  'lineups',
  'sidelined',
  'odds',
  'predictions',
  'metadata',
] as const

const FRESHNESS_FIELD_KEYS = ['starting_at', 'starting_at_timestamp', 'updated_at'] as const

export type EnrichmentDryRunStatus = 'ok' | 'blocked' | 'failed'

export interface EnrichmentDryRunReport {
  provider: 'sportmonks'
  endpointFamily: 'fixtures/{id}'
  canonicalFixtureId: string
  providerFixtureId: string
  maxProviderRequests: number
  requestCount: number
  requestedIncludeSet: string[]
  responseStatus: EnrichmentDryRunStatus
  fixtureIdentityMatch: boolean | null
  providerStateId: string | null
  providerStartingAt: string | null
  providerHasOdds: boolean | null
  providerHasPremiumOdds: boolean | null
  enrichmentFamiliesPresent: Record<string, boolean>
  freshnessFieldsPresent: Record<string, boolean>
  sourceUpdatedAt: string | null
  // collectedAt is the dry-run wall clock, NOT source freshness (Decision #034).
  collectedAt: string
  warnings: string[]
  blockedDownstreamUsage: string[]
  writes: 'none'
}

interface SportMonksFixtureByIdEnvelope {
  data?: unknown
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// IDs are accepted ONLY as finite non-negative integers or bounded
// digit-only strings — arbitrary provider text can never pass through.
function toIdString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return String(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed) && trimmed.length > 0 && trimmed.length <= MAX_ID_LENGTH) return trimmed
  }
  return null
}

// Timestamps are accepted ONLY as bounded, shape-checked strings that parse
// to a real date, and are re-emitted as normalized ISO — the provider's raw
// string is never reflected into the report.
function toIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_TIMESTAMP_LENGTH) return null
  if (!TIMESTAMP_SHAPE.test(trimmed)) return null
  const normalized = trimmed.includes('T') ? trimmed : `${trimmed.replace(' ', 'T')}Z`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

// Epoch seconds: presence counts only for a plausible finite integer.
function isValidEpochSeconds(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 10_000_000_000
}

// Downstream stays blocked no matter what this dry-run observes (FP-001).
const BLOCKED_DOWNSTREAM_USAGE = [
  'football_enrichment writes remain blocked',
  'Scout/Analyst/UI usage remains blocked',
  'probability, implied probability, edge, EV, recommendation, Place Bet, and betting signals remain blocked (FP-001)',
]

function emptyFlags(keys: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(keys.map((key) => [key, false]))
}

function baseReport(): EnrichmentDryRunReport {
  return {
    provider: 'sportmonks',
    endpointFamily: 'fixtures/{id}',
    canonicalFixtureId: SPORTMONKS_ENRICHMENT_APPROVED_CANONICAL_FIXTURE_ID,
    providerFixtureId: SPORTMONKS_ENRICHMENT_APPROVED_PROVIDER_FIXTURE_ID,
    maxProviderRequests: SPORTMONKS_ENRICHMENT_DRY_RUN_MAX_PROVIDER_REQUESTS,
    requestCount: 0,
    requestedIncludeSet: [],
    responseStatus: 'blocked',
    fixtureIdentityMatch: null,
    providerStateId: null,
    providerStartingAt: null,
    providerHasOdds: null,
    providerHasPremiumOdds: null,
    enrichmentFamiliesPresent: emptyFlags(ENRICHMENT_FAMILY_KEYS),
    freshnessFieldsPresent: emptyFlags(FRESHNESS_FIELD_KEYS),
    sourceUpdatedAt: null,
    collectedAt: new Date().toISOString(),
    warnings: [],
    blockedDownstreamUsage: BLOCKED_DOWNSTREAM_USAGE,
    writes: 'none',
  }
}

// DB preflight (service-role reads only, zero writes). Runs BEFORE the
// provider token is loaded; any failure means zero provider calls.
async function preflight(report: EnrichmentDryRunReport): Promise<boolean> {
  const supabase = createAdminClient()

  const { data: fixture, error: fixtureError } = await supabase
    .from('canonical_fixtures')
    .select('id, sport, status, kickoff_at')
    .eq('id', SPORTMONKS_ENRICHMENT_APPROVED_CANONICAL_FIXTURE_ID)
    .maybeSingle()

  if (fixtureError) {
    report.warnings.push('preflight failed: canonical fixture load error')
    return false
  }
  if (!fixture) {
    report.warnings.push('preflight failed: canonical fixture not found')
    return false
  }
  if (fixture.sport !== 'football') {
    report.warnings.push(`preflight failed: sport is ${fixture.sport}, expected football`)
  }
  if (fixture.status !== 'scheduled') {
    report.warnings.push(`preflight failed: status is ${fixture.status}, expected scheduled`)
  }
  if (kickoffMinuteUtc(fixture.kickoff_at) !== SPORTMONKS_ENRICHMENT_APPROVED_KICKOFF_MINUTE_UTC) {
    report.warnings.push('preflight failed: kickoff minute does not match the approved fixture')
  }

  const { data: link, error: linkError } = await supabase
    .from('fixture_provider_links')
    .select('provider_fixture_id, mapping_confidence')
    .eq('provider', 'sportmonks')
    .eq('canonical_fixture_id', SPORTMONKS_ENRICHMENT_APPROVED_CANONICAL_FIXTURE_ID)
    .maybeSingle()

  if (linkError) {
    report.warnings.push('preflight failed: provider link load error')
    return false
  }
  if (!link) {
    // Hard pre-flight blocker from Decision #034.
    report.warnings.push('preflight failed: no SportMonks provider link for the canonical fixture')
    return false
  }
  if (toIdString(link.provider_fixture_id) !== SPORTMONKS_ENRICHMENT_APPROVED_PROVIDER_FIXTURE_ID) {
    report.warnings.push('preflight failed: provider link fixture id does not match the approved id')
  }
  if (link.mapping_confidence !== 'exact' && link.mapping_confidence !== 'high') {
    report.warnings.push(
      `preflight failed: mapping confidence is ${link.mapping_confidence}, expected exact or high`
    )
  }

  return report.warnings.length === 0
}

// Identity validation on the provider response. Only ids/timestamps are
// compared; nothing from the payload is echoed into the report beyond the
// sanitized allowlist fields. FAIL CLOSED: a field that is PRESENT but
// invalid/garbage blocks identity — it is never treated as absent.
function validateIdentity(data: UnknownRecord, report: EnrichmentDryRunReport): boolean {
  const problems: string[] = []

  if (toIdString(data.id) !== SPORTMONKS_ENRICHMENT_APPROVED_PROVIDER_FIXTURE_ID) {
    problems.push('provider returned a different fixture id')
  }

  const sportIdPresent = data.sport_id !== undefined && data.sport_id !== null
  const sportId = toIdString(data.sport_id)
  if (sportIdPresent && sportId !== SPORTMONKS_ENRICHMENT_APPROVED_SPORT_ID) {
    problems.push('provider sport id does not match football')
  }

  const leagueIdPresent = data.league_id !== undefined && data.league_id !== null
  const leagueId = toIdString(data.league_id)
  if (leagueIdPresent && leagueId !== SPORTMONKS_ENRICHMENT_APPROVED_LEAGUE_ID) {
    problems.push('provider league id does not match the approved fixture')
  }

  const startingAtPresent = data.starting_at !== undefined && data.starting_at !== null
  const startingAt = typeof data.starting_at === 'string' ? data.starting_at : null
  if (
    startingAtPresent &&
    (startingAt === null ||
      kickoffMinuteUtc(startingAt) !== SPORTMONKS_ENRICHMENT_APPROVED_KICKOFF_MINUTE_UTC)
  ) {
    problems.push('provider kickoff does not match the approved fixture')
  }

  if (problems.length) {
    report.warnings.push(...problems)
    return false
  }
  return true
}

export async function runSportMonksEnrichmentDryRun(): Promise<EnrichmentDryRunReport> {
  const report = baseReport()

  // 1. DB preflight — must pass before the token is even loaded.
  const preflightOk = await preflight(report)
  if (!preflightOk) {
    report.responseStatus = 'blocked'
    return report
  }

  // 2. Exactly one provider request: fixture-by-ID, no includes, no query
  //    parameters, token in the Authorization header only.
  const { SPORTMONKS_TOKEN } = getProviderEnv()
  const url = `${SPORTMONKS_BASE_URL}/fixtures/${SPORTMONKS_ENRICHMENT_APPROVED_PROVIDER_FIXTURE_ID}`

  report.requestCount++
  let body: SportMonksFixtureByIdEnvelope
  try {
    body = await providerFetch<SportMonksFixtureByIdEnvelope>('sportmonks', url, {
      headers: { Authorization: SPORTMONKS_TOKEN },
    })
  } catch (error) {
    // providerFetch throws sanitized ProviderErrors (redacted URL, no body).
    // No retry is approved — a single failure ends the run.
    report.responseStatus = 'failed'
    report.warnings.push(
      error instanceof ProviderError ? error.message : 'provider request failed'
    )
    return report
  }

  // 3. Shape + identity validation. Any mismatch is a sanitized failure.
  if (!isRecord(body.data)) {
    report.responseStatus = 'failed'
    report.warnings.push('provider response missing fixture data object')
    return report
  }

  const data = body.data
  report.fixtureIdentityMatch = validateIdentity(data, report)
  if (!report.fixtureIdentityMatch) {
    report.responseStatus = 'failed'
    return report
  }

  // 4. Sanitized shape report: digit-validated ids, normalized ISO
  //    timestamps, and presence booleans only. Raw provider strings never
  //    pass through. No names, no content, no odds prices, no predictions.
  report.providerStateId = toIdString(data.state_id)
  report.providerStartingAt = toIsoTimestamp(data.starting_at)
  report.providerHasOdds = typeof data.has_odds === 'boolean' ? data.has_odds : null
  report.providerHasPremiumOdds =
    typeof data.has_premium_odds === 'boolean' ? data.has_premium_odds : null

  for (const key of ENRICHMENT_FAMILY_KEYS) {
    report.enrichmentFamiliesPresent[key] = key in data && data[key] != null
  }

  // Freshness flags count only VALID values: an unparseable timestamp or a
  // garbage epoch must read as absent, never as fresh.
  report.sourceUpdatedAt = toIsoTimestamp(data.updated_at)
  report.freshnessFieldsPresent.starting_at = report.providerStartingAt !== null
  report.freshnessFieldsPresent.starting_at_timestamp = isValidEpochSeconds(data.starting_at_timestamp)
  report.freshnessFieldsPresent.updated_at = report.sourceUpdatedAt !== null

  if (report.sourceUpdatedAt === null) {
    report.warnings.push(
      'provider freshness field updated_at not present or invalid — downstream usage stays blocked (collectedAt is not source freshness)'
    )
  }

  report.responseStatus = 'ok'
  return report
}
