import { getProviderEnv } from '../env'
import { createAdminClient } from '../supabase/admin'
import { providerFetch } from './http'
import {
  SPORTMONKS_ENRICHMENT_APPROVED_CANONICAL_FIXTURE_ID,
  SPORTMONKS_ENRICHMENT_APPROVED_KICKOFF_MINUTE_UTC,
  SPORTMONKS_ENRICHMENT_APPROVED_LEAGUE_ID,
  SPORTMONKS_ENRICHMENT_APPROVED_PROVIDER_FIXTURE_ID,
  SPORTMONKS_ENRICHMENT_APPROVED_SPORT_ID,
} from './sportmonks-enrichment-dry-run'
import { kickoffMinuteUtc } from './sportmonks-mapping-discovery'

// Decision #056: one canonical-linked SportMonks Class A structural presence
// dry-run. This module intentionally does not widen or modify the completed
// Decision #034 base-response route.

export const SPORTMONKS_STRUCTURAL_PRESENCE_DRY_RUN_CONFIRMATION =
  'RUN_SPORTMONKS_STRUCTURAL_PRESENCE_DRY_RUN_D056'
export const SPORTMONKS_STRUCTURAL_PRESENCE_DRY_RUN_MAX_PROVIDER_REQUESTS = 1
export const SPORTMONKS_STRUCTURAL_PRESENCE_DRY_RUN_CONFIRMATION_ERROR =
  'sportmonks structural presence dry-run requires the exact approved scope and operator confirmation'

export const SPORTMONKS_STRUCTURAL_PRESENCE_INCLUDE_SET = [
  'participants',
  'league',
  'season',
  'round',
  'venue',
  'state',
] as const

type StructuralRelationshipKey = (typeof SPORTMONKS_STRUCTURAL_PRESENCE_INCLUDE_SET)[number]
type UnknownRecord = Record<string, unknown>

const SPORTMONKS_STRUCTURAL_PRESENCE_URL =
  `https://api.sportmonks.com/v3/football/fixtures/${SPORTMONKS_ENRICHMENT_APPROVED_PROVIDER_FIXTURE_ID}` +
  `?include=${SPORTMONKS_STRUCTURAL_PRESENCE_INCLUDE_SET.join(';')}`

const MAX_ID_LENGTH = 20
const MAX_TIMESTAMP_LENGTH = 40
const MAX_PARTICIPANT_RECORDS = 8
const TIMESTAMP_SHAPE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?$/

const SINGLE_RELATIONSHIP_BASE_IDS: Record<
  Exclude<StructuralRelationshipKey, 'participants'>,
  'league_id' | 'season_id' | 'round_id' | 'venue_id' | 'state_id'
> = {
  league: 'league_id',
  season: 'season_id',
  round: 'round_id',
  venue: 'venue_id',
  state: 'state_id',
}

// Class B/C and other non-approved fixture relationships. The response is
// never inspected beyond fixed-key presence checks.
const FORBIDDEN_RELATIONSHIP_KEYS = [
  'scores',
  'periods',
  'events',
  'lineups',
  'sidelined',
  'weatherReport',
  'statistics',
  'xGFixture',
  'pressure',
  'trends',
  'matchfacts',
  'expectedLineups',
  'odds',
  'premiumOdds',
  'inplayOdds',
  'predictions',
  'AIOverviews',
  'metadata',
  'prematchNews',
  'postmatchNews',
] as const

const BLOCKED_DOWNSTREAM_USAGE = [
  'structural relationship persistence remains blocked',
  'football_enrichment, fixture_results, and odds_snapshots writes remain blocked',
  'Scout/Analyst/UI usage remains blocked',
  'probability, implied probability, edge, EV, recommendation, Place Bet, and betting signals remain blocked (FP-001)',
]

export type StructuralPresenceDryRunStatus = 'ok' | 'blocked' | 'failed'
export type StructuralRelationshipShape = 'absent' | 'array' | 'object' | 'invalid'

