// M1.2.e.2.b.3 (Decision #045): controlled SportMonks provider-link write.
//
// Writes exactly ONE row to fixture_provider_links — the link discovered and
// recorded by Decision #044 (discovery run
// sportmonks-mapping-discovery-2026-07-09T04-58-46-908Z-8i1oc162). Both sides
// of the link are pinned as constants; widening any value requires a new PR +
// CPO approval.
//
// Guardrails:
//   - ZERO provider calls — the write uses the ledger-recorded discovery
//     evidence; nothing is re-fetched
//   - triple write gate: dryRun=false AND SPORTS_PROVIDER_LINK_WRITE_ENABLED
//     AND the operator confirmation phrase
//   - DB preflight re-verifies the discovery preconditions at write time and
//     blocks on any drift (fixture missing/changed, link already claimed)
//   - idempotent: an existing identical link reports alreadyLinked, no write

import { createAdminClient } from '../supabase/admin'
import { kickoffMinuteUtc } from './sportmonks-mapping-discovery'

export const SPORTMONKS_PROVIDER_LINK_WRITE_CONFIRMATION = 'WRITE_SPORTMONKS_PROVIDER_LINK_M1_2_E_2_B_3'
export const SPORTMONKS_PROVIDER_LINK_WRITE_CONFIRMATION_ERROR =
  'sportmonks provider-link write requires the exact approved scope and operator confirmation'

// Decision #045 approved scope — the single link this module can ever write.
export const APPROVED_PROVIDER_LINK = {
  canonicalFixtureId: '92afd570-399a-48b9-915a-e1ffaf52a71c',
  provider: 'sportmonks',
  providerFixtureId: '19722203',
  kickoffMinuteUtc: '2026-08-21T19:00',
  mappingConfidence: 'high',
  mappingMethod: 'name_time_match',
  discoveryRunId: 'sportmonks-mapping-discovery-2026-07-09T04-58-46-908Z-8i1oc162',
} as const

// Sanitized discovery candidate exactly as recorded in Decision #044 — stored
// as write provenance. No odds fields, no tokens, no raw provider payload.
const DISCOVERY_CANDIDATE = {
  sportmonksFixtureId: '19722203',
  sportmonksName: 'Arsenal vs Coventry City',
  startingAt: '2026-08-21 19:00:00',
  leagueId: '8',
  seasonId: '28083',
  stateId: '1',
  homeParticipant: 'Arsenal',
  awayParticipant: 'Coventry City',
} as const

export interface ProviderLinkPreflightCheck {
  name: string
  pass: boolean
  detail: string | null
}

export interface ProviderLinkWriteReport {
  linkWriteRunId: string
  dryRun: boolean
  writeEnabled: boolean
  operatorConfirmed: boolean
  provider: 'sportmonks'
  canonicalFixtureId: string
  providerFixtureId: string
  providerRequestsUsed: 0
  preflight: { passed: boolean; checks: ProviderLinkPreflightCheck[] }
  alreadyLinked: boolean
  wrote: { insertedProviderLinks: number; failedWrites: number; errors: string[] } | null
  writes: 'none' | 'single_provider_link'
}

function nextLinkWriteRunId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const random = Math.random().toString(36).slice(2, 10)
  return `sportmonks-provider-link-write-${stamp}-${random}`
}

function safeErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'unknown write error')
  }
  return 'unknown write error'
}

