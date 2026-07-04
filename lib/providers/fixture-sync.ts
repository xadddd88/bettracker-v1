import { createAdminClient } from '../supabase/admin'
import { ApiFootballAdapter } from './adapters/api-football'
import { ApiTennisAdapter } from './adapters/api-tennis'
import type { CanonicalFixtureDraft, FixtureSyncAdapter, FixtureStatus, ProviderMeta } from './types'

export const FIXTURE_SYNC_WRITE_CONFIRMATION = 'WRITE_FIXTURE_SYNC_M1_2_B'
export const FIXTURE_SYNC_WRITE_MAX_FIXTURES = 25
export const DEFAULT_FIXTURE_SYNC_PROVIDERS = ['api_football', 'api_tennis'] as const
export const FIXTURE_SYNC_WRITE_SINGLE_PROVIDER_ERROR = 'write mode requires exactly one provider'
export const FIXTURE_SYNC_WRITE_SINGLE_DAY_ERROR = 'write mode requires dateFrom and dateTo to be the same day'

export type FixtureSyncProvider = (typeof DEFAULT_FIXTURE_SYNC_PROVIDERS)[number]

export class FixtureSyncSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FixtureSyncSafetyError'
  }
}

type FixtureDraftWithMeta = ProviderMeta & { fixture: CanonicalFixtureDraft }

export interface FixtureSyncParams {
  providers?: FixtureSyncProvider[]
  dateFrom: string
  dateTo: string
  competitionIds?: string[]
  dryRun: boolean
  operatorConfirm?: string
}

export interface FixtureSyncProviderSummary {
  provider: FixtureSyncProvider
  fetched: number
  bySport: Record<string, number>
  byStatus: Record<FixtureStatus, number>
  byCompetition: Record<string, number>
  wrote?: FixtureWriteSummary
}

export interface FixtureWriteSummary {
  insertedCanonicalFixtures: number
  updatedCanonicalFixtures: number
  insertedProviderLinks: number
  updatedProviderLinks: number
  failedWrites: number
  errors: Array<{ provider: FixtureSyncProvider; providerFixtureId: string; message: string }>
}

export interface FixtureSyncReport {
  syncRunId: string
  dryRun: boolean
  writeEnabled: boolean
  operatorConfirmed: boolean
  dateFrom: string
  dateTo: string
  providers: FixtureSyncProviderSummary[]
  totals: {
    fetched: number
    insertedCanonicalFixtures: number
    updatedCanonicalFixtures: number
    insertedProviderLinks: number
    updatedProviderLinks: number
    failedWrites: number
  }
}

function adapterFor(provider: FixtureSyncProvider): FixtureSyncAdapter {
  if (provider === 'api_football') return new ApiFootballAdapter()
  return new ApiTennisAdapter()
}

function nextSyncRunId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const random = Math.random().toString(36).slice(2, 10)
  return `fixture-sync-${stamp}-${random}`
}

function zeroStatusCounts(): Record<FixtureStatus, number> {
  return {
    scheduled: 0,
    live: 0,
    finished: 0,
    postponed: 0,
    cancelled: 0,
    abandoned: 0,
    retired: 0,
    walkover: 0,
  }
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1
}

function summarize(provider: FixtureSyncProvider, fixtures: FixtureDraftWithMeta[]): FixtureSyncProviderSummary {
  const bySport: Record<string, number> = {}
  const byStatus = zeroStatusCounts()
  const byCompetition: Record<string, number> = {}

  for (const item of fixtures) {
    increment(bySport, item.fixture.sport)
    byStatus[item.fixture.status]++
    increment(byCompetition, item.fixture.competitionName)
  }

  return {
    provider,
    fetched: fixtures.length,
    bySport,
    byStatus,
    byCompetition,
  }
}

function assertWriteRequestSafety(params: FixtureSyncParams, providers: FixtureSyncProvider[]): void {
  if (params.dryRun) return

  if (providers.length !== 1) {
    throw new FixtureSyncSafetyError(FIXTURE_SYNC_WRITE_SINGLE_PROVIDER_ERROR)
  }

  if (params.dateFrom !== params.dateTo) {
    throw new FixtureSyncSafetyError(FIXTURE_SYNC_WRITE_SINGLE_DAY_ERROR)
  }
}

function canonicalFixtureRow(fixture: CanonicalFixtureDraft) {
  return {
    sport: fixture.sport,
    competition_name: fixture.competitionName,
    competition_country: fixture.competitionCountry ?? null,
    season: fixture.season ?? null,
    round: fixture.round ?? null,
    kickoff_at: fixture.kickoffAt,
    status: fixture.status,
    home_ref: fixture.homeRef ?? null,
    away_ref: fixture.awayRef ?? null,
    participant_a_ref: fixture.participantARef ?? null,
    participant_b_ref: fixture.participantBRef ?? null,
    venue: fixture.venue ?? null,
    metadata: fixture.metadata ?? null,
  }
}

function safeWriteErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'unknown write error')
  }
  return 'unknown write error'
}

