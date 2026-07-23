import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = (file) => readFileSync(path.join(root, file), 'utf8')

const webStats = source('app/(app)/analytics/page.tsx')
const performance = source('lib/analytics/performance.ts')
const webDecisions = source('app/(app)/decisions/page.tsx')
const webDecision = source('app/(app)/decisions/[id]/page.tsx')
const decisionActions = source('app/(app)/decisions/[id]/DecisionActions.tsx')
const mobileStats = source('apps/mobile/src/app/(app)/stats.tsx')
const mobilePerformance = source('apps/mobile/src/bets/performance.ts')
const mobileMore = source('apps/mobile/src/app/(app)/more.tsx')

for (const [name, file] of [
  ['Web Stats', webStats],
  ['Web Decisions', webDecisions],
  ['Web Decision detail', webDecision],
  ['Web Decision actions', decisionActions],
  ['Mobile Stats', mobileStats],
]) {
  assert.match(file, /Broadcast(?:Button|DataValue|Panel|Status)/, `${name} must use Broadcast Noir primitives`)
  assert.doesNotMatch(file, /(?:TimeWarpBackdrop|EditorialBackdrop|WarpRail|#E8FF00|#e8ff00|text-(?:green|red|yellow|purple|blue)-|bg-(?:green|red|yellow|purple|blue)-)/, `${name} retains a legacy theme/status surface`)
}

assert.match(webStats, /calcPerformance\(bets, decisions\)/)
assert.match(performance, /calcSettlementMetrics\(bets\)/)
assert.match(webStats, /unsupported or unknown status/)
assert.match(webStats, /No sample chart or estimated result is shown/)
assert.doesNotMatch(webStats, /(?:sampleData|mockData|placeholderChart|Math\.random)/)

assert.match(mobileStats, /fetchBets\(userId\)/)
assert.match(mobileStats, /calculateMobilePerformance\(bets\)/)
assert.match(mobileStats, /No sample chart or estimated result is shown/)
assert.match(mobilePerformance, /status === 'won' \|\| bet\.status === 'lost'/)
assert.match(mobilePerformance, /else if \(bet\.status === 'void'\)/)
assert.doesNotMatch(mobileStats, /(?:sampleData|mockData|placeholderChart|Math\.random)/)
assert.match(mobileMore, /router\.push\('\/\(app\)\/stats'\)/)

assert.match(webDecisions, /buildAnalystDecisionSurfaceView/)
assert.match(webDecision, /shouldShowPricingStats/)
assert.match(webDecision, /canPlaceBet=\{showPricing/)
assert.match(webDecision, /BroadcastStatus status=\{linkedBetStatusTone/)
assert.match(decisionActions, /place_bet_from_decision/)
assert.match(decisionActions, /update_decision_action/)

console.log('Broadcast Noir Stats and Decisions gate: PASS')