export async function runSportmonksProviderLinkWrite(params: {
  dryRun: boolean
  operatorConfirm?: string
}): Promise<ProviderLinkWriteReport> {
  const supabase = createAdminClient()
  const writeEnabled = process.env.SPORTS_PROVIDER_LINK_WRITE_ENABLED === 'true'
  const operatorConfirmed = params.operatorConfirm === SPORTMONKS_PROVIDER_LINK_WRITE_CONFIRMATION

  const report: ProviderLinkWriteReport = {
    linkWriteRunId: nextLinkWriteRunId(),
    dryRun: params.dryRun,
    writeEnabled,
    operatorConfirmed,
    provider: 'sportmonks',
    canonicalFixtureId: APPROVED_PROVIDER_LINK.canonicalFixtureId,
    providerFixtureId: APPROVED_PROVIDER_LINK.providerFixtureId,
    providerRequestsUsed: 0,
    preflight: { passed: false, checks: [] },
    alreadyLinked: false,
    wrote: null,
    writes: 'none',
  }
  const checks = report.preflight.checks

  // Preflight 1 — the approved canonical fixture still exists and still looks
  // exactly like it did at discovery time.
  const { data: fixture, error: fixtureError } = await supabase
    .from('canonical_fixtures')
    .select('id, sport, status, kickoff_at')
    .eq('id', APPROVED_PROVIDER_LINK.canonicalFixtureId)
    .maybeSingle()

  if (fixtureError) throw new Error(`canonical fixture load failed: ${fixtureError.message}`)

  checks.push({
    name: 'canonical_fixture_exists',
    pass: Boolean(fixture),
    detail: fixture ? null : 'approved canonical fixture not found',
  })

  if (fixture) {
    checks.push({
      name: 'fixture_is_scheduled_football',
      pass: fixture.sport === 'football' && fixture.status === 'scheduled',
      detail:
        fixture.sport === 'football' && fixture.status === 'scheduled'
          ? null
          : `sport=${fixture.sport}, status=${fixture.status}`,
    })

    const kickoff = kickoffMinuteUtc(fixture.kickoff_at)
    checks.push({
      name: 'kickoff_minute_matches_discovery',
      pass: kickoff === APPROVED_PROVIDER_LINK.kickoffMinuteUtc,
      detail:
        kickoff === APPROVED_PROVIDER_LINK.kickoffMinuteUtc
          ? null
          : `kickoff_at resolves to ${kickoff ?? 'null'}, expected ${APPROVED_PROVIDER_LINK.kickoffMinuteUtc}`,
    })
  }

  // Preflight 2 — the api_football provenance link that fed discovery's match
  // input must still be present.
  const { data: apiFootballLink, error: apiFootballError } = await supabase
    .from('fixture_provider_links')
    .select('canonical_fixture_id')
    .eq('provider', 'api_football')
    .eq('canonical_fixture_id', APPROVED_PROVIDER_LINK.canonicalFixtureId)
    .maybeSingle()

  if (apiFootballError) throw new Error(`api_football link load failed: ${apiFootballError.message}`)

  checks.push({
    name: 'api_football_provenance_link_exists',
    pass: Boolean(apiFootballLink),
    detail: apiFootballLink ? null : 'api_football link for the fixture is missing',
  })

  // Preflight 3 — the fixture must not already carry a sportmonks link
  // (identical link → idempotent alreadyLinked; different id → hard block).
  const { data: existingByFixture, error: existingByFixtureError } = await supabase
    .from('fixture_provider_links')
    .select('provider_fixture_id')
    .eq('provider', 'sportmonks')
    .eq('canonical_fixture_id', APPROVED_PROVIDER_LINK.canonicalFixtureId)
    .maybeSingle()

  if (existingByFixtureError) throw new Error(`sportmonks link load failed: ${existingByFixtureError.message}`)

  if (existingByFixture) {
    report.alreadyLinked = existingByFixture.provider_fixture_id === APPROVED_PROVIDER_LINK.providerFixtureId
    checks.push({
      name: 'no_conflicting_sportmonks_link_on_fixture',
      pass: report.alreadyLinked,
      detail: report.alreadyLinked
        ? 'identical link already present — idempotent, nothing to write'
        : `fixture already linked to sportmonks:${existingByFixture.provider_fixture_id}`,
    })
  } else {
    checks.push({ name: 'no_conflicting_sportmonks_link_on_fixture', pass: true, detail: null })
  }

  // Preflight 4 — the sportmonks fixture id must not be claimed by another
  // canonical fixture (UNIQUE(provider, provider_fixture_id) would reject the
  // insert anyway; checking first keeps the report explicit).
  const { data: claim, error: claimError } = await supabase
    .from('fixture_provider_links')
    .select('canonical_fixture_id')
    .eq('provider', 'sportmonks')
    .eq('provider_fixture_id', APPROVED_PROVIDER_LINK.providerFixtureId)
    .maybeSingle()

  if (claimError) throw new Error(`sportmonks claim load failed: ${claimError.message}`)

  const claimOk = !claim || claim.canonical_fixture_id === APPROVED_PROVIDER_LINK.canonicalFixtureId
  checks.push({
    name: 'provider_fixture_id_unclaimed',
    pass: claimOk,
    detail: claimOk ? null : `sportmonks:${APPROVED_PROVIDER_LINK.providerFixtureId} is already linked to another fixture`,
  })

  report.preflight.passed = checks.every((check) => check.pass)

  const shouldWrite =
    !params.dryRun && writeEnabled && operatorConfirmed && report.preflight.passed && !report.alreadyLinked

  if (!shouldWrite) return report

  const { error: insertError } = await supabase.from('fixture_provider_links').insert({
    canonical_fixture_id: APPROVED_PROVIDER_LINK.canonicalFixtureId,
    provider: APPROVED_PROVIDER_LINK.provider,
    provider_fixture_id: APPROVED_PROVIDER_LINK.providerFixtureId,
    mapping_confidence: APPROVED_PROVIDER_LINK.mappingConfidence,
    mapping_method: APPROVED_PROVIDER_LINK.mappingMethod,
    raw_provider_payload: {
      source: 'sportmonks-mapping-discovery',
      discoveryRunId: APPROVED_PROVIDER_LINK.discoveryRunId,
      candidate: DISCOVERY_CANDIDATE,
    },
    provider_updated_at: null,
    sync_run_id: report.linkWriteRunId,
  })

  if (insertError) {
    report.wrote = { insertedProviderLinks: 0, failedWrites: 1, errors: [safeErrorMessage(insertError)] }
    return report
  }

  report.wrote = { insertedProviderLinks: 1, failedWrites: 0, errors: [] }
  report.writes = 'single_provider_link'
  return report
}