export interface StructuralRelationshipObservation {
  present: boolean
  shape: StructuralRelationshipShape
  count: number | null
  schemaValid: boolean | null
  identifierValid: boolean | null
  referenceMatch: boolean | null
  sourceFreshnessValidCount: number
  sourceFreshnessMissingOrInvalidCount: number
}

export interface StructuralPresenceDryRunReport {
  provider: 'sportmonks'
  endpointFamily: 'fixtures/{id}'
  canonicalFixtureId: string
  providerFixtureId: string
  maxProviderRequests: number
  requestCount: number
  requestedIncludeSet: string[]
  responseStatus: StructuralPresenceDryRunStatus
  fixtureIdentityMatch: boolean | null
  providerStartingAt: string | null
  fixtureSourceFreshnessPresent: boolean
  structuralRelationships: Record<StructuralRelationshipKey, StructuralRelationshipObservation>
  unexpectedNonStructuralRelationshipsPresent: boolean
  collectedAt: string
  warnings: string[]
  blockedDownstreamUsage: string[]
  writes: 'none'
}

interface SportMonksFixtureByIdEnvelope {
  data?: unknown
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toIdString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed) || trimmed.length === 0 || trimmed.length > MAX_ID_LENGTH) return null
  return trimmed
}

function toIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_TIMESTAMP_LENGTH) return null
  const match = TIMESTAMP_SHAPE.exec(trimmed)
  if (!match) return null

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0'] = match
  const [year, month, day, hour, minute, second] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
  ].map(Number)
  const calendarCheck = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day ||
    calendarCheck.getUTCHours() !== hour ||
    calendarCheck.getUTCMinutes() !== minute ||
    calendarCheck.getUTCSeconds() !== second
  ) {
    return null
  }

  const isoLike = trimmed.replace(' ', 'T')
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(isoLike) ? isoLike : `${isoLike}Z`
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function absentObservation(): StructuralRelationshipObservation {
  return {
    present: false,
    shape: 'absent',
    count: 0,
    schemaValid: null,
    identifierValid: null,
    referenceMatch: null,
    sourceFreshnessValidCount: 0,
    sourceFreshnessMissingOrInvalidCount: 0,
  }
}

function emptyStructuralRelationships(): Record<
  StructuralRelationshipKey,
  StructuralRelationshipObservation
> {
  return Object.fromEntries(
    SPORTMONKS_STRUCTURAL_PRESENCE_INCLUDE_SET.map((key) => [key, absentObservation()])
  ) as Record<StructuralRelationshipKey, StructuralRelationshipObservation>
}

function baseReport(): StructuralPresenceDryRunReport {
  return {
    provider: 'sportmonks',
    endpointFamily: 'fixtures/{id}',
    canonicalFixtureId: SPORTMONKS_ENRICHMENT_APPROVED_CANONICAL_FIXTURE_ID,
    providerFixtureId: SPORTMONKS_ENRICHMENT_APPROVED_PROVIDER_FIXTURE_ID,
    maxProviderRequests: SPORTMONKS_STRUCTURAL_PRESENCE_DRY_RUN_MAX_PROVIDER_REQUESTS,
    requestCount: 0,
    requestedIncludeSet: [...SPORTMONKS_STRUCTURAL_PRESENCE_INCLUDE_SET],
    responseStatus: 'blocked',
    fixtureIdentityMatch: null,
    providerStartingAt: null,
    fixtureSourceFreshnessPresent: false,
    structuralRelationships: emptyStructuralRelationships(),
    unexpectedNonStructuralRelationshipsPresent: false,
    collectedAt: new Date().toISOString(),
    warnings: [],
    blockedDownstreamUsage: BLOCKED_DOWNSTREAM_USAGE,
    writes: 'none',
  }
}