async function writeFixtures(
  provider: FixtureSyncProvider,
  fixtures: FixtureDraftWithMeta[],
  syncRunId: string
): Promise<FixtureWriteSummary> {
  const supabase = createAdminClient()
  const summary: FixtureWriteSummary = {
    insertedCanonicalFixtures: 0,
    updatedCanonicalFixtures: 0,
    insertedProviderLinks: 0,
    updatedProviderLinks: 0,
    failedWrites: 0,
    errors: [],
  }

  for (const item of fixtures) {
    try {
      const { data: existingLink, error: existingError } = await supabase
        .from('fixture_provider_links')
        .select('canonical_fixture_id')
        .eq('provider', provider)
        .eq('provider_fixture_id', item.providerFixtureId)
        .maybeSingle()

      if (existingError) throw existingError

      const canonical = canonicalFixtureRow(item.fixture)
      const link = {
        provider,
        provider_fixture_id: item.providerFixtureId,
        mapping_confidence: 'exact',
        mapping_method: 'provider_fixture_id',
        raw_provider_payload: item.rawProviderPayload,
        provider_updated_at: item.providerUpdatedAt ?? null,
        sync_run_id: syncRunId,
      }

      if (existingLink?.canonical_fixture_id) {
        const { error: fixtureUpdateError } = await supabase
          .from('canonical_fixtures')
          .update(canonical)
          .eq('id', existingLink.canonical_fixture_id)

        if (fixtureUpdateError) throw fixtureUpdateError

        const { error: linkUpdateError } = await supabase
          .from('fixture_provider_links')
          .update(link)
          .eq('provider', provider)
          .eq('provider_fixture_id', item.providerFixtureId)

        if (linkUpdateError) throw linkUpdateError

        summary.updatedCanonicalFixtures++
        summary.updatedProviderLinks++
        continue
      }

      const { data: insertedFixture, error: fixtureInsertError } = await supabase
        .from('canonical_fixtures')
        .insert(canonical)
        .select('id')
        .single()

      if (fixtureInsertError) throw fixtureInsertError
      if (!insertedFixture?.id) throw new Error('canonical fixture insert returned no id')

      const { error: linkInsertError } = await supabase.from('fixture_provider_links').insert({
        ...link,
        canonical_fixture_id: insertedFixture.id,
      })

      if (linkInsertError) throw linkInsertError

      summary.insertedCanonicalFixtures++
      summary.insertedProviderLinks++
    } catch (error) {
      summary.failedWrites++
      summary.errors.push({
        provider,
        providerFixtureId: item.providerFixtureId,
        message: safeWriteErrorMessage(error),
      })
    }
  }

  return summary
}

export async function runFixtureSync(params: FixtureSyncParams): Promise<FixtureSyncReport> {
  const providers = params.providers?.length ? params.providers : [...DEFAULT_FIXTURE_SYNC_PROVIDERS]
  assertWriteRequestSafety(params, providers)

  const syncRunId = nextSyncRunId()
  const writeEnabled = process.env.SPORTS_FIXTURE_SYNC_WRITE_ENABLED === 'true'
  const operatorConfirmed = params.operatorConfirm === FIXTURE_SYNC_WRITE_CONFIRMATION
  const shouldWrite = !params.dryRun && writeEnabled && operatorConfirmed

  const providerSummaries: FixtureSyncProviderSummary[] = []

  for (const provider of providers) {
    const adapter = adapterFor(provider)
    const fixtures = await adapter.fetchFixtures({
      competitionIds: params.competitionIds,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    })

    const summary = summarize(provider, fixtures)
    if (!params.dryRun && fixtures.length > FIXTURE_SYNC_WRITE_MAX_FIXTURES) {
      throw new FixtureSyncSafetyError(
        `fetched fixtures exceed M1.2.c write safety cap of ${FIXTURE_SYNC_WRITE_MAX_FIXTURES}`
      )
    }

    if (shouldWrite) {
      summary.wrote = await writeFixtures(provider, fixtures, syncRunId)
    }
    providerSummaries.push(summary)
  }

  return {
    syncRunId,
    dryRun: params.dryRun,
    writeEnabled,
    operatorConfirmed,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    providers: providerSummaries,
    totals: providerSummaries.reduce(
      (acc, provider) => {
        acc.fetched += provider.fetched
        acc.insertedCanonicalFixtures += provider.wrote?.insertedCanonicalFixtures ?? 0
        acc.updatedCanonicalFixtures += provider.wrote?.updatedCanonicalFixtures ?? 0
        acc.insertedProviderLinks += provider.wrote?.insertedProviderLinks ?? 0
        acc.updatedProviderLinks += provider.wrote?.updatedProviderLinks ?? 0
        acc.failedWrites += provider.wrote?.failedWrites ?? 0
        return acc
      },
      {
        fetched: 0,
        insertedCanonicalFixtures: 0,
        updatedCanonicalFixtures: 0,
        insertedProviderLinks: 0,
        updatedProviderLinks: 0,
        failedWrites: 0,
      }
    ),
  }
}
