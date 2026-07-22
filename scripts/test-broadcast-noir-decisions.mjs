#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFileSync(path.join(repoRoot, file), 'utf8')

const webFiles = [
  'app/(app)/analytics/page.tsx',
  'app/(app)/bankroll/BankrollView.tsx',
  'app/(app)/bankroll/page.tsx',
  'app/(app)/coach/CoachView.tsx',
  'app/(app)/coach/page.tsx',
  'app/(app)/decisions/page.tsx',
  'app/(app)/decisions/[id]/DecisionActions.tsx',
  'app/(app)/decisions/[id]/page.tsx',
  'app/(app)/scout/ScoutForm.tsx',
  'app/(app)/scout/page.tsx',
  'app/(app)/settings/SettingsForm.tsx',
  'app/(app)/settings/page.tsx',
]

const sources = Object.fromEntries(webFiles.map(file => [file, read(file)]))
for (const [file, source] of Object.entries(sources)) {
  assert.doesNotMatch(source, /border-black|bg-white|#e8ff00|text-\[(?:[0-9]|10)px\]/i, `${file} retains a legacy editorial token or microtext`)
  assert.doesNotMatch(source, /(?:text|bg|border)-(?:green|red|yellow|amber|blue|purple|indigo|gray|slate|night)-\d+|text-white/, `${file} retains a legacy palette class`)
  assert.match(source, /bn-|Broadcast(?:Panel|Button|Status|DataValue)/, `${file} is not connected to Broadcast Noir`)
}

const analytics = sources['app/(app)/analytics/page.tsx']
assert.match(analytics, /calcPerformance\(bets, decisions\)/)
assert.match(analytics, /currencySymbol\(currency\)/)
assert.match(analytics, /BroadcastDataValue/)

const bankroll = sources['app/(app)/bankroll/BankrollView.tsx']
assert.match(bankroll, /fetch\('\/api\/bankroll\/deposit'/)
assert.match(bankroll, /idempotency_key:\s*idemKey/)
assert.match(bankroll, /router\.refresh\(\)/)

const coach = sources['app/(app)/coach/CoachView.tsx']
assert.match(coach, /fetch\('\/api\/coach'/)
assert.match(coach, /settledBetsCount >= 5/)

const decisions = sources['app/(app)/decisions/page.tsx']
assert.match(decisions, /buildAnalystDecisionSurfaceView/)
assert.match(decisions, /surface\.isTrustBlocked/)

const decisionDetail = sources['app/(app)/decisions/[id]/page.tsx']
assert.match(decisionDetail, /shouldShowPricingStats/)
assert.match(decisionDetail, /showPricing &&/)
assert.match(decisionDetail, /rel="noopener noreferrer"/)
assert.match(decisionDetail, /BroadcastDataValue/)

const decisionActions = sources['app/(app)/decisions/[id]/DecisionActions.tsx']
assert.match(decisionActions, /place_bet_from_decision/)
assert.match(decisionActions, /update_decision_action/)

const scout = sources['app/(app)/scout/ScoutForm.tsx']
assert.match(scout, /fetch\('\/api\/scout'/)
assert.match(scout, /research relevance, not probability or price edge/)
assert.doesNotMatch(scout, /value\s*=\s*price edge/i)

const settings = sources['app/(app)/settings/SettingsForm.tsx']
assert.match(settings, /fetch\('\/api\/settings'/)
assert.match(settings, /role="switch"/)

const mobileStats = read('apps/mobile/src/app/(app)/stats.tsx')
const mobileMore = read('apps/mobile/src/app/(app)/more.tsx')
for (const [file, source] of [['stats.tsx', mobileStats], ['more.tsx', mobileMore]]) {
  assert.doesNotMatch(source, /#FFFFFF|fontSize:\s*(?:[0-9]|10)\b/, `${file} retains white literals or microtext`)
  assert.match(source, /semanticColors\./, `${file} does not use Broadcast Noir semantics`)
  assert.doesNotMatch(source, /fetch\(|supabase|create_tracked_bet/, `${file} adds a data boundary`)
}
assert.match(mobileStats, /No calculations are estimated/)
assert.match(mobileStats, /BroadcastDataValue|semanticColors\.dataValue/)
assert.match(mobileMore, /signOut/)
assert.match(mobileMore, /BroadcastStatus/)

console.log('Broadcast Noir PR F: stats, decisions, support surfaces and trust boundaries passed')