// Service-role reads only. This runs before getProviderEnv(), so any failure
// consumes zero provider requests and never loads the SportMonks token.
async function preflight(report: StructuralPresenceDryRunReport): Promise<boolean> {
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
    report.warnings.push('preflight failed: canonical fixture sport does not match football')
  }
  if (fixture.status !== 'scheduled') {
    report.warnings.push('preflight failed: canonical fixture status does not match scheduled')
  }
  if (
    typeof fixture.kickoff_at !== 'string' ||
    kickoffMinuteUtc(fixture.kickoff_at) !== SPORTMONKS_ENRICHMENT_APPROVED_KICKOFF_MINUTE_UTC
  ) {
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
    report.warnings.push('preflight failed: no SportMonks provider link for the canonical fixture')
    return false
  }
  if (toIdString(link.provider_fixture_id) !== SPORTMONKS_ENRICHMENT_APPROVED_PROVIDER_FIXTURE_ID) {
    report.warnings.push('preflight failed: provider link fixture id does not match the approved id')
  }
  if (link.mapping_confidence !== 'exact' && link.mapping_confidence !== 'high') {
    report.warnings.push('preflight failed: provider link mapping confidence is not exact or high')
  }

  return report.warnings.length === 0
}

function validateIdentity(data: UnknownRecord, report: StructuralPresenceDryRunReport): boolean {
  const problems: string[] = []

  if (toIdString(data.id) !== SPORTMONKS_ENRICHMENT_APPROVED_PROVIDER_FIXTURE_ID) {
    problems.push('provider returned a different fixture id')
  }
  if (toIdString(data.sport_id) !== SPORTMONKS_ENRICHMENT_APPROVED_SPORT_ID) {
    problems.push('provider sport id does not match football')
  }
  if (toIdString(data.league_id) !== SPORTMONKS_ENRICHMENT_APPROVED_LEAGUE_ID) {
    problems.push('provider league id does not match the approved fixture')
  }
  if (
    typeof data.starting_at !== 'string' ||
    kickoffMinuteUtc(data.starting_at) !== SPORTMONKS_ENRICHMENT_APPROVED_KICKOFF_MINUTE_UTC
  ) {
    problems.push('provider kickoff does not match the approved fixture')
  }

  if (problems.length === 0) return true
  report.warnings.push(...problems)
  return false
}

function observeParticipants(
  value: unknown,
  report: StructuralPresenceDryRunReport
): StructuralRelationshipObservation {
  if (value === undefined || value === null) return absentObservation()
  if (!Array.isArray(value)) {
    report.warnings.push('participants relationship has an invalid shape')
    return {
      ...absentObservation(),
      present: true,
      shape: 'invalid',
      count: null,
      schemaValid: false,
      identifierValid: false,
    }
  }

  if (value.length > MAX_PARTICIPANT_RECORDS) {
    report.warnings.push('participants relationship exceeds the approved record bound')
    return {
      ...absentObservation(),
      present: true,
      shape: 'array',
      count: null,
      schemaValid: false,
      identifierValid: false,
    }
  }

  const recordsValid = value.every(isRecord)
  const ids = recordsValid ? value.map((item) => toIdString(item.id)) : []
  const identifierValid =
    recordsValid && ids.every((id) => id !== null) && new Set(ids).size === ids.length
  const expectedCount = value.length === 2
  const sourceFreshnessValidCount = recordsValid
    ? value.filter((item) => toIsoTimestamp(item.updated_at) !== null).length
    : 0
  const schemaValid = recordsValid && identifierValid && expectedCount

  if (!recordsValid) report.warnings.push('participants relationship contains a non-object record')
  if (!identifierValid) {
    report.warnings.push('participants relationship contains invalid or duplicate ids')
  }
  if (!expectedCount) {
    report.warnings.push('participants relationship does not contain exactly two records')
  }

  return {
    present: true,
    shape: 'array',
    count: value.length,
    schemaValid,
    identifierValid,
    referenceMatch: null,
    sourceFreshnessValidCount,
    sourceFreshnessMissingOrInvalidCount: value.length - sourceFreshnessValidCount,
  }
}

