// Read-only provider connectivity check (M1.2.a). Does not write to
// Supabase, does not sync fixtures/odds/results, does not log raw payloads
// or token-bearing URLs — prints a sanitized ok/fail summary per provider.
//
// Run:  npm run smoke:providers

import { runProviderSmoke } from '../lib/providers/smoke'

async function main() {
  const report = await runProviderSmoke()

  if (!report.ranSmoke) {
    console.log('Provider smoke check skipped — missing env vars (values are never printed):')
    for (const name of report.missingEnv) {
      console.log(`  - ${name}`)
    }
    process.exitCode = 1
    return
  }

  console.log('Provider smoke check results:')
  let failed = 0
  for (const result of report.results) {
    console.log(`  ${result.ok ? '✅' : '❌'} ${result.provider} — ${result.message}`)
    if (!result.ok) failed++
  }
  process.exitCode = failed > 0 ? 1 : 0
}

main()
