import type { EnrichmentAdapter, ProviderMeta } from '../types'
import { ProviderError } from '../errors'
import { getProviderEnv } from '../../env'
import { providerFetch } from '../http'

const BASE_URL = 'https://api.sportmonks.com/v3'

// M1.2.a: skeleton only. fetchEnrichment intentionally throws — enrichment
// writes are out of scope until a later milestone, and must respect
// migration 014's rule that mapping_confidence_at_write is written equal to
// the linked fixture_provider_links.mapping_confidence at insert/update time.
export class SportMonksAdapter implements EnrichmentAdapter {
  readonly provider = 'sportmonks' as const

  async fetchEnrichment(_: { providerFixtureId: string }): Promise<
    ProviderMeta & {
      xgHome?: number | null
      xgAway?: number | null
      predictions?: Record<string, unknown>
      matchFacts?: Record<string, unknown>
      momentum?: Record<string, unknown>
    }
  > {
    throw new ProviderError(
      this.provider,
      'unknown',
      'SportMonksAdapter.fetchEnrichment is an M1.2.a scaffold — enrichment sync is not implemented yet'
    )
  }

  // Read-only leagues check (per_page=1) — no enrichment data touched.
  async pingSmoke(): Promise<{ ok: true }> {
    const { SPORTMONKS_TOKEN } = getProviderEnv()
    await providerFetch(this.provider, `${BASE_URL}/football/leagues?per_page=1`, {
      headers: { Authorization: `Bearer ${SPORTMONKS_TOKEN}` },
    })
    return { ok: true }
  }
}