function observeSingleRelationship(
  key: Exclude<StructuralRelationshipKey, 'participants'>,
  value: unknown,
  fixtureData: UnknownRecord,
  report: StructuralPresenceDryRunReport
): StructuralRelationshipObservation {
  if (value === undefined || value === null) return absentObservation()
  if (!isRecord(value)) {
    report.warnings.push(`${key} relationship has an invalid shape`)
    return {
      ...absentObservation(),
      present: true,
      shape: 'invalid',
      count: null,
      schemaValid: false,
      identifierValid: false,
    }
  }

  const relationshipId = toIdString(value.id)
  const fixtureReferenceId = toIdString(fixtureData[SINGLE_RELATIONSHIP_BASE_IDS[key]])
  const identifierValid = relationshipId !== null
  const referenceMatch =
    relationshipId !== null && fixtureReferenceId !== null && relationshipId === fixtureReferenceId
  const schemaValid = identifierValid && fixtureReferenceId !== null && referenceMatch
  const sourceFreshnessValid = toIsoTimestamp(value.updated_at) !== null

  if (!identifierValid) report.warnings.push(`${key} relationship id is invalid`)
  if (fixtureReferenceId === null) {
    report.warnings.push(`${key} fixture reference id is missing or invalid`)
  } else if (!referenceMatch) {
    report.warnings.push(`${key} relationship id does not match the fixture reference`)
  }

  return {
    present: true,
    shape: 'object',
    count: 1,
    schemaValid,
    identifierValid,
    referenceMatch,
    sourceFreshnessValidCount: sourceFreshnessValid ? 1 : 0,
    sourceFreshnessMissingOrInvalidCount: sourceFreshnessValid ? 0 : 1,
  }
}

function observeStructuralRelationships(
  data: UnknownRecord,
  report: StructuralPresenceDryRunReport
): boolean {
  report.structuralRelationships.participants = observeParticipants(data.participants, report)

  for (const key of SPORTMONKS_STRUCTURAL_PRESENCE_INCLUDE_SET) {
    if (key === 'participants') continue
    report.structuralRelationships[key] = observeSingleRelationship(key, data[key], data, report)
  }

  const presentObservations = Object.values(report.structuralRelationships).filter(
    (observation) => observation.present
  )
  return presentObservations.every((observation) => observation.schemaValid === true)
}

export async function runSportMonksStructuralPresenceDryRun(): Promise<StructuralPresenceDryRunReport> {
  const report = baseReport()

  const preflightOk = await preflight(report)
  if (!preflightOk) return report

  let sportMonksToken: string
  try {
    sportMonksToken = getProviderEnv().SPORTMONKS_TOKEN
  } catch {
    report.warnings.push('provider token is not configured')
    return report
  }

  report.requestCount++
  let body: SportMonksFixtureByIdEnvelope
  try {
    body = await providerFetch<SportMonksFixtureByIdEnvelope>(
      'sportmonks',
      SPORTMONKS_STRUCTURAL_PRESENCE_URL,
      { headers: { Authorization: sportMonksToken } }
    )
  } catch {
    report.responseStatus = 'failed'
    report.warnings.push('provider request failed')
    return report
  }

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

  report.providerStartingAt = toIsoTimestamp(data.starting_at)
  report.fixtureSourceFreshnessPresent = toIsoTimestamp(data.updated_at) !== null
  if (!report.fixtureSourceFreshnessPresent) {
    report.warnings.push(
      'fixture source updated_at not present or invalid — collectedAt is not source freshness'
    )
  }

  report.unexpectedNonStructuralRelationshipsPresent = FORBIDDEN_RELATIONSHIP_KEYS.some(
    (key) => key in data && data[key] !== undefined && data[key] !== null
  )
  if (report.unexpectedNonStructuralRelationshipsPresent) {
    report.warnings.push('provider returned a non-approved relationship family')
  }

  const structuralSchemaValid = observeStructuralRelationships(data, report)
  if (!structuralSchemaValid || report.unexpectedNonStructuralRelationshipsPresent) {
    report.responseStatus = 'failed'
    return report
  }

  report.responseStatus = 'ok'
  return report
}
