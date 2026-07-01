import type { ProviderName } from './types'

// Static config only (M1.2.a) — maps our canonical competition names to each
// provider's own competition/league ID space. No DB table, no cron, no
// ingestion: this is scaffolding for the fixture-sync work in a later
// milestone. Extend this list by hand as competitions are onboarded.
export interface CompetitionMapEntry {
  canonicalName: string
  providerIds: Partial<Record<ProviderName, string>>
}

export const COMPETITION_MAP: readonly CompetitionMapEntry[] = [
  { canonicalName: 'English Premier League', providerIds: { api_football: '39' } },
  { canonicalName: 'Champions League', providerIds: { api_football: '2' } },
]

export function findCompetitionProviderId(
  canonicalName: string,
  provider: ProviderName
): string | undefined {
  return COMPETITION_MAP.find((entry) => entry.canonicalName === canonicalName)?.providerIds[provider]
}
