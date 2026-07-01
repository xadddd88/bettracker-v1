import { getProviderEnv } from '../env'
import { ApiFootballAdapter } from './adapters/api-football'
import { SportMonksAdapter } from './adapters/sportmonks'
import { ApiTennisAdapter } from './adapters/api-tennis'
import { ProviderError } from './errors'
import type { ProviderName } from './types'

const PROVIDER_ENV_VAR_NAMES = ['API_FOOTBALL_KEY', 'SPORTMONKS_TOKEN', 'API_TENNIS_KEY']

export interface ProviderSmokeResult {
  provider: ProviderName
  ok: boolean
  message: string
}

export interface ProviderSmokeReport {
  ranSmoke: boolean
  missingEnv: string[]
  results: ProviderSmokeResult[]
}

// zod's "Required" issue message doesn't repeat the field name, so missing
// vars are detected here by presence check (name only, value never read) —
// getProviderEnv() itself is still the single source of truth for gating.
export function findMissingEnvNames(): string[] {
  return PROVIDER_ENV_VAR_NAMES.filter((name) => !process.env[name])
}

// Read-only: each adapter's pingSmoke() makes one minimal GET call and
// returns only {ok: true} or a sanitized ProviderError — no fixture/odds/
// results/enrichment data is fetched, logged, or written anywhere.
export async function runProviderSmoke(): Promise<ProviderSmokeReport> {
  try {
    getProviderEnv()
  } catch {
    return { ranSmoke: false, missingEnv: findMissingEnvNames(), results: [] }
  }

  const adapters: Array<{ provider: ProviderName; ping: () => Promise<{ ok: true }> }> = [
    { provider: 'api_football', ping: () => new ApiFootballAdapter().pingSmoke() },
    { provider: 'sportmonks', ping: () => new SportMonksAdapter().pingSmoke() },
    { provider: 'api_tennis', ping: () => new ApiTennisAdapter().pingSmoke() },
  ]

  const results: ProviderSmokeResult[] = []
  for (const { provider, ping } of adapters) {
    try {
      await ping()
      results.push({ provider, ok: true, message: 'token valid' })
    } catch (err) {
      const message = err instanceof ProviderError ? err.message : `${provider} smoke check failed (unknown error)`
      results.push({ provider, ok: false, message })
    }
  }

  return { ranSmoke: true, missingEnv: [], results }
}
