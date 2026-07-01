import { z } from 'zod'

const providerEnvSchema = z.object({
  API_FOOTBALL_KEY: z.string().min(1, 'API_FOOTBALL_KEY is not set'),
  SPORTMONKS_TOKEN: z.string().min(1, 'SPORTMONKS_TOKEN is not set'),
  API_TENNIS_KEY: z.string().min(1, 'API_TENNIS_KEY is not set'),
})

export type ProviderEnv = z.infer<typeof providerEnvSchema>

let cached: ProviderEnv | null = null

// Called lazily inside each adapter's request path (never at module
// top-level) so missing keys fail loudly only when a sync/cron route
// actually runs — matches createAdminClient()'s deferred-throw
// convention (lib/supabase/admin.ts), keeping `next build` unaffected
// by missing secrets.
export function getProviderEnv(): ProviderEnv {
  if (cached) return cached

  const parsed = providerEnvSchema.safeParse({
    API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
    SPORTMONKS_TOKEN: process.env.SPORTMONKS_TOKEN,
    API_TENNIS_KEY: process.env.API_TENNIS_KEY,
  })

  if (!parsed.success) {
    throw new Error(
      `Provider env validation failed: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`
    )
  }

  cached = parsed.data
  return cached
}
